/**
 * @file folderPaths.ts
 * @purpose Normalise vault-relative folder settings with Obsidian `normalizePath`.
 * @dependencies obsidian
 * @usedBy settings, projectArchive, metadataSync, loadSettings
 */

import { normalizePath } from "obsidian";

/**
 * Clean and normalise a vault-relative folder path.
 *
 * Strips leading/trailing slashes, unifies separators, then applies
 * Obsidian {@link normalizePath}. Empty input falls back to `fallback`.
 *
 * @param folder - Raw settings value.
 * @param fallback - Default when empty (example: `"Projects"`).
 */
export function normalizeVaultFolder(folder: string, fallback: string): string {
	const cleaned = (folder || fallback)
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalizePath(cleaned || fallback);
}

/**
 * True when `filePath` is inside `folder` (or is the folder itself as a note path prefix).
 */
export function pathUnderFolder(filePath: string, folder: string): boolean {
	const path = filePath.replace(/\\/g, "/");
	const prefix = folder.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!prefix) {
		return false;
	}
	return path === prefix || path.startsWith(`${prefix}/`);
}
