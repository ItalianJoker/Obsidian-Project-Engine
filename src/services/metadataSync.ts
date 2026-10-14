/**
 * @file metadataSync.ts
 * @purpose Scan configured plugin folders and normalise PE frontmatter / tags.
 * @dependencies frontmatter, folderPaths, vault.process via vaultIo
 * @usedBy Settings → Sync & Rebuild Note Metadata
 *
 * Safe and idempotent: only writes when tags or missing pe_type need repair.
 * Does not invent project ids beyond basename fallbacks for bare project notes.
 */

import type { App, Vault } from "obsidian";
import type { ProjectsEngineSettings } from "../models/types";
import {
	buildMarkdownNote,
	ensurePeFrontmatterTags,
	splitFrontmatter,
} from "./frontmatter";
import { normalizeVaultFolder, pathUnderFolder } from "./folderPaths";
import { processNote } from "./vaultIo";

/**
 * Result of a metadata synchronisation pass.
 */
export interface MetadataSyncResult {
	/** Markdown files examined under configured folders. */
	checked: number;
	/** Files whose frontmatter was rewritten. */
	updated: number;
	/** Files skipped (no PE relevance or no changes). */
	skipped: number;
}

/**
 * Collect vault-relative folder roots the plugin owns / scans.
 */
export function configuredPluginFolders(settings: ProjectsEngineSettings): string[] {
	const roots = [
		normalizeVaultFolder(settings.projectsFolder || "Projects", "Projects"),
		normalizeVaultFolder(
			settings.archivedProjectsFolder || "Projects_Archived",
			"Projects_Archived",
		),
		normalizeVaultFolder(
			settings.customersFolder || "Projects/Entities/Customers",
			"Projects/Entities/Customers",
		),
		normalizeVaultFolder(
			settings.teamMembersFolder || "Projects/Entities/Team Members",
			"Projects/Entities/Team Members",
		),
		normalizeVaultFolder(
			settings.projectTypesFolder || "Projects/Entities/Project Types",
			"Projects/Entities/Project Types",
		),
		normalizeVaultFolder(
			settings.technologiesFolder || "Projects/Entities/Technologies",
			"Projects/Entities/Technologies",
		),
		normalizeVaultFolder(
			settings.stakeholdersFolder || "Projects/Entities/Stakeholders",
			"Projects/Entities/Stakeholders",
		),
		normalizeVaultFolder(
			settings.taskListTemplatesFolder || "Projects/Entities/Task List Templates",
			"Projects/Entities/Task List Templates",
		),
		normalizeVaultFolder(settings.templatesFolder || "Templates", "Templates"),
		normalizeVaultFolder(settings.tasksFolder || "Projects/Tasks", "Projects/Tasks"),
	];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const root of roots) {
		if (!seen.has(root)) {
			seen.add(root);
			out.push(root);
		}
	}
	return out;
}

/**
 * Infer pe_type from folder when frontmatter lacks it (catalogue / project roots).
 */
export function inferPeTypeFromPath(
	filePath: string,
	settings: ProjectsEngineSettings,
): string | null {
	if (pathUnderFolder(filePath, settings.customersFolder)) return "customer";
	if (pathUnderFolder(filePath, settings.teamMembersFolder)) return "stakeholder";
	if (pathUnderFolder(filePath, settings.projectTypesFolder)) return "project-type";
	if (pathUnderFolder(filePath, settings.technologiesFolder)) return "technology";
	if (pathUnderFolder(filePath, settings.stakeholdersFolder)) return "stakeholder";
	if (pathUnderFolder(filePath, settings.taskListTemplatesFolder)) {
		return "task-list-template";
	}
	if (pathUnderFolder(filePath, settings.tasksFolder)) return "task";

	const projectsRoot = normalizeVaultFolder(
		settings.projectsFolder || "Projects",
		"Projects",
	);
	const archiveRoot = normalizeVaultFolder(
		settings.archivedProjectsFolder || "Projects_Archived",
		"Projects_Archived",
	);
	for (const root of [projectsRoot, archiveRoot]) {
		if (!pathUnderFolder(filePath, root)) continue;
		const parts = filePath.replace(/\\/g, "/").split("/");
		if (parts.length >= 2) {
			const fileName = parts[parts.length - 1] ?? "";
			const parentName = parts[parts.length - 2] ?? "";
			const base = fileName.replace(/\.md$/i, "");
			if (base && parentName && base === parentName) {
				return "project";
			}
		}
	}
	return null;
}

/**
 * Apply tag / pe_type normalisation to one note. Returns whether content changed.
 */
export function normaliseNoteMetadataContent(
	markdown: string,
	filePath: string,
	settings: ProjectsEngineSettings,
): { next: string; changed: boolean } {
	const { data, body } = splitFrontmatter(markdown);
	let peType = typeof data.pe_type === "string" ? data.pe_type.trim() : "";
	let mutated = false;

	if (!peType) {
		const inferred = inferPeTypeFromPath(filePath, settings);
		if (!inferred) {
			return { next: markdown, changed: false };
		}
		data.pe_type = inferred;
		peType = inferred;
		mutated = true;
		const base = (filePath.replace(/\\/g, "/").split("/").pop() ?? "").replace(
			/\.md$/i,
			"",
		);
		if (
			(peType === "customer" ||
				peType === "stakeholder" ||
				peType === "project-type" ||
				peType === "technology" ||
				peType === "task-list-template") &&
			typeof data.name !== "string"
		) {
			data.name = base;
			mutated = true;
		}
		if (peType === "project") {
			if (typeof data.name !== "string") {
				data.name = base;
				mutated = true;
			}
			if (typeof data.id !== "string") {
				data.id = base;
				mutated = true;
			}
		}
	}

	const tagsBefore = JSON.stringify(data.tags ?? null);
	const enriched = ensurePeFrontmatterTags(data);
	const tagsAfter = JSON.stringify(enriched.tags ?? null);
	if (!mutated && tagsBefore === tagsAfter) {
		return { next: markdown, changed: false };
	}

	const next = buildMarkdownNote(enriched, body);
	return { next, changed: next !== markdown };
}

/**
 * Scan configured folders, repair missing pe_type / tags, return counts.
 */
export async function syncAndRebuildNoteMetadata(args: {
	app: App;
	vault: Vault;
	settings: ProjectsEngineSettings;
	/** Optional indexer rebuild after updates. */
	onIndexRebuild?: () => void;
}): Promise<MetadataSyncResult> {
	const { vault, settings, onIndexRebuild } = args;
	const folders = configuredPluginFolders(settings);
	const files = vault
		.getMarkdownFiles()
		.filter((file) => folders.some((folder) => pathUnderFolder(file.path, folder)));

	let checked = 0;
	let updated = 0;
	let skipped = 0;

	for (const file of files) {
		checked += 1;
		let didUpdate = false;
		await processNote(vault, file, (current) => {
			const { next, changed } = normaliseNoteMetadataContent(
				current,
				file.path,
				settings,
			);
			didUpdate = changed;
			return changed ? next : current;
		});
		if (didUpdate) {
			updated += 1;
		} else {
			skipped += 1;
		}
	}

	onIndexRebuild?.();
	return { checked, updated, skipped };
}

/**
 * English completion notice copy.
 */
export function metadataSyncNotice(result: MetadataSyncResult): string {
	return `Metadata synchronization complete: ${result.checked} files checked`;
}
