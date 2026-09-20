/**
 * Manual task / subtask order for Dashboard and Table (shared {@link TableSubView}).
 *
 * Persistence model:
 * - Each task may carry YAML `sort_order` (number) — sibling rank within the
 *   same `parent_id` (roots use `parent_id: null`).
 * - When a parent exists, its `child_ids` array is rewritten to match the new
 *   sibling order so hierarchy links stay consistent with the table.
 *
 * Missing `sort_order` values sort after numbered siblings, then by title / id.
 */

import type { Task, TaskId } from "../models/types";

/**
 * Direction for one-step sibling reorder (up / down controls).
 */
export type TaskReorderDirection = "up" | "down";

/**
 * One note patch produced by {@link planSiblingReorder}.
 */
export interface TaskOrderPatch {
	/** Task id whose note will be updated. */
	taskId: TaskId;
	/** Path of the task note. */
	filePath: string;
	/**
	 * New `sort_order` value (0-based dense index among siblings).
	 * Omit when only rewriting a parent’s `child_ids`.
	 */
	sortOrder?: number;
	/**
	 * When set, also rewrite YAML `child_ids` (parent note after a child move).
	 */
	childIds?: TaskId[];
}

/**
 * Compare two tasks for sibling display order.
 *
 * @param a — First task.
 * @param b — Second task.
 * @returns Negative when `a` should appear before `b`.
 */
export function compareTasksBySortOrder(a: Task, b: Task): number {
	const ao = a.sortOrder;
	const bo = b.sortOrder;
	const aNum = ao != null && Number.isFinite(ao);
	const bNum = bo != null && Number.isFinite(bo);
	if (aNum && bNum && ao !== bo) {
		return (ao as number) - (bo as number);
	}
	if (aNum && !bNum) {
		return -1;
	}
	if (!aNum && bNum) {
		return 1;
	}
	const byTitle = a.title.localeCompare(b.title);
	if (byTitle !== 0) {
		return byTitle;
	}
	return a.id.localeCompare(b.id);
}

/**
 * Sort a sibling list in place using {@link compareTasksBySortOrder}.
 */
export function sortTasksBySortOrder(tasks: Task[]): Task[] {
	return [...tasks].sort(compareTasksBySortOrder);
}

/**
 * Plan patches to move `taskId` one step among its siblings.
 *
 * @param allProjectTasks — Tasks in the same project (any depth).
 * @param taskId — Task being moved.
 * @param direction — `"up"` toward the start of the list, `"down"` toward the end.
 * @returns Patches for every sibling (dense `sort_order`) plus the parent’s
 *   `child_ids` when applicable; empty when the move is a no-op.
 */
export function planSiblingReorder(
	allProjectTasks: readonly Task[],
	taskId: TaskId,
	direction: TaskReorderDirection,
): TaskOrderPatch[] {
	const moving = allProjectTasks.find((task) => task.id === taskId);
	if (!moving) {
		return [];
	}
	const parentId = moving.parentId;
	const siblings = sortTasksBySortOrder(
		allProjectTasks.filter((task) => task.parentId === parentId),
	);
	const index = siblings.findIndex((task) => task.id === taskId);
	if (index < 0) {
		return [];
	}
	const swapWith = direction === "up" ? index - 1 : index + 1;
	if (swapWith < 0 || swapWith >= siblings.length) {
		return [];
	}
	const next = [...siblings];
	const tmp = next[index]!;
	next[index] = next[swapWith]!;
	next[swapWith] = tmp;

	const patches: TaskOrderPatch[] = next.map((task, order) => ({
		taskId: task.id,
		filePath: task.filePath,
		sortOrder: order,
	}));

	if (parentId) {
		const parent = allProjectTasks.find((task) => task.id === parentId);
		if (parent) {
			patches.push({
				taskId: parent.id,
				filePath: parent.filePath,
				childIds: next.map((task) => task.id),
			});
		}
	}

	return patches;
}

/**
 * Whether the task can move one step in `direction` among its current siblings.
 */
export function canReorderTask(
	allProjectTasks: readonly Task[],
	taskId: TaskId,
	direction: TaskReorderDirection,
): boolean {
	return planSiblingReorder(allProjectTasks, taskId, direction).length > 0;
}
