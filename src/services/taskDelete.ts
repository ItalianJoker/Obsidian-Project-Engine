/**
 * Delete a task note (and optionally its nested subtree) via Obsidian vault APIs.
 *
 * Confirmation is UI-side ({@link ConfirmModal}). Persistence rules:
 * - Prefer `vault.trash` when available so users can recover from system trash;
 *   otherwise `vault.delete`.
 * - Nested subtasks are deleted with the root (subtree delete). Surviving notes
 *   have dependency / parent / child references to deleted ids scrubbed through
 *   `vault.process` before files are removed, so the graph stays consistent.
 */

import { Notice, TFile, type App, type Vault } from "obsidian";
import type { Task, TaskId } from "../models/types";
import { buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import { buildTaskTree } from "./taskIo";
import { processNote } from "./vaultIo";

/**
 * Result of {@link deleteTaskSubtree}.
 */
export interface DeleteTaskResult {
	/** Task ids that were removed (root + descendants). */
	deletedIds: TaskId[];
	/** Vault paths that were trashed or permanently deleted. */
	deletedPaths: string[];
	/** True when every file was moved to trash (not permanently deleted). */
	trashed: boolean;
}

/**
 * Collect the root task id plus every descendant (depth-first).
 *
 * Children are discovered via `parent_id` links in {@link buildTaskTree}, which
 * is the same nesting model the Overview / Workspace table uses.
 */
export function collectTaskSubtreeIds(rootId: TaskId, tasks: readonly Task[]): TaskId[] {
	const byParent = buildTaskTree(tasks);
	const out: TaskId[] = [];
	const visit = (id: TaskId): void => {
		out.push(id);
		for (const child of byParent.get(id) ?? []) {
			visit(child.id);
		}
	};
	visit(rootId);
	return out;
}

/**
 * Delete `root` and all nested subtasks.
 *
 * Safer UX than orphaning: the confirm dialog tells the user how many children
 * will also be removed. References from surviving tasks (`blocked_by`,
 * `blocking`, `child_ids`, `parent_id`) are cleaned first so Sync-safe
 * `vault.process` rewrites land before the files disappear.
 */
export async function deleteTaskSubtree(args: {
	app: App;
	vault: Vault;
	/** Task the user asked to delete. */
	root: Task;
	/** Full task catalogue (any project) used to find descendants + scrub refs. */
	allTasks: readonly Task[];
}): Promise<DeleteTaskResult> {
	const { vault, root, allTasks } = args;
	const deleteIds = new Set(collectTaskSubtreeIds(root.id, allTasks));
	const toDelete = allTasks.filter((task) => deleteIds.has(task.id));

	// Scrub references on survivors before removing files (avoids dangling ids).
	for (const task of allTasks) {
		if (deleteIds.has(task.id)) {
			continue;
		}
		const file = vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			continue;
		}
		const nextParent =
			task.parentId && deleteIds.has(task.parentId) ? null : task.parentId;
		const nextChildren = task.childIds.filter((id) => !deleteIds.has(id));
		const nextBlockedBy = task.blockedBy.filter((id) => !deleteIds.has(id));
		const nextBlocking = task.blocking.filter((id) => !deleteIds.has(id));
		const changed =
			nextParent !== task.parentId ||
			nextChildren.length !== task.childIds.length ||
			nextBlockedBy.length !== task.blockedBy.length ||
			nextBlocking.length !== task.blocking.length;
		if (!changed) {
			continue;
		}
		await processNote(vault, file, (current) => {
			const { data, body } = splitFrontmatter(current);
			data.parent_id = nextParent;
			data.child_ids = nextChildren;
			data.blocked_by = nextBlockedBy;
			data.blocking = nextBlocking;
			return buildMarkdownNote(data, body);
		});
	}

	// Trash deepest paths first so folder cleanup (if any) is less surprising.
	const ordered = [...toDelete].sort(
		(a, b) => b.filePath.split("/").length - a.filePath.split("/").length,
	);
	const deletedPaths: string[] = [];
	let allTrashed = true;
	for (const task of ordered) {
		const file = vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			continue;
		}
		const trashed = await trashOrDeleteFile(vault, file);
		if (!trashed) {
			allTrashed = false;
		}
		deletedPaths.push(file.path);
	}

	return {
		deletedIds: [...deleteIds],
		deletedPaths,
		trashed: allTrashed && deletedPaths.length > 0,
	};
}

/**
 * Trash when the API supports it; otherwise permanent delete.
 * Mirrors project-folder delete so recovery behaviour stays consistent.
 */
async function trashOrDeleteFile(vault: Vault, file: TFile): Promise<boolean> {
	const vaultWithTrash = vault as Vault & {
		trash?: (file: TFile, system: boolean) => Promise<void>;
	};
	if (typeof vaultWithTrash.trash === "function") {
		try {
			await vaultWithTrash.trash(file, true);
			return true;
		} catch {
			// Fall through to permanent delete.
		}
	}
	await vault.delete(file, true);
	return false;
}

/**
 * English notice after a successful task delete.
 */
export function notifyTaskDeleted(
	rootTitle: string,
	result: DeleteTaskResult,
): void {
	const extra =
		result.deletedIds.length > 1
			? ` (and ${result.deletedIds.length - 1} subtask${result.deletedIds.length - 1 === 1 ? "" : "s"})`
			: "";
	new Notice(
		result.trashed
			? `Task moved to trash: ${rootTitle}${extra}`
			: `Task permanently deleted: ${rootTitle}${extra}`,
	);
}

/**
 * Build the English confirm copy for subtree delete.
 */
export function deleteTaskConfirmMessage(root: Task, subtreeCount: number): string {
	const name = root.title.trim() || root.id;
	if (subtreeCount <= 1) {
		return `This will permanently remove the task “${name}”.\n\nThis cannot be undone (unless your vault trash can recover it).`;
	}
	const nested = subtreeCount - 1;
	return `This will permanently remove the task “${name}” and ${nested} nested subtask${nested === 1 ? "" : "s"}.\n\nNested subtasks are deleted with the parent (they are not left orphaned).\n\nThis cannot be undone (unless your vault trash can recover it).`;
}
