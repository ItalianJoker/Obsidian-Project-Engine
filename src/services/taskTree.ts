/**
 * @file taskTree.ts
 * @purpose Pure helpers for task hierarchy depth used by Board / Eisenhower cards.
 * @dependencies models/types
 * @usedBy KanbanSubView, EisenhowerSubView, styles (via --pe-tree-depth)
 */

import type { Task, TaskId } from "../models/types";

/**
 * Compute nesting depth for a task within a project task set.
 *
 * Roots (`parentId` null or parent missing from the set) are depth `0`.
 * Walk is cycle-safe.
 *
 * @param task - Task to measure.
 * @param byId - Map of task id → task for the same project (or visible pool).
 */
export function taskNestingDepth(task: Task, byId: Map<TaskId, Task>): number {
	let depth = 0;
	let current: TaskId | null = task.parentId;
	const seen = new Set<TaskId>();
	while (current && !seen.has(current)) {
		seen.add(current);
		const parent = byId.get(current);
		if (!parent) {
			break;
		}
		depth += 1;
		current = parent.parentId;
	}
	return depth;
}
