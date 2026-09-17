/**
 * Pure helpers for task subtree delete confirm / id collection.
 */
import { describe, expect, it } from "vitest";
import type { Task, TaskId } from "../src/models/types";
import {
	collectTaskSubtreeIds,
	deleteTaskConfirmMessage,
} from "../src/services/taskDelete";

function task(
	partial: Partial<Task> & Pick<Task, "id"> & { parentId?: TaskId | null },
): Task {
	return {
		title: partial.title ?? partial.id,
		project: "[[PRJ-001]]",
		projectId: "PRJ-001",
		parentId: partial.parentId ?? null,
		childIds: partial.childIds ?? [],
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
		urgent: null,
		isMilestone: false,
		isStageBoundary: false,
		filePath: `${partial.id}.md`,
		customFields: {},
		...partial,
	};
}

describe("collectTaskSubtreeIds", () => {
	it("returns only the root when there are no children", () => {
		expect(collectTaskSubtreeIds("A", [task({ id: "A" }), task({ id: "B" })])).toEqual([
			"A",
		]);
	});

	it("collects nested descendants depth-first", () => {
		const tasks = [
			task({ id: "root", title: "Root" }),
			task({ id: "child", title: "Child", parentId: "root" }),
			task({ id: "grand", title: "Grand", parentId: "child" }),
			task({ id: "sibling", title: "Sibling", parentId: "root" }),
			task({ id: "other", title: "Other" }),
		];
		const ids = collectTaskSubtreeIds("root", tasks);
		expect(ids[0]).toBe("root");
		expect(ids).toContain("child");
		expect(ids).toContain("grand");
		expect(ids).toContain("sibling");
		expect(ids).not.toContain("other");
		expect(ids).toHaveLength(4);
	});
});

describe("deleteTaskConfirmMessage", () => {
	it("uses singular copy for a leaf task", () => {
		const msg = deleteTaskConfirmMessage(task({ id: "T1", title: "Leaf" }), 1);
		expect(msg).toContain("Leaf");
		expect(msg).not.toContain("nested");
	});

	it("counts nested subtasks in the confirm copy", () => {
		const msg = deleteTaskConfirmMessage(task({ id: "T1", title: "Parent" }), 3);
		expect(msg).toContain("Parent");
		expect(msg).toContain("2 nested subtasks");
	});
});
