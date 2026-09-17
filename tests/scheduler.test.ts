/**
 * Regression tests for the DAG scheduler (dates, cycles, cascade, undo stack).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	addDays,
	CascadeScheduleCommand,
	CommandStack,
	compareIsoDate,
	CycleDetectedError,
	detectCycles,
	endFromStart,
	formatIsoDate,
	maxIsoDate,
	parseIsoDate,
	Scheduler,
	topologicalOrder,
	UnknownTaskError,
	wouldCreateCycle,
} from "../src/engine/Scheduler";
import type { SchedulableTask } from "../src/models/types";

function task(
	partial: Partial<SchedulableTask> & Pick<SchedulableTask, "id">,
): SchedulableTask {
	return {
		blockedBy: [],
		durationDays: 1,
		startDate: null,
		endDate: null,
		isStageBoundary: false,
		stageSequence: null,
		...partial,
	};
}

describe("ISO date helpers", () => {
	it("parses and formats UTC calendar days", () => {
		const d = parseIsoDate("2026-09-17");
		expect(d.getUTCFullYear()).toBe(2026);
		expect(d.getUTCMonth()).toBe(8);
		expect(d.getUTCDate()).toBe(17);
		expect(formatIsoDate(d)).toBe("2026-09-17");
	});

	it("rejects invalid calendar overflow (Feb 31)", () => {
		expect(() => parseIsoDate("2026-02-31")).toThrow(/Invalid calendar date/);
	});

	it("rejects malformed strings", () => {
		expect(() => parseIsoDate("17/09/2026")).toThrow(/Invalid ISO date/);
	});

	it("addDays / endFromStart / compare / max preserve day math", () => {
		expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
		expect(endFromStart("2026-01-01", 3)).toBe("2026-01-03");
		expect(endFromStart("2026-01-01", 0)).toBe("2026-01-01");
		expect(compareIsoDate("2026-01-02", "2026-01-01")).toBeGreaterThan(0);
		expect(maxIsoDate(null, "2026-01-01")).toBe("2026-01-01");
		expect(maxIsoDate("2026-01-02", "2026-01-01")).toBe("2026-01-02");
		expect(maxIsoDate(null, null)).toBeNull();
	});
});

describe("cycle detection", () => {
	it("returns empty for a DAG", () => {
		const tasks = [
			task({ id: "A" }),
			task({ id: "B", blockedBy: ["A"] }),
			task({ id: "C", blockedBy: ["B"] }),
		];
		expect(detectCycles(tasks)).toEqual([]);
	});

	it("detects a simple cycle", () => {
		const tasks = [
			task({ id: "A", blockedBy: ["C"] }),
			task({ id: "B", blockedBy: ["A"] }),
			task({ id: "C", blockedBy: ["B"] }),
		];
		const cycles = detectCycles(tasks);
		expect(cycles.length).toBeGreaterThan(0);
		expect(cycles[0]![0]).toBe(cycles[0]![cycles[0]!.length - 1]);
	});

	it("detects self-loop as a cycle", () => {
		const tasks = [task({ id: "A", blockedBy: ["A"] })];
		expect(detectCycles(tasks).length).toBeGreaterThan(0);
	});

	it("wouldCreateCycle predicts illegality without mutating", () => {
		const tasks = [
			task({ id: "A" }),
			task({ id: "B", blockedBy: ["A"] }),
		];
		expect(wouldCreateCycle(tasks, "B", "A")).not.toBeNull();
		expect(wouldCreateCycle(tasks, "A", "B")).toBeNull();
		expect(tasks[1]!.blockedBy).toEqual(["A"]);
	});

	it("throws UnknownTaskError for missing blocker ids", () => {
		expect(() =>
			detectCycles([task({ id: "A", blockedBy: ["MISSING"] })]),
		).toThrow(UnknownTaskError);
	});
});

describe("autoSchedule / cascade", () => {
	const scheduler = new Scheduler();

	it("ASAP schedules a chain from project start", () => {
		const tasks = [
			task({ id: "A", durationDays: 2 }),
			task({ id: "B", durationDays: 3, blockedBy: ["A"] }),
		];
		const result = scheduler.autoSchedule(tasks, { projectStart: "2026-01-01" });
		expect(result.dates.get("A")).toEqual({
			taskId: "A",
			startDate: "2026-01-01",
			endDate: "2026-01-02",
		});
		expect(result.dates.get("B")).toEqual({
			taskId: "B",
			startDate: "2026-01-03",
			endDate: "2026-01-05",
		});
	});

	it("throws CycleDetectedError on cyclic graphs", () => {
		const tasks = [
			task({ id: "A", blockedBy: ["B"] }),
			task({ id: "B", blockedBy: ["A"] }),
		];
		expect(() =>
			scheduler.autoSchedule(tasks, { projectStart: "2026-01-01" }),
		).toThrow(CycleDetectedError);
	});

	it("cascade slips dependents forward without pulling siblings earlier", () => {
		const tasks = [
			task({
				id: "A",
				durationDays: 2,
				startDate: "2026-01-01",
				endDate: "2026-01-02",
			}),
			task({
				id: "B",
				durationDays: 2,
				blockedBy: ["A"],
				startDate: "2026-01-03",
				endDate: "2026-01-04",
			}),
		];
		const result = scheduler.cascade(tasks, "A", "2026-01-10");
		expect(result.dates.get("A")?.endDate).toBe("2026-01-10");
		expect(result.dates.get("B")?.startDate).toBe("2026-01-11");
	});

	it("honours PRINCE2 stage-boundary implicit edges", () => {
		const tasks = [
			task({
				id: "boundary",
				durationDays: 0,
				isStageBoundary: true,
				stageSequence: 1,
			}),
			task({ id: "later", durationDays: 2, stageSequence: 2 }),
		];
		const result = scheduler.autoSchedule(tasks, { projectStart: "2026-03-01" });
		expect(result.dates.get("boundary")?.startDate).toBe("2026-03-01");
		expect(result.dates.get("later")?.startDate).toBe("2026-03-02");
	});

	it("diff skips unchanged dates", () => {
		const tasks = [
			task({
				id: "A",
				durationDays: 1,
				startDate: "2026-01-01",
				endDate: "2026-01-01",
			}),
		];
		const result = scheduler.autoSchedule(tasks, { projectStart: "2026-01-01" });
		expect(scheduler.diff(tasks, result)).toEqual([]);
	});

	it("topologicalOrder reports cycles when order is incomplete", () => {
		const tasks = [
			task({ id: "A", blockedBy: ["B"] }),
			task({ id: "B", blockedBy: ["A"] }),
		];
		const { order, cycles } = topologicalOrder(tasks);
		expect(order.length).toBeLessThan(2);
		expect(cycles.length).toBeGreaterThan(0);
	});
});

describe("CommandStack", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("undo / redo and maxDepth drop oldest", () => {
		const stack = new CommandStack(2);
		const log: string[] = [];
		const cmd = (name: string) => ({
			description: name,
			execute: () => {
				log.push(`exec:${name}`);
			},
			undo: () => {
				log.push(`undo:${name}`);
			},
		});
		stack.execute(cmd("1"));
		stack.execute(cmd("2"));
		stack.execute(cmd("3"));
		expect(stack.canUndo).toBe(true);
		expect(stack.undo()).toBe(true);
		expect(stack.canRedo).toBe(true);
		expect(stack.redo()).toBe(true);
		stack.clear();
		expect(stack.canUndo).toBe(false);
		expect(stack.undo()).toBe(false);
		expect(log.filter((x) => x.startsWith("exec:")).length).toBe(4);
	});

	it("CascadeScheduleCommand applies and reverts patches", () => {
		const tasks = [
			task({
				id: "A",
				startDate: "2026-01-01",
				endDate: "2026-01-02",
				durationDays: 2,
			}),
		];
		const command = new CascadeScheduleCommand(tasks, [
			{
				taskId: "A",
				previousStart: "2026-01-01",
				previousEnd: "2026-01-02",
				nextStart: "2026-01-05",
				nextEnd: "2026-01-06",
			},
		]);
		command.execute();
		expect(tasks[0]!.startDate).toBe("2026-01-05");
		command.undo();
		expect(tasks[0]!.endDate).toBe("2026-01-02");
	});
});
