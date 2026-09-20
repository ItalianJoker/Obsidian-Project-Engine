/**
 * Regression: locked Done status + PersistStatusCommand vault.process write.
 *
 * Done (id `done`) is required: label may be renamed (Completato); archive /
 * remove / id change are blocked. Checkbox / confirm always target `done`.
 */
import { describe, expect, it } from "vitest";
import {
	DEFAULT_TASK_STATUSES,
	LOCKED_DONE_TASK_STATUS_ID,
	completedTaskStatusId,
	ensureDoneTaskStatus,
	isCompletedTaskStatus,
	isLockedDoneTaskStatus,
	lockedDoneStatusNotice,
	reopenTaskStatusId,
} from "../src/models/types";
import { PersistStatusCommand } from "../src/services/taskCommands";
import { markCompletedConfirmMessage } from "../src/services/taskStatusUi";
import { splitFrontmatter } from "../src/services/frontmatter";
import { TFile, type Vault } from "obsidian";

describe("locked Done task status", () => {
	it("always targets id done for completed checkbox / confirm", () => {
		expect(completedTaskStatusId()).toBe(LOCKED_DONE_TASK_STATUS_ID);
		expect(completedTaskStatusId(DEFAULT_TASK_STATUSES)).toBe("done");
		expect(isCompletedTaskStatus("done")).toBe(true);
		expect(isCompletedTaskStatus("backlog")).toBe(false);
		expect(isLockedDoneTaskStatus({ id: "done" })).toBe(true);
		expect(isLockedDoneTaskStatus({ id: "backlog" })).toBe(false);
	});

	it("ensures done exists and cannot stay archived", () => {
		const missing = ensureDoneTaskStatus([
			{ id: "backlog", label: "Backlog" },
			{ id: "in-progress", label: "In Progress" },
		]);
		expect(missing.some((s) => s.id === "done" && s.archived !== true)).toBe(true);

		const archived = ensureDoneTaskStatus([
			{ id: "backlog", label: "Backlog" },
			{ id: "done", label: "Completato", color: "#22c55e", archived: true },
		]);
		const done = archived.find((s) => s.id === "done");
		expect(done?.archived).toBe(false);
		expect(done?.label).toBe("Completato");
	});

	it("migrates legacy completato id onto locked done while keeping the label", () => {
		const migrated = ensureDoneTaskStatus([
			{ id: "backlog", label: "Backlog" },
			{ id: "completato", label: "Completato", color: "#22c55e" },
		]);
		expect(migrated.filter((s) => s.id === "done")).toHaveLength(1);
		expect(migrated.find((s) => s.id === "done")?.label).toBe("Completato");
		expect(migrated.some((s) => s.id === "completato")).toBe(false);
	});

	it("reopens to first non-done column", () => {
		const statuses = DEFAULT_TASK_STATUSES.map((item) => ({ ...item }));
		expect(reopenTaskStatusId(statuses)).toBe("backlog");
	});

	it("exposes English lock notice and complete-confirm copy", () => {
		expect(lockedDoneStatusNotice()).toContain("cannot be archived or removed");
		expect(markCompletedConfirmMessage("Ship release", "Done")).toBe(
			'Mark “Ship release” as completed?\n\nStatus will be set to Done.',
		);
		expect(markCompletedConfirmMessage("Ship release", "Completato")).toContain(
			"Completato",
		);
	});

	it("treats legacy completed ids on notes as checked until rewritten", () => {
		expect(isCompletedTaskStatus("completato")).toBe(true);
		expect(isCompletedTaskStatus("completed")).toBe(true);
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
