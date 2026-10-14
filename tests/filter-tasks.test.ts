/**
 * Shared table filterTasks — including Hide completed.
 */
import { describe, expect, it } from "vitest";
import type { Task } from "../src/models/types";
import {
	filterTasks,
	type TaskDashboardFilters,
} from "../src/views/subviews/TableSubView";

function stubTask(partial: Partial<Task> & Pick<Task, "id" | "status">): Task {
	return {
		title: partial.title ?? partial.id,
		project: "[[P]]",
		projectId: "P",
		parentId: null,
		childIds: [],
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
		priority: "none",
		important: false,
		isMilestone: false,
		isStageBoundary: false,
		filePath: `${partial.id}.md`,
		customFields: {},
		...partial,
	};
}

const baseFilters: TaskDashboardFilters = {
	text: "",
	status: "all",
	priority: "all",
	hideCompleted: false,
};

describe("filterTasks", () => {
	const open = stubTask({ id: "a", status: "backlog" });
	const done = stubTask({ id: "b", status: "done" });
	const legacy = stubTask({ id: "c", status: "completed" });
	const review = stubTask({ id: "d", status: "review" });

	it("keeps completed tasks when hideCompleted is off", () => {
		const out = filterTasks([open, done, legacy, review], baseFilters);
		expect(out.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("hides locked done and legacy completed ids when hideCompleted is on", () => {
		const out = filterTasks([open, done, legacy, review], {
			...baseFilters,
			hideCompleted: true,
		});
		expect(out.map((t) => t.id)).toEqual(["a", "d"]);
	});

	it("still applies status / priority / text with hideCompleted", () => {
		const urgentDone = stubTask({
			id: "e",
			status: "done",
			priority: "urgent",
			title: "Ship",
		});
		const urgentOpen = stubTask({
			id: "f",
			status: "in-progress",
			priority: "urgent",
			title: "Ship feature",
		});
		const out = filterTasks([urgentDone, urgentOpen, open], {
			text: "ship",
			status: "all",
			priority: "urgent",
			hideCompleted: true,
		});
		expect(out.map((t) => t.id)).toEqual(["f"]);
	});
});
