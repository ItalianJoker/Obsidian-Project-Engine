/**
 * Scheduled-task reminder pure helpers.
 */
import { describe, expect, it } from "vitest";
import {
	formatReminderNotice,
	normaliseReminderMinutesBefore,
	parseScheduledLocalMs,
	planTaskReminders,
	pruneReminderFiredKeys,
	reminderDedupeKey,
	shouldFireReminder,
	type ReminderTaskCandidate,
} from "../src/services/taskReminders";

describe("taskReminders", () => {
	it("builds dedupe keys from task id + scheduled", () => {
		expect(reminderDedupeKey("P#T-1", "2026-10-14T15:00")).toBe(
			"P#T-1::2026-10-14T15:00",
		);
	});

	it("parses local scheduled date-times and skips date-only", () => {
		expect(parseScheduledLocalMs("2026-10-14")).toBeNull();
		expect(parseScheduledLocalMs("")).toBeNull();
		const ms = parseScheduledLocalMs("2026-10-14T15:30");
		expect(ms).not.toBeNull();
		const d = new Date(ms!);
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(9);
		expect(d.getDate()).toBe(14);
		expect(d.getHours()).toBe(15);
		expect(d.getMinutes()).toBe(30);
	});

	it("normalises minutes before", () => {
		expect(normaliseReminderMinutesBefore(-3)).toBe(15);
		expect(normaliseReminderMinutesBefore("20")).toBe(20);
		expect(normaliseReminderMinutesBefore(15.9)).toBe(15);
		expect(normaliseReminderMinutesBefore(99_999)).toBe(10_080);
	});

	it("fires once when now reaches scheduled - lead", () => {
		const scheduledMs = Date.UTC(2026, 9, 14, 12, 0, 0);
		const lead = 15 * 60 * 1000;
		expect(
			shouldFireReminder({
				nowMs: scheduledMs - lead - 1,
				scheduledMs,
				minutesBefore: 15,
				alreadyFired: false,
			}),
		).toBe(false);
		expect(
			shouldFireReminder({
				nowMs: scheduledMs - lead,
				scheduledMs,
				minutesBefore: 15,
				alreadyFired: false,
			}),
		).toBe(true);
		expect(
			shouldFireReminder({
				nowMs: scheduledMs - lead,
				scheduledMs,
				minutesBefore: 15,
				alreadyFired: true,
			}),
		).toBe(false);
	});

	it("plans notices skipping done / archived / fired", () => {
		const scheduled = "2026-10-14T12:00";
		const scheduledMs = parseScheduledLocalMs(scheduled)!;
		const candidates: ReminderTaskCandidate[] = [
			{
				id: "a",
				title: "Open work",
				status: "in-progress",
				scheduled,
				projectId: "P1",
				projectLink: "[[Demo]]",
			},
			{
				id: "b",
				title: "Done work",
				status: "done",
				scheduled,
				projectId: "P1",
				projectLink: "[[Demo]]",
			},
			{
				id: "c",
				title: "Archived project task",
				status: "backlog",
				scheduled,
				projectId: "P2",
				projectLink: "[[Old]]",
			},
		];
		const { notices, newKeys } = planTaskReminders({
			candidates,
			minutesBefore: 15,
			firedKeys: new Set(),
			nowMs: scheduledMs - 10 * 60 * 1000,
			activeProjectNames: new Map([["P1", "Demo Project"]]),
			archivedProjectIds: new Set(["P2"]),
		});
		expect(notices).toEqual(['Reminder: “Open work” (Demo Project)']);
		expect(newKeys).toEqual([reminderDedupeKey("a", scheduled)]);
	});

	it("formats notices and prunes fired keys", () => {
		expect(formatReminderNotice({ title: "Ship" })).toBe('Reminder: “Ship”');
		expect(
			pruneReminderFiredKeys(
				["keep::1", "drop::2", "keep::3"],
				new Set(["keep::1", "keep::3"]),
				10,
			),
		).toEqual(["keep::1", "keep::3"]);
	});
});
