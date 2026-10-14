/**
 * @file metadataSync.ts
 * @purpose Scan configured plugin folders and normalise PE frontmatter / tags.
 * @dependencies frontmatter, folderPaths, projectPaths, vault.process via vaultIo
 * @usedBy Settings → Sync & Rebuild Note Metadata
 *
 * Safe and idempotent: merges missing pe_type / tags / project links without
 * deleting user keys. Project-tree notes (any nested depth under a project
 * folder) are owned via path resolution — including files moved in via the OS.
 * Project notes also sync YAML `archived` to match Projects vs Archived folder.
 */

import type { App, Vault } from "obsidian";
import { toWikiLink, type ProjectsEngineSettings } from "../models/types";
import {
	buildGraphLinksSection,
	buildMarkdownNote,
	ensurePeFrontmatterTags,
	splitFrontmatter,
} from "./frontmatter";
import { normalizeVaultFolder, pathUnderFolder } from "./folderPaths";
import { expectedArchivedFromPath } from "./projectArchive";
import { PROJECT_DOCUMENT_PE_TYPE } from "./projectDocumentNote";
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
 * Owning project resolved from a vault path (folder containment).
 */
export interface ProjectOwnership {
	/** Vault-relative project folder (`Projects/PRJ - Demo`). */
	folderPath: string;
	/** Project note basename (no `.md`). */
	noteBasename: string;
	/** YAML `id` when known; otherwise basename. */
	projectId: string;
	/** Canonical project wikilink (`[[PRJ - Demo]]`). */
	projectWikiLink: string;
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
 * True when a path sits under the shared Entities catalogue (not a project tree).
 */
export function isUnderEntitiesCatalogue(
	filePath: string,
	settings: ProjectsEngineSettings,
): boolean {
	const projectsRoot = normalizeVaultFolder(
		settings.projectsFolder || "Projects",
		"Projects",
	);
	const entities = normalizeVaultFolder(`${projectsRoot}/Entities`, `${projectsRoot}/Entities`);
	if (pathUnderFolder(filePath, entities)) {
		return true;
	}
	// Custom catalogue overrides still count as non-project trees.
	const catalogues = [
		settings.customersFolder,
		settings.teamMembersFolder,
		settings.projectTypesFolder,
		settings.technologiesFolder,
		settings.stakeholdersFolder,
		settings.taskListTemplatesFolder,
	];
	return catalogues.some((folder) => pathUnderFolder(filePath, folder || ""));
}

/**
 * Infer pe_type from folder when frontmatter lacks it (catalogue / project roots).
 *
 * Project **trees** (nested docs/tasks) are handled via {@link resolveProjectOwnership}
 * + {@link inferPeTypeForProjectTreeNote}, not this helper alone.
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
		if (isUnderEntitiesCatalogue(filePath, settings)) continue;
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
 * Infer pe_type for a note inside a known project folder tree.
 */
export function inferPeTypeForProjectTreeNote(
	filePath: string,
	ownership: ProjectOwnership,
	settings: ProjectsEngineSettings,
): string {
	const normalised = filePath.replace(/\\/g, "/");
	const projectNotePath = `${ownership.folderPath}/${ownership.noteBasename}.md`;
	if (normalised === projectNotePath) {
		return "project";
	}
	const tasksFolder = (
		settings.scaffoldTasksFolder || "Tasks"
	)
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	const relative = normalised.startsWith(`${ownership.folderPath}/`)
		? normalised.slice(ownership.folderPath.length + 1)
		: "";
	const firstSeg = relative.split("/")[0] ?? "";
	if (tasksFolder && firstSeg === tasksFolder) {
		return "task";
	}
	return PROJECT_DOCUMENT_PE_TYPE;
}

/**
 * Build ownership index from project notes (pe_type or folder convention).
 *
 * Longer folder paths win when looking up nested notes (longest-prefix match).
 */
export function buildProjectOwnershipIndex(
	app: App,
	settings: ProjectsEngineSettings,
): ProjectOwnership[] {
	const byFolder = new Map<string, ProjectOwnership>();
	const projectsRoot = normalizeVaultFolder(
		settings.projectsFolder || "Projects",
		"Projects",
	);
	const archiveRoot = normalizeVaultFolder(
		settings.archivedProjectsFolder || "Projects_Archived",
		"Projects_Archived",
	);

	for (const file of app.vault.getMarkdownFiles()) {
		const path = file.path.replace(/\\/g, "/");
		if (isUnderEntitiesCatalogue(path, settings)) {
			continue;
		}
		const underRoot =
			pathUnderFolder(path, projectsRoot) || pathUnderFolder(path, archiveRoot);
		if (!underRoot) {
			continue;
		}

		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const peType = typeof fm?.pe_type === "string" ? fm.pe_type.trim() : "";
		const parentSlash = path.lastIndexOf("/");
		const folderPath = parentSlash > 0 ? path.slice(0, parentSlash) : "";
		const base = file.basename;
		// Convention: project note is a direct child of Projects/ or archive root
		// named the same as its folder (`Projects/Foo/Foo.md`), not nested docs.
		const isConventionProject =
			folderPath === `${projectsRoot}/${base}` ||
			folderPath === `${archiveRoot}/${base}`;
		const isProjectNote = peType === "project" || isConventionProject;
		if (!isProjectNote || !folderPath) {
			continue;
		}

		const projectId =
			typeof fm?.id === "string" && fm.id.trim()
				? fm.id.trim()
				: base;
		const ownership: ProjectOwnership = {
			folderPath,
			noteBasename: base,
			projectId,
			projectWikiLink: toWikiLink(base),
		};
		const existing = byFolder.get(folderPath);
		// Prefer an explicit pe_type: project over bare convention.
		if (!existing || peType === "project") {
			byFolder.set(folderPath, ownership);
		}
	}

	return [...byFolder.values()].sort(
		(a, b) => b.folderPath.length - a.folderPath.length,
	);
}

/**
 * Resolve the owning project for a note path (longest matching project folder).
 */
export function resolveProjectOwnership(
	filePath: string,
	index: readonly ProjectOwnership[],
	settings: ProjectsEngineSettings,
): ProjectOwnership | null {
	const path = filePath.replace(/\\/g, "/");
	if (isUnderEntitiesCatalogue(path, settings)) {
		return null;
	}
	for (const ownership of index) {
		if (
			path === `${ownership.folderPath}/${ownership.noteBasename}.md` ||
			pathUnderFolder(path, ownership.folderPath)
		) {
			return ownership;
		}
	}
	return null;
}

/**
 * Ensure body contains a Graph `## Links` entry for the project wikilink.
 * Preserves existing body content; appends when missing.
 */
export function ensureProjectLinkInBody(body: string, projectWikiLink: string): string {
	const trimmed = body.replace(/^\s+/, "");
	if (!projectWikiLink.trim()) {
		return trimmed;
	}
	if (trimmed.includes(projectWikiLink)) {
		return trimmed;
	}
	if (/^##\s*Links\b/m.test(trimmed)) {
		return `${trimmed.replace(/\s*$/, "")}\n- Project: ${projectWikiLink}\n`;
	}
	const links = buildGraphLinksSection([
		{ label: "Project", wikiLink: projectWikiLink },
	]);
	if (!trimmed) {
		return links;
	}
	return `${trimmed.replace(/\s*$/, "")}\n\n${links}`;
}

/**
 * Apply tag / pe_type / project-link normalisation to one note.
 *
 * @param ownership - Owning project when the note lives under a project tree.
 */
export function normaliseNoteMetadataContent(
	markdown: string,
	filePath: string,
	settings: ProjectsEngineSettings,
	ownership: ProjectOwnership | null = null,
): { next: string; changed: boolean } {
	const { data, body } = splitFrontmatter(markdown);
	let peType = typeof data.pe_type === "string" ? data.pe_type.trim() : "";
	let mutated = false;
	let nextBody = body;
	const base = (filePath.replace(/\\/g, "/").split("/").pop() ?? "").replace(
		/\.md$/i,
		"",
	);

	if (!peType) {
		let inferred: string | null = null;
		if (ownership) {
			inferred = inferPeTypeForProjectTreeNote(filePath, ownership, settings);
		} else {
			inferred = inferPeTypeFromPath(filePath, settings);
		}
		if (!inferred) {
			return { next: markdown, changed: false };
		}
		data.pe_type = inferred;
		peType = inferred;
		mutated = true;
	}

	if (
		(peType === "customer" ||
			peType === "stakeholder" ||
			peType === "project-type" ||
			peType === "technology" ||
			peType === "task-list-template" ||
			peType === PROJECT_DOCUMENT_PE_TYPE) &&
		typeof data.name !== "string"
	) {
		data.name = base;
		mutated = true;
	}

	if (peType === "project") {
		if (typeof data.name !== "string") {
			data.name = ownership?.noteBasename || base;
			mutated = true;
		}
		if (typeof data.id !== "string") {
			data.id = ownership?.projectId || base;
			mutated = true;
		}
		// Align YAML `archived` with folder location after OS / explorer moves.
		const expectedArchived = expectedArchivedFromPath(filePath, settings);
		if (expectedArchived !== null) {
			const currentArchived = data.archived === true;
			if (currentArchived !== expectedArchived) {
				data.archived = expectedArchived;
				mutated = true;
			}
		}
	}

	// Bind nested project notes to their owning project (merge, never wipe).
	if (
		ownership &&
		peType !== "project" &&
		(peType === "task" ||
			peType === PROJECT_DOCUMENT_PE_TYPE ||
			peType === "prince2-register" ||
			peType === "prince2-register-entry" ||
			peType === "prince2-document" ||
			peType === "prince2-stage" ||
			peType === "work-package")
	) {
		if (typeof data.project !== "string" || !data.project.trim()) {
			data.project = ownership.projectWikiLink;
			mutated = true;
		}
		if (
			(peType === "task" || peType === PROJECT_DOCUMENT_PE_TYPE) &&
			(typeof data.project_id !== "string" || !data.project_id.trim())
		) {
			data.project_id = ownership.projectId;
			mutated = true;
		}
		if (peType === "task" && (typeof data.title !== "string" || !data.title.trim())) {
			data.title = base;
			mutated = true;
		}
		if (peType === "task" && (typeof data.id !== "string" || !data.id.trim())) {
			// Stable placeholder id — does not invent a global sequence.
			data.id = `${ownership.projectId}#${base}`;
			mutated = true;
		}

		const linked = ensureProjectLinkInBody(nextBody, ownership.projectWikiLink);
		if (linked !== nextBody) {
			nextBody = linked;
			mutated = true;
		}
	}

	const tagsBefore = JSON.stringify(data.tags ?? null);
	// Ensure pe/<id> tags for project-bound notes even when only `project` wikilink exists.
	if (
		ownership &&
		peType !== "project" &&
		(typeof data.project_id !== "string" || !data.project_id.trim())
	) {
		// project_id already set above for task/document; for other types seed for tags only when missing.
		if (
			peType === "prince2-register" ||
			peType === "prince2-register-entry" ||
			peType === "prince2-document" ||
			peType === "prince2-stage" ||
			peType === "work-package"
		) {
			data.project_id = ownership.projectId;
			mutated = true;
		}
	}
	const enriched = ensurePeFrontmatterTags(data);
	const tagsAfter = JSON.stringify(enriched.tags ?? null);
	if (!mutated && tagsBefore === tagsAfter && nextBody === body) {
		return { next: markdown, changed: false };
	}

	const next = buildMarkdownNote(enriched, nextBody);
	return { next, changed: next !== markdown };
}

/**
 * Scan configured folders (recursive via vault markdown index), repair metadata.
 */
export async function syncAndRebuildNoteMetadata(args: {
	app: App;
	vault: Vault;
	settings: ProjectsEngineSettings;
	/** Optional indexer rebuild after updates. */
	onIndexRebuild?: () => void;
}): Promise<MetadataSyncResult> {
	const { app, vault, settings, onIndexRebuild } = args;
	const folders = configuredPluginFolders(settings);
	const ownershipIndex = buildProjectOwnershipIndex(app, settings);
	const files = vault
		.getMarkdownFiles()
		.filter((file) => folders.some((folder) => pathUnderFolder(file.path, folder)));

	let checked = 0;
	let updated = 0;
	let skipped = 0;

	for (const file of files) {
		checked += 1;
		const ownership = resolveProjectOwnership(file.path, ownershipIndex, settings);
		let didUpdate = false;
		await processNote(vault, file, (current) => {
			const { next, changed } = normaliseNoteMetadataContent(
				current,
				file.path,
				settings,
				ownership,
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
 * English completion notice copy (checked + updated counts).
 */
export function metadataSyncNotice(result: MetadataSyncResult): string {
	return `Metadata synchronization complete: ${result.checked} files checked (${result.updated} updated)`;
}
