/**
 * Regression: Completed / Done mapping + PersistStatusCommand vault.process write.
 *
 * Table / Dashboard checkboxes must resolve the configurable Done column
 * (including renamed labels like Completato) and persist YAML `status` before
 * views refresh.
 */
import { describe, expect, it } from "vitest";
import {
	DEFAULT_TASK_STATUSES,
	completedTaskStatusId,
	isCompletedTaskStatus,
	reopenTaskStatusId,
	type TaskStatusOption,
} from "../src/models/types";
import { PersistStatusCommand } from "../src/services/taskCommands";
import { splitFrontmatter } from "../src/services/frontmatter";
import { TFile, type Vault } from "obsidian";

describe("completed task status helpers", () => {
	it("maps default Done column as completed", () => {
		const statuses = DEFAULT_TASK_STATUSES.map((item) => ({ ...item }));
		expect(completedTaskStatusId(statuses)).toBe("done");
		expect(isCompletedTaskStatus("done", statuses)).toBe(true);
		expect(isCompletedTaskStatus("backlog", statuses)).toBe(false);
		expect(reopenTaskStatusId(statuses)).toBe("backlog");
	});

	it("treats Completato label / completato id as completed when Done was renamed", () => {
		const renamed: TaskStatusOption[] = [
			{ id: "backlog", label: "Backlog" },
			{ id: "in-progress", label: "In Progress" },
			{ id: "completato", label: "Completato", color: "#22c55e" },
		];
		expect(completedTaskStatusId(renamed)).toBe("completato");
		expect(isCompletedTaskStatus("completato", renamed)).toBe(true);
		expect(reopenTaskStatusId(renamed)).toBe("backlog");
	});

	it("resolves completion by Done / Completed label when id was customised", () => {
		const custom: TaskStatusOption[] = [
			{ id: "todo", label: "To do" },
			{ id: "shipped", label: "Done", color: "#22c55e" },
		];
		expect(completedTaskStatusId(custom)).toBe("shipped");
		expect(isCompletedTaskStatus("shipped", custom)).toBe(true);
	});

	it("falls back to the last active board column", () => {
		const custom: TaskStatusOption[] = [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
			{ id: "z", label: "Zulu" },
			{ id: "x", label: "Hidden", archived: true },
		];
		expect(completedTaskStatusId(custom)).toBe("z");
	});
});

describe("PersistStatusCommand", () => {
	it("writes status through vault.process and settles before refresh", async () => {
		const file = new TFile();
		file.path = "Tasks/T-1.md";
		let stored = [
			"---",
			"pe_type: task",
			"id: T-1",
			"status: backlog",
			"---",
			"",
			"# Task",
			"",
		].join("\n");

		const vault = {
			process: async (_f: TFile, transform: (data: string) => string) => {
				stored = transform(stored);
				return stored;
			},
		} as unknown as Vault;

		const command = new PersistStatusCommand(vault, file, "backlog", "done");
		command.execute();
		await command.settled();

		const { data } = splitFrontmatter(stored);
		expect(data.status).toBe("done");

		command.undo();
		await command.settled();
		expect(splitFrontmatter(stored).data.status).toBe("backlog");
	});
});
