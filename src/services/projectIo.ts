/**
 * Project note mutations through `vault.process`.
 */

import type { TFile, Vault } from "obsidian";
import { buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import { processNote } from "./vaultIo";

/**
 * Patch YAML fields on an existing project note atomically.
 */
export async function patchProjectFrontmatter(
	vault: Vault,
	file: TFile,
	patch: (data: Record<string, unknown>) => void,
): Promise<void> {
	await processNote(vault, file, (current) => {
		const { data, body } = splitFrontmatter(current);
		if (data.pe_type !== "project") {
			throw new Error("Not a Projects Engine project note");
		}
		patch(data);
		data.updated = new Date().toISOString();
		return buildMarkdownNote(data, body);
	});
}

/**
 * Set the project lifecycle status id.
 */
export async function setProjectStatus(
	vault: Vault,
	file: TFile,
	statusId: string,
): Promise<void> {
	await patchProjectFrontmatter(vault, file, (data) => {
		data.status = statusId;
	});
}
