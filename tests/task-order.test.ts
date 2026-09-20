/**
 * Unit tests for sibling task reorder (`sort_order` + parent `child_ids`).
 */
import { describe, expect, it } from "vitest";
import type { Task, TaskId } from "../src/models/types";
import {
	canReorderTask,
	compareTasksBySortOrder,
	planSiblingReorder,
	sortTasksBySortOrder,
} from "../src/services/taskOrder";

function task(
	partial: Partial<Task> & Pick<Task, "id"> & { parentId?: TaskId | null },
): Task {
	return {
		id: partial.id,
		title: partial.title ?? partial.id,
		project: "[[P]]",
		projectId: "P",
		parentId: partial.parentId ?? null,
		childIds: partial.childIds ?? [],
		sortOrder: partial.sortOrder ?? null,
		blockedBy: [],
		blocking: [],
		startDate: null,
		endDate: null,
		due: null,
		scheduled: null,
		durationDays: 1,
		estimateHours: 0,
		estimateMandays: 0,
		actualMandays: 0,
		remainingMandays: 0,
		actualHours: 0,
		remainingHours: 0,
		timeLogs: [],
		status: "backlog",
		priority: "none",
		important: null,
		isMilestone: false,
		isStageBoundary: false,
		filePath: `Tasks/${partial.id}.md`,
		customFields: {},
	};
}

describe("taskOrder", () => {
	it("sorts by sort_order then title", () => {
		const a = task({ id: "a", title: "Zeta", sortOrder: 2 });
		const b = task({ id: "b", title: "Alpha", sortOrder: 1 });
		const c = task({ id: "c", title: "Beta", sortOrder: null });
		expect(sortTasksBySortOrder([a, c, b]).map((t) => t.id)).toEqual([
			"b",
			"a",
			"c",
		]);
		expect(compareTasksBySortOrder(b, a)).toBeLessThan(0);
	});

	it("plans dense sort_order swaps for root siblings", () => {
		const roots = [
			task({ id: "r1", title: "One", sortOrder: 0 }),
			task({ id: "r2", title: "Two", sortOrder: 1 }),
			task({ id: "r3", title: "Three", sortOrder: 2 }),
		];
		expect(canReorderTask(roots, "r1", "up")).toBe(false);
		expect(canReorderTask(roots, "r1", "down")).toBe(true);

		const patches = planSiblingReorder(roots, "r1", "down");
		expect(patches.map((p) => ({ id: p.taskId, order: p.sortOrder }))).toEqual([
			{ id: "r2", order: 0 },
			{ id: "r1", order: 1 },
			{ id: "r3", order: 2 },
		]);
		expect(patches.every((p) => p.childIds === undefined)).toBe(true);
	});

	it("rewrites parent child_ids when reordering nested siblings", () => {
		const tasks = [
			task({ id: "parent", title: "Parent", childIds: ["c1", "c2"] }),
			task({ id: "c1", title: "Child A", parentId: "parent", sortOrder: 0 }),
			task({ id: "c2", title: "Child B", parentId: "parent", sortOrder: 1 }),
		];
		const patches = planSiblingReorder(tasks, "c2", "up");
		const parentPatch = patches.find((p) => p.taskId === "parent");
		expect(parentPatch?.childIds).toEqual(["c2", "c1"]);
		expect(patches.filter((p) => p.sortOrder != null)).toHaveLength(2);
	});

	it("keeps hierarchy — does not swap across parents", () => {
		const tasks = [
			task({ id: "a", title: "A" }),
			task({ id: "b1", title: "B1", parentId: "a", sortOrder: 0 }),
			task({ id: "c", title: "C" }),
		];
		expect(canReorderTask(tasks, "b1", "up")).toBe(false);
		expect(canReorderTask(tasks, "b1", "down")).toBe(false);
		expect(planSiblingReorder(tasks, "a", "down").map((p) => p.taskId)).toEqual([
			"c",
			"a",
		]);
	});
});
