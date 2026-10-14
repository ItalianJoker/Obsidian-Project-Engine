/**
 * @file projectArchive.ts
 * @purpose Move a project containment folder into the configured archive root.
 * @dependencies vaultIo, projectPaths, projectIo, folderPaths
 * @usedBy ProjectOverviewView Actions
 *
 * On confirm: ensure archive folder exists, set YAML `archived: true`, then
 * `fileManager.renameFile` the project folder. Collision-safe destination names.
 */

import { Notice, TFile, TFolder, type App } from "obsidian";
import type { ProjectsEngineSettings } from "../models/types";
import { normalizeVaultFolder, pathUnderFolder } from "./folderPaths";
import { isDedicatedProjectFolder } from "./projectDelete";
import { containingProjectFolder } from "./projectPaths";
import { patchProjectFrontmatter } from "./projectIo";
import { ensureFolder, joinVaultPath } from "./vaultIo";

/**
 * Resolve the configured archived-projects folder (normalised).
 */
export function archivedProjectsFolderPath(settings: ProjectsEngineSettings): string {
	return normalizeVaultFolder(
		settings.archivedProjectsFolder || "Projects_Archived",
		"Projects_Archived",
	);
}

/**
 * Resolve the active projects root (normalised).
 */
export function projectsFolderPath(settings: ProjectsEngineSettings): string {
	return normalizeVaultFolder(settings.projectsFolder || "Projects", "Projects");
}

/**
 * True when a project should be treated as archived (YAML flag or path under archive root).
 */
export function isProjectArchived(
	args: {
		archived?: boolean;
		filePath: string;
	},
	settings: ProjectsEngineSettings,
): boolean {
	if (args.archived === true) {
		return true;
	}
	return pathUnderFolder(args.filePath, archivedProjectsFolderPath(settings));
}

/**
 * Pick a collision-free destination folder path under the archive root.
 *
 * @param vault - Active vault.
 * @param archiveRoot - Normalised archive folder.
 * @param basename - Project folder basename to place under the archive root.
 */
export function uniqueArchiveDestination(
	vault: { getAbstractFileByPath: (path: string) => unknown },
	archiveRoot: string,
	basename: string,
): string {
	const base = joinVaultPath(archiveRoot, basename);
	if (!vault.getAbstractFileByPath(base)) {
		return base;
	}
	for (let i = 2; i < 1000; i++) {
		const candidate = `${base} (${i})`;
		if (!vault.getAbstractFileByPath(candidate)) {
			return candidate;
		}
	}
	return `${base} (${Date.now()})`;
}

/**
 * Archive a project: mark frontmatter, ensure archive folder, rename containment folder.
 *
 * @returns New project-note path after the move (or same path when only the note was flagged).
 */
export async function archiveProjectFolder(args: {
	app: App;
	projectFile: TFile;
	settings: ProjectsEngineSettings;
}): Promise<{ archivedPath: string; moved: boolean }> {
	const { app, projectFile, settings } = args;
	const archiveRoot = archivedProjectsFolderPath(settings);
	const projectsRoot = projectsFolderPath(settings);

	await ensureFolder(app.vault, archiveRoot);

	await patchProjectFrontmatter(app.vault, projectFile, (data) => {
		data.archived = true;
	});

	// Reload file reference after frontmatter patch (same path).
	const note =
		app.vault.getAbstractFileByPath(projectFile.path) instanceof TFile
			? (app.vault.getAbstractFileByPath(projectFile.path) as TFile)
			: projectFile;

	const parentPath = containingProjectFolder(note.path);
	const parent = parentPath ? app.vault.getAbstractFileByPath(parentPath) : null;

	if (
		parent instanceof TFolder &&
		isDedicatedProjectFolder(parent.path, projectsRoot) &&
		!pathUnderFolder(parent.path, archiveRoot)
	) {
		const basename = parent.name;
		const destination = uniqueArchiveDestination(app.vault, archiveRoot, basename);
		// Ensure intermediate parents exist (archive root already created).
		const destParent = archiveRoot;
		await ensureFolder(app.vault, destParent);
		await app.fileManager.renameFile(parent, destination);
		const newNotePath = joinVaultPath(destination, note.name);
		return { archivedPath: newNotePath, moved: true };
	}

	// Legacy flat layout: move only the project note into the archive root.
	if (!pathUnderFolder(note.path, archiveRoot)) {
		const destination = uniqueArchiveDestination(
			app.vault,
			archiveRoot,
			note.basename,
		);
		const destFile = destination.endsWith(".md") ? destination : `${destination}.md`;
		if (app.vault.getAbstractFileByPath(destFile)) {
			throw new Error(`Archive destination already exists: ${destFile}`);
		}
		await app.fileManager.renameFile(note, destFile);
		return { archivedPath: destFile, moved: true };
	}

	return { archivedPath: note.path, moved: false };
}

/**
 * English notice after a successful archive.
 */
export function notifyProjectArchived(archivedPath: string, moved: boolean): void {
	new Notice(
		moved
			? `Project archived: ${archivedPath}`
			: `Project marked archived: ${archivedPath}`,
	);
}
