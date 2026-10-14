/**
 * @file entityDelete.ts
 * @purpose Delete an Entity-as-a-Note catalogue file (customer, stakeholder, …).
 * @dependencies Obsidian vault trash/delete
 * @usedBy ViewEntityModal “Delete Entity”
 *
 * Confirmation is UI-side. Prefer system trash when available.
 */

import { Notice, TFile, type Vault } from "obsidian";

/**
 * Trash (or permanently delete) one entity note.
 *
 * @returns Whether the file was moved to system trash.
 */
export async function deleteEntityNote(
	vault: Vault,
	file: TFile,
): Promise<{ deletedPath: string; trashed: boolean }> {
	const path = file.path;
	const trashed = await trashOrDelete(vault, file);
	return { deletedPath: path, trashed };
}

/**
 * Trash when the API supports it; otherwise permanent delete.
 */
async function trashOrDelete(vault: Vault, target: TFile): Promise<boolean> {
	const vaultWithTrash = vault as Vault & {
		trash?: (file: TFile, system: boolean) => Promise<void>;
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
 * English notice after a successful entity delete.
 */
export function notifyEntityDeleted(
	entityLabel: string,
	name: string,
	trashed: boolean,
): void {
	const label = `${entityLabel} “${name}”`;
	new Notice(
		trashed ? `${label} moved to trash` : `${label} permanently deleted`,
	);
}
