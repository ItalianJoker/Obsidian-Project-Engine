/**
 * DAG scheduler for Projects Engine.
 *
 * The engine treats tasks as nodes in a directed acyclic graph (DAG). An edge
 * `A → B` means "A blocks B": B's `blocked_by` list contains A, so B cannot
 * start until A has finished. Edges may be intra-project or cross-project
 * because {@link TaskId} is globally unique.
 *
 * Two algorithms live here:
 *
 * 1. **Cycle detection** (DFS colouring) — a new dependency that would close a
 *    loop is rejected and the cycle path is returned so the UI can Notice it.
 * 2. **Cascade auto-scheduling** (Kahn topological order + date sweep) —
 *    slipping a blocker pushes dependents forward while keeping each dependent's
 *    `durationDays` unchanged. PRINCE2 end-of-stage milestones (`isStageBoundary`)
 *    act as formal blocks: every task in a later stage waits on the boundary.
 *
 * Date math uses UTC calendar days (`YYYY-MM-DD`) so desktop and mobile agree.
 * No Node.js APIs are used.
 *
 * @packageDocumentation
 */

import type {
	AutoScheduleOptions,
	DatePatch,
	EngineCommand,
	IsoDate,
	SchedulableTask,
	ScheduleResult,
	ScheduledDates,
	TaskId,
} from "../models/types";

// ---------------------------------------------------------------------------
// UTC calendar-day helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse an ISO calendar date as UTC midnight.
 *
 * @throws {Error} if the string is not `YYYY-MM-DD`.
 */
export function parseIsoDate(iso: IsoDate): Date {
	const match = ISO_DATE_RE.exec(iso);
	if (!match) {
		throw new Error(`Invalid ISO date "${iso}"; expected YYYY-MM-DD`);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	// Guard against JS Date overflow (example: 2026-02-31 → March).
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw new Error(`Invalid calendar date "${iso}"`);
	}
	return date;
}

/**
 * Format a Date as `YYYY-MM-DD` using UTC components.
 */
export function formatIsoDate(date: Date): IsoDate {
	const year = date.getUTCFullYear().toString().padStart(4, "0");
	const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
	const day = date.getUTCDate().toString().padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Add (or subtract) calendar days without touching local timezone.
 */
export function addDays(iso: IsoDate, days: number): IsoDate {
	const date = parseIsoDate(iso);
	date.setUTCDate(date.getUTCDate() + days);
	return formatIsoDate(date);
}

/**
 * Inclusive end date for a task that starts on `start` and lasts `durationDays`.
 * A duration of `0` is a milestone: start and end are the same instant/day.
 *
 * @example
 * startInclusive("2026-01-01", 3) // "2026-01-03"  (1st, 2nd, 3rd)
 * startInclusive("2026-01-01", 0) // "2026-01-01"
 */
export function endFromStart(start: IsoDate, durationDays: number): IsoDate {
	if (durationDays <= 0) {
		return start;
	}
	return addDays(start, durationDays - 1);
}

/**
 * Compare two ISO dates. Negative if `a` is before `b`.
 */
export function compareIsoDate(a: IsoDate, b: IsoDate): number {
	return parseIsoDate(a).getTime() - parseIsoDate(b).getTime();
}

/**
 * Return the later of two dates. `null` is treated as "unknown / unconstrained".
 */
export function maxIsoDate(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
	if (a === null) return b;
	if (b === null) return a;
	return compareIsoDate(a, b) >= 0 ? a : b;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the dependency graph contains one or more cycles.
 * The UI should `new Notice(error.message)` and refuse the mutation.
 */
export class CycleDetectedError extends Error {
	/**
	 * @param cycles - Each cycle is a closed path (`A, B, A`).
	 */
	constructor(public readonly cycles: TaskId[][]) {
		const rendered = cycles.map((cycle) => cycle.join(" → ")).join("; ");
		super(`Dependency cycle detected: ${rendered}`);
		this.name = "CycleDetectedError";
	}
}

/**
 * Thrown when a referenced blocker id is missing from the working set.
 */
export class UnknownTaskError extends Error {
	constructor(public readonly taskId: TaskId) {
		super(`Unknown task "${taskId}" referenced in the dependency graph`);
		this.name = "UnknownTaskError";
	}
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Adjacency list: blocker id → dependent ids (outgoing "blocks" edges).
 */
export type Adjacency = Map<TaskId, TaskId[]>;

/**
 * Build the implicit + explicit dependency graph.
 *
 * Explicit edges come from `blockedBy`. Implicit PRINCE2 edges: every task
 * whose `stageSequence` is strictly greater than N is blocked by every
 * `isStageBoundary` task at stage N. Those implicit edges are the "formal
 * blocks" required by stage-boundary milestones.
 *
 * @param tasks - Working set (one or many projects).
 * @returns Outgoing adjacency and the indegree map used by Kahn's algorithm.
 */
export function buildAdjacency(tasks: readonly SchedulableTask[]): {
	adjacency: Adjacency;
	indegree: Map<TaskId, number>;
	ids: TaskId[];
} {
	const byId = new Map<TaskId, SchedulableTask>();
	for (const task of tasks) {
		byId.set(task.id, task);
	}

	const adjacency: Adjacency = new Map();
	const indegree = new Map<TaskId, number>();
	const ids: TaskId[] = [];

	for (const task of tasks) {
		ids.push(task.id);
		adjacency.set(task.id, []);
		indegree.set(task.id, 0);
	}

	const addEdge = (from: TaskId, to: TaskId): void => {
		// Self-loops (from === to) are recorded like any other edge so DFS cycle
		// detection surfaces them; do not special-case or skip them.
		if (!adjacency.has(from)) {
			throw new UnknownTaskError(from);
		}
		if (!adjacency.has(to)) {
			throw new UnknownTaskError(to);
		}
		const outs = adjacency.get(from);
		if (!outs || outs.includes(to)) {
			return;
		}
		outs.push(to);
		indegree.set(to, (indegree.get(to) ?? 0) + 1);
	};

	// Explicit blocked_by edges.
	for (const task of tasks) {
		for (const blockerId of task.blockedBy) {
			addEdge(blockerId, task.id);
		}
	}

	// Implicit stage-boundary edges: boundary(N) blocks every task with stage > N.
	const boundaries = tasks.filter((task) => task.isStageBoundary && task.stageSequence != null);
	for (const task of tasks) {
		if (task.stageSequence == null) {
			continue;
		}
		for (const boundary of boundaries) {
			// `boundaries` is pre-filtered with `stageSequence != null`; the local
			// non-null assertion matches that invariant (no runtime null path).
			const boundaryStage = boundary.stageSequence!;
			if (task.stageSequence > boundaryStage && task.id !== boundary.id) {
				addEdge(boundary.id, task.id);
			}
		}
	}

	return { adjacency, indegree, ids };
}

// ---------------------------------------------------------------------------
// Cycle detection (DFS three-colour)
// ---------------------------------------------------------------------------

type DfsColor = "white" | "gray" | "black";

/**
 * Detect every simple cycle in the dependency graph.
 *
 * Grey-node back edges close a cycle. We snapshot the stack from the
 * repeated node to the current vertex and append the start node to make
 * the path closed (useful for Notices: `A → B → C → A`).
 *
 * @returns An array of closed cycle paths (empty if the graph is a DAG).
 */
export function detectCycles(tasks: readonly SchedulableTask[]): TaskId[][] {
	const { adjacency, ids } = buildAdjacency(tasks);
	const color = new Map<TaskId, DfsColor>();
	const cycles: TaskId[][] = [];

	for (const id of ids) {
		color.set(id, "white");
	}

	const stack: TaskId[] = [];

	const visit = (node: TaskId): void => {
		color.set(node, "gray");
		stack.push(node);

		for (const next of adjacency.get(node) ?? []) {
			const nextColor = color.get(next) ?? "white";
			if (nextColor === "white") {
				visit(next);
			} else if (nextColor === "gray") {
				// Back edge: extract the cycle from the DFS stack.
				const start = stack.lastIndexOf(next);
				const path = start >= 0 ? stack.slice(start) : [next, node];
				path.push(next);
				cycles.push(path);
			}
		}

		stack.pop();
		color.set(node, "black");
	};

	for (const id of ids) {
		if (color.get(id) === "white") {
			visit(id);
		}
	}

	return cycles;
}

/**
 * Return the cycle that would be created by adding `blockerId → dependentId`,
 * or `null` if the edge is safe.
 *
 * Used by the UI *before* writing `blocked_by` so we can notify the user and
 * refuse the circular loop.
 */
export function wouldCreateCycle(
	tasks: readonly SchedulableTask[],
	blockerId: TaskId,
	dependentId: TaskId,
): TaskId[] | null {
	const hypothetical: SchedulableTask[] = tasks.map((task) => {
		if (task.id !== dependentId) {
			return task;
		}
		if (task.blockedBy.includes(blockerId)) {
			return task;
		}
		return { ...task, blockedBy: [...task.blockedBy, blockerId] };
	});
	const cycles = detectCycles(hypothetical);
	return cycles[0] ?? null;
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn)
// ---------------------------------------------------------------------------

/**
 * Kahn's algorithm: repeatedly peel nodes with indegree 0.
 *
 * If the output order is shorter than the node set, the remainder sits in a
 * cycle (those ids are *not* included in `order`; call {@link detectCycles}
 * for the actual paths).
 */
export function topologicalOrder(tasks: readonly SchedulableTask[]): {
	order: TaskId[];
	cycles: TaskId[][];
} {
	const { adjacency, indegree, ids } = buildAdjacency(tasks);
	const remaining = new Map(indegree);
	const queue: TaskId[] = [];

	for (const id of ids) {
		if ((remaining.get(id) ?? 0) === 0) {
			queue.push(id);
		}
	}

	const order: TaskId[] = [];
	while (queue.length > 0) {
		const node = queue.shift();
		if (node === undefined) {
			break;
		}
		order.push(node);
		for (const next of adjacency.get(node) ?? []) {
			const nextDegree = (remaining.get(next) ?? 0) - 1;
			remaining.set(next, nextDegree);
			if (nextDegree === 0) {
				queue.push(next);
			}
		}
	}

	const cycles = order.length === ids.length ? [] : detectCycles(tasks);
	return { order, cycles };
}

// ---------------------------------------------------------------------------
// Date sweep
// ---------------------------------------------------------------------------

/**
 * Earliest feasible start for `task` given already-scheduled predecessors.
 *
 * Rule: start = max(
 *   unconstrained floor (`projectStart` in ASAP mode, otherwise the task's
 *   current start),
 *   day after every blocker's end
 * )
 */
function earliestStart(
	task: SchedulableTask,
	dates: Map<TaskId, ScheduledDates>,
	floor: IsoDate,
): IsoDate {
	let start: IsoDate = floor;
	for (const blockerId of task.blockedBy) {
		const blocker = dates.get(blockerId);
		if (!blocker) {
			continue;
		}
		const afterBlocker = addDays(blocker.endDate, 1);
		if (compareIsoDate(afterBlocker, start) > 0) {
			start = afterBlocker;
		}
	}
	return start;
}

/**
 * Assign start/end dates in topological order, preserving each task's duration.
 *
 * @param asap - When true, ignore a task's previous start and pull it to the
 *   earliest feasible day. When false (cascade slip), only push forward.
 */
function sweepDates(
	tasks: readonly SchedulableTask[],
	order: TaskId[],
	projectStart: IsoDate,
	asap: boolean,
): Map<TaskId, ScheduledDates> {
	const byId = new Map(tasks.map((task) => [task.id, task] as const));
	const dates = new Map<TaskId, ScheduledDates>();
	// Precompute once — identical filter to the former per-task scan inside
	// materialiseImplicitBlockers; avoids O(n²) allocations on large graphs.
	const boundaries = tasks.filter(
		(task) => task.isStageBoundary && task.stageSequence != null,
	);

	for (const id of order) {
		const task = byId.get(id);
		if (!task) {
			throw new UnknownTaskError(id);
		}

		const floor = asap
			? projectStart
			: (task.startDate && compareIsoDate(task.startDate, projectStart) > 0
					? task.startDate
					: projectStart);

		// Stage-boundary ends also constrain later stages via implicit edges,
		// so they already appear in blockedBy-equivalent adjacency. We still
		// honour explicit blockedBy here; implicit edges are materialised as
		// extra blockedBy clones for the date sweep.
		const withImplicit = materialiseImplicitBlockers(task, boundaries);
		const start = earliestStart(withImplicit, dates, floor);
		const end = endFromStart(start, task.durationDays);
		dates.set(id, { taskId: id, startDate: start, endDate: end });
	}

	return dates;
}

/**
 * Copy a task and append implicit stage-boundary blockers onto `blockedBy`
 * so {@link earliestStart} does not need a second code path.
 *
 * @param boundaries - Pre-filtered `isStageBoundary` tasks with a stage sequence
 *   (same predicate as {@link buildAdjacency}'s implicit-edge pass).
 */
function materialiseImplicitBlockers(
	task: SchedulableTask,
	boundaries: readonly SchedulableTask[],
): SchedulableTask {
	if (task.stageSequence == null) {
		return task;
	}
	const extra: TaskId[] = [];
	for (const other of boundaries) {
		// Defensive: callers should already filter, but null sequence must not block.
		if (other.stageSequence == null) {
			continue;
		}
		if (task.stageSequence > other.stageSequence && !task.blockedBy.includes(other.id)) {
			extra.push(other.id);
		}
	}
	if (extra.length === 0) {
		return task;
	}
	return { ...task, blockedBy: [...task.blockedBy, ...extra] };
}

// ---------------------------------------------------------------------------
// Public Scheduler
// ---------------------------------------------------------------------------

/**
 * Stateful façade around the pure DAG functions.
 *
 * The class is intentionally free of the Obsidian API so it can be unit-tested
 * and later moved to a Web Worker if graph size demands it. Callers (commands,
 * UI) are responsible for persisting the returned dates via `vault.process`.
 */
export class Scheduler {
	/**
	 * Inspect the graph and return every cycle. Empty array means the graph is a DAG.
	 */
	public detectCycles(tasks: readonly SchedulableTask[]): TaskId[][] {
		return detectCycles(tasks);
	}

	/**
	 * Check a prospective `blocked_by` edge before writing it.
	 *
	 * @returns The first cycle path if the edge is illegal, otherwise `null`.
	 */
	public wouldCreateCycle(
		tasks: readonly SchedulableTask[],
		blockerId: TaskId,
		dependentId: TaskId,
	): TaskId[] | null {
		return wouldCreateCycle(tasks, blockerId, dependentId);
	}

	/**
	 * Topologically sort `tasks`. `order` is empty-of-cyclic-nodes when cycles exist;
	 * inspect `cycles` before using the order for a date sweep.
	 */
	public topologicalOrder(tasks: readonly SchedulableTask[]): {
		order: TaskId[];
		cycles: TaskId[][];
	} {
		return topologicalOrder(tasks);
	}

	/**
	 * Full auto-schedule from a project start date (ASAP by default).
	 *
	 * @throws {CycleDetectedError} when the graph is not a DAG.
	 */
	public autoSchedule(
		tasks: readonly SchedulableTask[],
		options: AutoScheduleOptions,
	): ScheduleResult {
		const { order, cycles } = topologicalOrder(tasks);
		if (cycles.length > 0) {
			throw new CycleDetectedError(cycles);
		}
		const asap = options.asSoonAsPossible !== false;
		const dates = sweepDates(tasks, order, options.projectStart, asap);
		return { order, cycles, dates };
	}

	/**
	 * Recalculate dependents after a blocking task slips.
	 *
	 * The changed task is pinned to `newEndDate`; its own duration is preserved
	 * by shifting its start backward (`end - duration + 1`) unless duration is 0.
	 * Dependents keep *their* duration and are pushed forward only when the new
	 * blocker end makes the current start infeasible. Dates are never pulled
	 * earlier (a slip must not surprise the user by compressing the plan).
	 *
	 * @throws {CycleDetectedError} when the graph is not a DAG.
	 * @throws {UnknownTaskError} when `changedId` is not in `tasks`.
	 */
	public cascade(
		tasks: readonly SchedulableTask[],
		changedId: TaskId,
		newEndDate: IsoDate,
	): ScheduleResult {
		const { order, cycles } = topologicalOrder(tasks);
		if (cycles.length > 0) {
			throw new CycleDetectedError(cycles);
		}

		const pinned = tasks.map((task) => {
			if (task.id !== changedId) {
				return task;
			}
			const start =
				task.durationDays <= 0
					? newEndDate
					: addDays(newEndDate, -(task.durationDays - 1));
			return { ...task, startDate: start, endDate: newEndDate };
		});

		const changed = pinned.find((task) => task.id === changedId);
		if (!changed) {
			throw new UnknownTaskError(changedId);
		}

		// Floor is the pinned task's start (or its end for zero-duration), which
		// lets unconstrained siblings keep their own dates (asap = false).
		const floor = changed.startDate ?? newEndDate;
		const dates = sweepDates(pinned, order, floor, false);

		// Force the pinned end even if sweep recomputed it from duration.
		const swept = dates.get(changedId);
		if (swept) {
			dates.set(changedId, {
				taskId: changedId,
				startDate: changed.startDate ?? swept.startDate,
				endDate: newEndDate,
			});
		}

		return { order, cycles, dates };
	}

	/**
	 * Convert a {@link ScheduleResult} into undoable {@link DatePatch} rows
	 * against the pre-schedule snapshot.
	 */
	public diff(tasks: readonly SchedulableTask[], result: ScheduleResult): DatePatch[] {
		const byId = new Map(tasks.map((task) => [task.id, task] as const));
		const patches: DatePatch[] = [];
		for (const [id, next] of result.dates) {
			const previous = byId.get(id);
			if (!previous) {
				continue;
			}
			if (previous.startDate === next.startDate && previous.endDate === next.endDate) {
				continue;
			}
			patches.push({
				taskId: id,
				previousStart: previous.startDate,
				previousEnd: previous.endDate,
				nextStart: next.startDate,
				nextEnd: next.endDate,
			});
		}
		return patches;
	}
}

// ---------------------------------------------------------------------------
// Command Pattern (undo / redo)
// ---------------------------------------------------------------------------

/**
 * Linear undo/redo stack. New executions drop the redo branch (standard editor
 * semantics). Commands are expected to be in-memory; persistence is the
 * caller's job inside `execute` / `undo` via `vault.process`.
 */
export class CommandStack {
	private readonly undoStack: EngineCommand[] = [];
	private readonly redoStack: EngineCommand[] = [];

	/** Maximum retained commands to bound memory on mobile. */
	constructor(private readonly maxDepth = 50) {}

	/**
	 * Execute `command` and push it onto the undo stack.
	 */
	public execute(command: EngineCommand): void {
		command.execute();
		this.undoStack.push(command);
		this.redoStack.length = 0;
		while (this.undoStack.length > this.maxDepth) {
			this.undoStack.shift();
		}
	}

	/** Reverse the most recent command. No-op when the stack is empty. */
	public undo(): boolean {
		const command = this.undoStack.pop();
		if (!command) {
			return false;
		}
		command.undo();
		this.redoStack.push(command);
		return true;
	}

	/** Re-apply the most recently undone command. */
	public redo(): boolean {
		const command = this.redoStack.pop();
		if (!command) {
			return false;
		}
		command.execute();
		this.undoStack.push(command);
		return true;
	}

	/** True when at least one command can be undone. */
	public get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	/** True when at least one undone command can be re-applied. */
	public get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** Drop both stacks (e.g. after closing a project workspace). */
	public clear(): void {
		this.undoStack.length = 0;
		this.redoStack.length = 0;
	}
}

/**
 * Command that applies / reverts a set of date patches on an in-memory task list.
 * Persistence (writing YAML) should wrap this command or live in a subclass.
 */
export class CascadeScheduleCommand implements EngineCommand {
	public readonly description = "Cascade auto-schedule";

	constructor(
		private readonly tasks: SchedulableTask[],
		private readonly patches: DatePatch[],
	) {}

	public execute(): void {
		this.apply("next");
	}

	public undo(): void {
		this.apply("previous");
	}

	private apply(side: "next" | "previous"): void {
		const byId = new Map(this.tasks.map((task) => [task.id, task] as const));
		for (const patch of this.patches) {
			const task = byId.get(patch.taskId);
			if (!task) {
				continue;
			}
			if (side === "next") {
				task.startDate = patch.nextStart;
				task.endDate = patch.nextEnd;
			} else {
				task.startDate = patch.previousStart;
				task.endDate = patch.previousEnd;
			}
		}
	}
}
