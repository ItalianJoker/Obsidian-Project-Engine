/**
 * Vault I/O helpers.
 *
 * All content writes go through `vault.process` so Obsidian Sync / iCloud
 * cannot interleave a second writer between read and write. Folder creation
 * uses the Obsidian API (never Node `fs`). Path concatenation uses string
 * operations (never Node `path`).
 */

import { TFile, TFolder, type Vault } from "obsidian";

/**
 * Join vault-relative segments with `/` and collapse duplicate slashes.
 * Does not consult the filesystem.
 */
export function joinVaultPath(...parts: string[]): string {
	return parts
		.map((part) => part.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
		.filter((part) => part.length > 0)
		.join("/");
}

/**
 * Parent folder of a vault path, or `""` for a root-level file.
 */
export function parentFolder(path: string): string {
	const normalised = path.replace(/\\/g, "/");
	const index = normalised.lastIndexOf("/");
	return index <= 0 ? "" : normalised.slice(0, index);
}

/**
 * Strip characters that are illegal in Obsidian note file names.
 */
export function sanitiseNoteBasename(name: string): string {
	return name.replace(/[\\/:*?"<>|#]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Ensure each segment of `folderPath` exists, creating folders as needed.
 */
export async function ensureFolder(vault: Vault, folderPath: string): Promise<TFolder | null> {
	const normalised = joinVaultPath(folderPath);
	if (!normalised) {
		return vault.getRoot();
	}
	const segments = normalised.split("/");
	let current = "";
	let folder: TFolder | null = vault.getRoot();
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		const existing = vault.getAbstractFileByPath(current);
		if (existing instanceof TFolder) {
			folder = existing;
			continue;
		}
		if (existing instanceof TFile) {
			throw new Error(`Cannot create folder "${current}": a file already occupies that path`);
		}
		folder = await vault.createFolder(current);
	}
	return folder;
}

/**
 * Atomically write Markdown content.
 *
 * Creates the file (and parent folder) when missing, then always applies the
 * payload through `vault.process`. The process callback ignores prior contents
 * because project-creation writes replace the whole note; callers that need
 * merge semantics should pass a callback via {@link processNote}.
 *
 * @param vault - Active vault.
 * @param path - Vault-relative path including `.md`.
 * @param content - Full Markdown document (frontmatter + body).
 */
export async function writeNoteAtomic(
	vault: Vault,
	path: string,
	content: string,
): Promise<TFile> {
	const folder = parentFolder(path);
	if (folder) {
		await ensureFolder(vault, folder);
	}

	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) {
		throw new Error(`Cannot write note: "${path}" is a folder`);
	}
	const file: TFile =
		existing instanceof TFile ? existing : await vault.create(path, "");

	await vault.process(file, () => content);
	return file;
}

/**
 * Atomically transform an existing note. Prefer this over `read` + `modify`.
 *
 * @param vault - Active vault.
 * @param file - Target file.
 * @param transform - Synchronous rewrite of the entire document.
 */
export async function processNote(
	vault: Vault,
	file: TFile,
	transform: (current: string) => string,
): Promise<string> {
	return vault.process(file, transform);
}

/**
 * True when a Markdown file already occupies `path`.
 */
export function noteExists(vault: Vault, path: string): boolean {
	return vault.getAbstractFileByPath(path) instanceof TFile;
}
