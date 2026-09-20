/**
 * Undoable task mutations that persist through `vault.process`.
 *
 * Each command captures enough state to reverse the write. The CommandStack
 * in {@link Scheduler} owns the undo/redo order; these commands own I/O.
 */

import type { TFile, Vault } from "obsidian";
import type {
	DatePatch,
	EngineCommand,
	IsoDate,
	SchedulableTask,
	TaskId,
	TaskPriority,
} from "../models/types";
import { buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import { processNote } from "./vaultIo";

/**
 * Apply / revert schedule date patches on task notes on disk.
 */
export class PersistCascadeCommand implements EngineCommand {
	public readonly description: string;

	constructor(
		private readonly vault: Vault,
		private readonly fileByTaskId: Map<TaskId, TFile>,
		private readonly patches: DatePatch[],
		description = "Cascade auto-schedule",
	) {
		this.description = description;
	}

	public execute(): void {
		void this.apply("next");
	}

	public undo(): void {
		void this.apply("previous");
	}

	private async apply(side: "next" | "previous"): Promise<void> {
		for (const patch of this.patches) {
			const file = this.fileByTaskId.get(patch.taskId);
			if (!file) {
				continue;
			}
			const start = side === "next" ? patch.nextStart : patch.previousStart;
			const end = side === "next" ? patch.nextEnd : patch.previousEnd;
			await processNote(this.vault, file, (current) => {
				const { data, body } = splitFrontmatter(current);
				data.start_date = start;
				data.end_date = end;
				return buildMarkdownNote(data, body);
			});
		}
	}
}

/**
 * Snapshot + restore a single task's dependency lists (blocked_by / blocking).
 */
export class PersistDependencyCommand implements EngineCommand {
	public readonly description = "Update task dependencies";

	constructor(
		private readonly vault: Vault,
		private readonly dependentFile: TFile,
		private readonly blockerFiles: Map<TaskId, TFile>,
		_dependentId: TaskId,
		private readonly previousBlockedBy: TaskId[],
		private readonly nextBlockedBy: TaskId[],
		private readonly previousBlockingOnBlockers: Map<TaskId, TaskId[]>,
		private readonly nextBlockingOnBlockers: Map<TaskId, TaskId[]>,
	) {}

	public execute(): void {
		void this.write(this.nextBlockedBy, this.nextBlockingOnBlockers);
	}

	public undo(): void {
		void this.write(this.previousBlockedBy, this.previousBlockingOnBlockers);
	}

	private async write(
		blockedBy: TaskId[],
		blockingOnBlockers: Map<TaskId, TaskId[]>,
	): Promise<void> {
		await processNote(this.vault, this.dependentFile, (current) => {
			const { data, body } = splitFrontmatter(current);
			data.blocked_by = blockedBy;
			return buildMarkdownNote(data, body);
		});
		for (const [blockerId, blocking] of blockingOnBlockers) {
			const file = this.blockerFiles.get(blockerId);
			if (!file) {
				continue;
			}
			await processNote(this.vault, file, (current) => {
				const { data, body } = splitFrontmatter(current);
				data.blocking = blocking;
				return buildMarkdownNote(data, body);
			});
		}
	}
}

/**
 * Snapshot + restore status on a task note (used by Kanban moves + table checkbox).
 *
 * `execute` / `undo` stay synchronous for {@link CommandStack}, but callers that
 * refresh views afterwards must `await settled()` so `vault.process` finishes
 * before the indexer / table reloads YAML.
 */
export class PersistStatusCommand implements EngineCommand {
	public readonly description: string;
	private writePromise: Promise<void> = Promise.resolve();

	constructor(
		private readonly vault: Vault,
		private readonly file: TFile,
		private readonly previousStatus: string,
		private readonly nextStatus: string,
	) {
		this.description = `Status ${previousStatus} → ${nextStatus}`;
	}

	public execute(): void {
		this.writePromise = this.write(this.nextStatus);
	}

	public undo(): void {
		this.writePromise = this.write(this.previousStatus);
	}

	/** Resolves when the latest status write through `vault.process` finishes. */
	public settled(): Promise<void> {
		return this.writePromise;
	}

	private async write(status: string): Promise<void> {
		await processNote(this.vault, this.file, (current) => {
			const { data, body } = splitFrontmatter(current);
			data.status = status;
			return buildMarkdownNote(data, body);
		});
	}
}

/**
 * Snapshot + restore Eisenhower matrix moves.
 *
 * Placement rule:
 * - **Important** — explicit YAML `important`
 * - **Urgent** — derived from Priority (`high` | `urgent`); never written as YAML `urgent`
 *
 * Writes `important` + adjusted `priority`, and strips any legacy `urgent` key.
 */
export class PersistEisenhowerCommand implements EngineCommand {
	public readonly description: string;

	constructor(
		private readonly vault: Vault,
		private readonly file: TFile,
		private readonly previous: { important: boolean | null; priority: TaskPriority },
		private readonly next: { important: boolean; priority: TaskPriority },
	) {
		this.description = `Eisenhower → important=${next.important}, priority=${next.priority}`;
	}

	public execute(): void {
		void this.write(this.next.important, this.next.priority);
	}

	public undo(): void {
		void this.write(this.previous.important, this.previous.priority);
	}

	private async write(important: boolean | null, priority: TaskPriority): Promise<void> {
		await processNote(this.vault, this.file, (current) => {
			const { data, body } = splitFrontmatter(current);
			if (important == null) {
				delete data.important;
			} else {
				data.important = important;
			}
			data.priority = priority;
			// Strip obsolete YAML urgent — Priority is the source of truth for Urgent.
			delete data.urgent;
			return buildMarkdownNote(data, body);
		});
	}
}

/**
 * Build reverse `blocking` maps after changing a dependent's `blocked_by`.
 */
export function recomputeBlockingMaps(
	allTasks: readonly { id: TaskId; blockedBy: TaskId[]; blocking: TaskId[] }[],
	dependentId: TaskId,
	newBlockedBy: TaskId[],
): {
	previousBlockingOnBlockers: Map<TaskId, TaskId[]>;
	nextBlockingOnBlockers: Map<TaskId, TaskId[]>;
} {
	const previousBlockingOnBlockers = new Map<TaskId, TaskId[]>();
	const nextBlockingOnBlockers = new Map<TaskId, TaskId[]>();
	const byId = new Map(allTasks.map((task) => [task.id, task] as const));
	const dependent = byId.get(dependentId);
	const oldBlockedBy = dependent?.blockedBy ?? [];

	const touched = new Set<TaskId>([...oldBlockedBy, ...newBlockedBy]);
	for (const blockerId of touched) {
		const blocker = byId.get(blockerId);
		if (!blocker) {
			continue;
		}
		previousBlockingOnBlockers.set(blockerId, [...blocker.blocking]);
		const next = blocker.blocking.filter((id) => id !== dependentId);
		if (newBlockedBy.includes(blockerId) && !next.includes(dependentId)) {
			next.push(dependentId);
		}
		nextBlockingOnBlockers.set(blockerId, next);
	}
	return { previousBlockingOnBlockers, nextBlockingOnBlockers };
}

/**
 * Helper: map schedule result patches onto in-memory schedulable tasks.
 */
export function applyPatchesInMemory(
	tasks: SchedulableTask[],
	patches: DatePatch[],
	side: "next" | "previous",
): void {
	const byId = new Map(tasks.map((task) => [task.id, task] as const));
	for (const patch of patches) {
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

/**
 * Convenience constructor for a date-only patch list (tests / cascade UI).
 */
export function datePatch(
	taskId: TaskId,
	previousStart: IsoDate | null,
	previousEnd: IsoDate | null,
	nextStart: IsoDate,
	nextEnd: IsoDate,
): DatePatch {
	return { taskId, previousStart, previousEnd, nextStart, nextEnd };
}
