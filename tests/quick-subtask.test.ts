/**
 * Quick subtask create — validation before vault I/O.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Task } from "../src/models/types";
import { createQuickSubtask } from "../src/services/quickSubtask";
import { TFile } from "./mocks/obsidian";

function stubParent(): Task {
	return {
		id: "P#T-1",
		title: "Parent",
		project: "[[Demo]]",
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
		status: "backlog",
		priority: "none",
		important: false,
		isMilestone: false,
		isStageBoundary: false,
		filePath: "Projects/Demo/Tasks/P-T-1 Parent.md",
		customFields: {},
	};
}

describe("createQuickSubtask", () => {
	it("rejects empty titles before writing", async () => {
		const projectFile = new TFile();
		projectFile.path = "Projects/Demo/Demo.md";
		projectFile.basename = "Demo";
		await expect(
			createQuickSubtask({
				app: {} as never,
				settings: DEFAULT_SETTINGS,
				parent: stubParent(),
				projectFile: projectFile as never,
				title: "   ",
			}),
		).rejects.toThrow(/Title is required/);
	});
});
