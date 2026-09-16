/**
 * File-based project documents tree (§8 project home).
 *
 * Scans the project containment folder via the Obsidian vault API — no index
 * notes or sidecar files. The configured Tasks folder is excluded entirely so
 * the Overview does not duplicate the task dashboard.
 */

import { TFile, TFolder, type Vault } from "obsidian";

/**
 * One node in the Overview documents tree.
 *
 * Folders always carry a `children` array (possibly empty). Files omit it.
 */
export interface ProjectDocumentNode {
	/** Display name (basename, no path). */
	name: string;
	/** Vault-relative path. */
	path: string;
	kind: "folder" | "file";
	/** Present only for folders; sorted folders-first then A→Z by name. */
	children?: ProjectDocumentNode[];
}

/**
 * Options controlling which project-folder entries appear in the tree.
 */
export interface ProjectDocumentsScanOptions {
	/**
	 * Folder basename to exclude at the project root (default Tasks).
	 * Matching is case-sensitive against the configured scaffold name.
	 */
	excludeRootFolderName: string;
	/**
	 * Vault paths to omit (typically the project note itself — already
	 * reachable via “Open note”).
	 */
	excludeFilePaths?: readonly string[];
}

/**
 * Build a documents tree for one project folder.
 *
 * @returns Top-level nodes (folders and files) under the project folder,
 * excluding the Tasks tree and any paths listed in {@link ProjectDocumentsScanOptions.excludeFilePaths}.
 */
export function buildProjectDocumentsTree(
	vault: Vault,
	projectFolderPath: string,
	options: ProjectDocumentsScanOptions,
): ProjectDocumentNode[] {
	const normalisedRoot = projectFolderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!normalisedRoot) {
		return [];
	}

	const abstract = vault.getAbstractFileByPath(normalisedRoot);
	if (!(abstract instanceof TFolder)) {
		return [];
	}

	const excludeName = options.excludeRootFolderName.trim() || "Tasks";
	const excludeFiles = new Set(
		(options.excludeFilePaths ?? []).map((path) => path.replace(/\\/g, "/")),
	);

	return mapChildren(abstract, excludeName, excludeFiles, true);
}

/**
 * Recursively map folder children into sorted document nodes.
 *
 * @param folder - Current vault folder.
 * @param excludeRootFolderName - Tasks folder basename; applied only at project root.
 * @param excludeFiles - Absolute vault paths to skip.
 * @param atProjectRoot - When true, skip the configured Tasks folder.
 */
function mapChildren(
	folder: TFolder,
	excludeRootFolderName: string,
	excludeFiles: Set<string>,
	atProjectRoot: boolean,
): ProjectDocumentNode[] {
	const folders: ProjectDocumentNode[] = [];
	const files: ProjectDocumentNode[] = [];

	for (const child of folder.children) {
		if (child instanceof TFolder) {
			if (atProjectRoot && child.name === excludeRootFolderName) {
				continue;
			}
			folders.push({
				name: child.name,
				path: child.path,
				kind: "folder",
				children: mapChildren(child, excludeRootFolderName, excludeFiles, false),
			});
			continue;
		}

		if (child instanceof TFile) {
			const path = child.path.replace(/\\/g, "/");
			if (excludeFiles.has(path)) {
				continue;
			}
			files.push({
				name: child.name,
				path: child.path,
				kind: "file",
			});
		}
	}

	const byName = (a: ProjectDocumentNode, b: ProjectDocumentNode): number =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

	folders.sort(byName);
	files.sort(byName);
	return [...folders, ...files];
}

/**
 * Resolve the configured Tasks folder basename for exclusion.
 */
export function tasksFolderBasename(configured: string | undefined): string {
	const trimmed = (configured ?? "").trim();
	return trimmed || "Tasks";
}
