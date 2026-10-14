/**
 * Task nesting depth helpers.
 */
import { describe, expect, it } from "vitest";
import type { Task } from "../src/models/types";
import { taskNestingDepth } from "../src/services/taskTree";

function stubTask(partial: Partial<Task> & Pick<Task, "id">): Task {
	return {
		title: partial.title ?? partial.id,
		project: "[[P]]",
		projectId: "P",
		parentId: partial.parentId ?? null,
		childIds: partial.childIds ?? [],
		sortOrder: null,
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
		important: false,
		isMilestone: false,
		isStageBoundary: false,
		filePath: `${partial.id}.md`,
		customFields: {},
		...partial,
	};
}

describe("taskNestingDepth", () => {
	it("returns 0 for roots and missing parents", () => {
		const root = stubTask({ id: "a", parentId: null });
		const orphan = stubTask({ id: "b", parentId: "missing" });
		const byId = new Map([
			[root.id, root],
			[orphan.id, orphan],
		]);
		expect(taskNestingDepth(root, byId)).toBe(0);
		expect(taskNestingDepth(orphan, byId)).toBe(0);
	});

	it("counts nested parents and is cycle-safe", () => {
		const a = stubTask({ id: "a", parentId: null });
		const b = stubTask({ id: "b", parentId: "a" });
		const c = stubTask({ id: "c", parentId: "b" });
		const cycle = stubTask({ id: "d", parentId: "e" });
		const cycle2 = stubTask({ id: "e", parentId: "d" });
		const byId = new Map(
			[a, b, c, cycle, cycle2].map((task) => [task.id, task] as const),
		);
		expect(taskNestingDepth(b, byId)).toBe(1);
		expect(taskNestingDepth(c, byId)).toBe(2);
		expect(taskNestingDepth(cycle, byId)).toBeGreaterThanOrEqual(1);
		expect(taskNestingDepth(cycle, byId)).toBeLessThan(10);
	});
});
