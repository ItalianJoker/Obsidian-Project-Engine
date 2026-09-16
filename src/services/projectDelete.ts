/**
 * Delete a project folder (confirmation is UI-side) via Obsidian vault APIs.
 *
 * Removes the entire project containment folder when the project note lives
 * inside `{ID} - {Name}/`. Falls back to deleting only the note if the parent
 * is the projects root or vault root (legacy flat layout).
 */

import { Notice, TFile, TFolder, type App, type Vault } from "obsidian";
import { containingProjectFolder } from "./projectPaths";

/**
 * True when `folderPath` looks like a dedicated project folder (not the
 * projects root itself and not empty).
 */
export function isDedicatedProjectFolder(
	folderPath: string,
	projectsRoot: string,
): boolean {
	const folder = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	const root = projectsRoot.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	if (!folder || folder === root) {
		return false;
	}
	// Must be a direct child of the projects root (or nested under it).
	return root ? folder.startsWith(root + "/") : folder.includes(" - ");
}

/**
 * Delete the project note and, when safe, its containment folder recursively.
 *
 * Prefer `vault.trash` when available so users can recover from system trash;
 * otherwise `vault.delete`.
 */
export async function deleteProjectFolder(args: {
	app: App;
	vault: Vault;
	projectFile: TFile;
	projectsRoot: string;
}): Promise<{ deletedPath: string; trashed: boolean }> {
	const { vault, projectFile, projectsRoot } = args;
	const parentPath = containingProjectFolder(projectFile.path);
	const parent = parentPath ? vault.getAbstractFileByPath(parentPath) : null;

	if (parent instanceof TFolder && isDedicatedProjectFolder(parent.path, projectsRoot)) {
		const trashed = await trashOrDelete(vault, parent);
		return { deletedPath: parent.path, trashed };
	}

	const trashed = await trashOrDelete(vault, projectFile);
	return { deletedPath: projectFile.path, trashed };
}

/**
 * Trash when the API supports it; otherwise permanent delete.
 */
async function trashOrDelete(vault: Vault, target: TFile | TFolder): Promise<boolean> {
	const vaultWithTrash = vault as Vault & {
		trash?: (file: TFile | TFolder, system: boolean) => Promise<void>;
	};
	if (typeof vaultWithTrash.trash === "function") {
		try {
			await vaultWithTrash.trash(target, true);
			return true;
		} catch {
			// Fall through to permanent delete.
		}
	}
	await vault.delete(target, true);
	return false;
}

/**
 * Show a short English notice after delete.
 */
export function notifyProjectDeleted(deletedPath: string, trashed: boolean): void {
	new Notice(
		trashed
			? `Project moved to trash: ${deletedPath}`
			: `Project permanently deleted: ${deletedPath}`,
	);
}
