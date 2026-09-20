/**
 * Task note I/O: parse frontmatter, build Markdown, and persist exclusively
 * through `vault.process` (via {@link writeNoteAtomic} / {@link processNote}).
 *
 * Task ids are globally unique (`{projectId}#{localId}`) so intra- and
 * cross-project dependencies share one identifier space with the Scheduler.
 */

import { TFile, type App, type Vault } from "obsidian";
import type {
	CustomFieldMap,
	SchedulableTask,
	Task,
	TaskId,
	TaskPriority,
	TaskStatus,
	TimeLog,
	WikiLink,
} from "../models/types";
import { toWikiLink, wikiLinkTarget } from "../models/types";
import { buildGraphLinksSection, buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import {
	computeEffortRollup,
	hoursToGiornate,
	parseTimeLogs,
	resolveEstimateHours,
	serialiseTimeLogs,
} from "./timeLogs";
import { calendarDatePart } from "./dateFormat";
import { compareTasksBySortOrder } from "./taskOrder";
import { joinVaultPath, noteExists, processNote, sanitiseNoteBasename, writeNoteAtomic } from "./vaultIo";

const TASK_PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Mutable draft used by the task editor before persistence.
 */
export interface TaskDraft {
	id: TaskId;
	title: string;
	project: WikiLink;
	projectId: string;
	parentId: TaskId | null;
	childIds: TaskId[];
	/**
	 * Manual sibling order (`sort_order` in YAML). `null` when unset.
	 * @see Task.sortOrder
	 */
	sortOrder: number | null;
	blockedBy: TaskId[];
	blocking: TaskId[];
	/** Start date with optional time (`start_date`): `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
	startDate: string | null;
	/** End date with optional time (`end_date`): same form as {@link startDate}. */
	endDate: string | null;
	/** Due date with optional time (`due`). */
	due: string | null;
	/** Scheduled date with optional time (`scheduled`). */
	scheduled: string | null;
	durationDays: number;
	/** Planned effort in hours (fractions OK). */
	estimateHours: number;
	timeLogs: TimeLog[];
	status: TaskStatus;
	priority: TaskPriority;
	/**
	 * Explicit Eisenhower Important flag (`null` = unset → treated as false).
	 * Urgent is derived from {@link priority} (`high` | `urgent`), not stored.
	 */
	important: boolean | null;
	/**
	 * @deprecated Legacy only; not written on save. Prefer Priority for Urgent.
	 */
	urgent?: boolean | null;
	isMilestone: boolean;
	isStageBoundary: boolean;
	stageId?: string;
	stageSequence?: number;
	workPackageId?: string;
	assignee?: WikiLink;
	notes?: string;
	customFields: CustomFieldMap;
	filePath: string;
}

/**
 * Allocate the next local task id for a project (`T-1`, `T-2`, …).
 *
 * @param projectId - Owning project id.
 * @param existingIds - Already-used full task ids (any project).
 */
export function nextTaskId(projectId: string, existingIds: Iterable<TaskId>): TaskId {
	const prefix = `${projectId}#T-`;
	let max = 0;
	for (const id of existingIds) {
		if (!id.startsWith(prefix)) {
			continue;
		}
		const n = Number.parseInt(id.slice(prefix.length), 10);
		if (Number.isFinite(n) && n > max) {
			max = n;
		}
	}
	return `${prefix}${max + 1}`;
}

/**
 * Build a blank draft under an optional parent.
 */
export function blankTaskDraft(args: {
	id: TaskId;
	projectId: string;
	projectLink: WikiLink;
	parentId: TaskId | null;
	filePath: string;
	stageId?: string;
	stageSequence?: number;
	/** Default status id from Settings (falls back to `"backlog"`). */
	status?: TaskStatus;
	priority?: TaskPriority;
}): TaskDraft {
	const priority = args.priority ?? "none";
	return {
		id: args.id,
		title: "",
		project: args.projectLink,
		projectId: args.projectId,
		parentId: args.parentId,
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
		timeLogs: [],
		status: args.status ?? "backlog",
		priority,
		important: false,
		isMilestone: false,
		isStageBoundary: false,
		stageId: args.stageId,
		stageSequence: args.stageSequence,
		notes: "",
		customFields: {},
		filePath: args.filePath,
	};
}

/**
 * Parse a task Markdown note into a {@link Task} (or null when pe_type mismatches).
 */
export function parseTaskNote(
	file: TFile,
	markdown: string,
	hoursPerManday: number,
): Task | null {
	const { data } = splitFrontmatter(markdown);
	if (data.pe_type !== "task") {
		return null;
	}
	const id = typeof data.id === "string" ? data.id : "";
	const title = typeof data.title === "string" ? data.title : file.basename;
	const project = typeof data.project === "string" ? toWikiLink(data.project) : "";
	const projectId =
		typeof data.project_id === "string"
			? data.project_id
			: id.includes("#")
				? id.slice(0, id.indexOf("#"))
				: "";
	const timeLogs = parseTimeLogs(data.time_logs);
	const estimateHours = resolveEstimateHours(data, hoursPerManday);
	const rollup = computeEffortRollup(estimateHours, timeLogs, hoursPerManday);

	return {
		id,
		title,
		project,
		projectId,
		parentId: typeof data.parent_id === "string" ? data.parent_id : null,
		childIds: readStringArray(data.child_ids),
		sortOrder: readOptionalNumber(data.sort_order),
		blockedBy: readStringArray(data.blocked_by),
		blocking: readStringArray(data.blocking),
		startDate: readDateTimeField(data.start_date),
		endDate: readDateTimeField(data.end_date),
		due: readDateTimeField(data.due) ?? readDateTimeField(data.end_date),
		scheduled: readDateTimeField(data.scheduled),
		durationDays:
			typeof data.duration_days === "number"
				? data.duration_days
				: Number(data.duration_days) || 0,
		estimateHours,
		estimateMandays: rollup.estimateGiornate,
		actualMandays: rollup.actualGiornate,
		remainingMandays: rollup.remainingGiornate,
		actualHours: rollup.actualHours,
		remainingHours: rollup.remainingHours,
		timeLogs,
		status: parseTaskStatus(data.status),
		priority: parsePriority(data.priority),
		important: readOptionalBoolean(data.important),
		// Legacy YAML `urgent` — parsed for safe loads, ignored for placement.
		urgent: readOptionalBoolean(data.urgent),
		isMilestone: data.is_milestone === true,
		isStageBoundary: data.is_stage_boundary === true,
		stageId: typeof data.stage_id === "string" ? data.stage_id : undefined,
		stageSequence:
			typeof data.stage_sequence === "number" ? data.stage_sequence : undefined,
		workPackageId: typeof data.work_package_id === "string" ? data.work_package_id : undefined,
		assignee: typeof data.assignee === "string" ? toWikiLink(data.assignee) : undefined,
		filePath: file.path,
		notes: typeof data.notes === "string" ? data.notes : undefined,
		customFields: readCustomFields(data.custom_fields),
	};
}

/**
 * Convert a {@link Task} / {@link TaskDraft} into YAML + body Markdown.
 */
export function buildTaskMarkdown(draft: TaskDraft, hoursPerManday: number): string {
	const rollup = computeEffortRollup(draft.estimateHours, draft.timeLogs, hoursPerManday);
	const frontmatter: Record<string, unknown> = {
		pe_type: "task",
		id: draft.id,
		title: draft.title.trim(),
		project: draft.project,
		project_id: draft.projectId,
		parent_id: draft.parentId,
		child_ids: draft.childIds,
		blocked_by: draft.blockedBy,
		blocking: draft.blocking,
		start_date: draft.startDate,
		end_date: draft.endDate,
		due: draft.due,
		scheduled: draft.scheduled,
		duration_days: draft.durationDays,
		estimate_hours: draft.estimateHours,
		// Legacy giornate mirror for older notes / external tools.
		estimate_mandays: hoursToGiornate(draft.estimateHours, hoursPerManday),
		actual_hours: rollup.actualHours,
		remaining_hours: rollup.remainingHours,
		actual_mandays: rollup.actualGiornate,
		remaining_mandays: rollup.remainingGiornate,
		time_logs: serialiseTimeLogs(draft.timeLogs),
		status: draft.status,
		priority: draft.priority,
		is_milestone: draft.isMilestone,
		is_stage_boundary: draft.isStageBoundary,
		custom_fields: draft.customFields,
	};
	// Persist Important when explicitly set. Never write YAML `urgent` —
	// Urgent is derived from Priority (`high` | `urgent`). Strip legacy key.
	if (draft.important != null) {
		frontmatter.important = draft.important;
	}
	if (draft.sortOrder != null && Number.isFinite(draft.sortOrder)) {
		frontmatter.sort_order = draft.sortOrder;
	}
	// Intentionally omit / strip legacy `urgent` on every write.
	delete frontmatter.urgent;
	if (draft.stageId) frontmatter.stage_id = draft.stageId;
	if (draft.stageSequence != null) frontmatter.stage_sequence = draft.stageSequence;
	if (draft.workPackageId) frontmatter.work_package_id = draft.workPackageId;
	if (draft.assignee) frontmatter.assignee = draft.assignee;
	if (draft.notes) frontmatter.notes = draft.notes;

	const graphLinks: { label: string; wikiLink: string }[] = [
		{ label: "Project", wikiLink: draft.project },
	];
	if (draft.assignee) {
		graphLinks.push({ label: "Assignee", wikiLink: draft.assignee });
	}

	const body = [
		`# ${draft.title.trim() || draft.id}`,
		"",
		draft.notes?.trim() ? draft.notes.trim() + "\n" : "",
		buildGraphLinksSection(graphLinks),
		draft.parentId ? `Parent: \`${draft.parentId}\`` : "",
		"",
	]
		.filter((line) => line !== undefined)
		.join("\n");

	return buildMarkdownNote(frontmatter, body);
}

/**
 * Persist a new or existing task note atomically.
 */
export async function saveTaskNote(
	vault: Vault,
	draft: TaskDraft,
	hoursPerManday: number,
): Promise<TFile> {
	const markdown = buildTaskMarkdown(draft, hoursPerManday);
	return writeNoteAtomic(vault, draft.filePath, markdown);
}

/**
 * Patch YAML fields on an existing task through `vault.process`.
 */
export async function patchTaskFrontmatter(
	vault: Vault,
	file: TFile,
	patch: (data: Record<string, unknown>) => void,
): Promise<void> {
	await processNote(vault, file, (current) => {
		const { data, body } = splitFrontmatter(current);
		patch(data);
		return buildMarkdownNote(data, body);
	});
}

/**
 * Suggested vault path for a new task note.
 */
export function taskNotePath(tasksFolder: string, taskId: TaskId, title: string): string {
	const safeTitle = sanitiseNoteBasename(title || wikiLinkTarget(taskId));
	const safeId = sanitiseNoteBasename(taskId.replace("#", "-"));
	const basename = safeTitle ? `${safeId} ${safeTitle}` : safeId;
	return joinVaultPath(tasksFolder, `${basename}.md`);
}

/**
 * Load every task note in the vault (by pe_type or tasks folder).
 */
export async function loadAllTasks(
	app: App,
	tasksFolder: string,
	hoursPerManday: number,
): Promise<Task[]> {
	const tasks: Task[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const peType = app.metadataCache.getFileCache(file)?.frontmatter?.pe_type;
		const inFolder = file.path.replace(/\\/g, "/").startsWith(tasksFolder.replace(/\\/g, "/") + "/");
		if (peType !== "task" && !inFolder) {
			continue;
		}
		const markdown = await app.vault.cachedRead(file);
		const task = parseTaskNote(file, markdown, hoursPerManday);
		if (task) {
			tasks.push(task);
		}
	}
	return tasks;
}

/**
 * Project a {@link Task} into the Scheduler DTO.
 */
export function toSchedulable(task: Task | TaskDraft): SchedulableTask {
	return {
		id: task.id,
		durationDays: task.durationDays,
		// Scheduler is day-granular; strip optional wall-clock times from start/end.
		startDate: calendarDatePart(task.startDate),
		endDate: calendarDatePart(task.endDate),
		blockedBy: [...task.blockedBy],
		stageSequence: task.stageSequence,
		isStageBoundary: task.isStageBoundary,
	};
}

/**
 * Build a parent → children tree map (arbitrary depth).
 */
export function buildTaskTree(tasks: readonly Task[]): Map<TaskId | null, Task[]> {
	const tree = new Map<TaskId | null, Task[]>();
	for (const task of tasks) {
		const key = task.parentId;
		const list = tree.get(key) ?? [];
		list.push(task);
		tree.set(key, list);
	}
	for (const [, list] of tree) {
		list.sort(compareTasksBySortOrder);
	}
	return tree;
}

/**
 * Ensure a unique path when creating a task note.
 */
export function uniqueTaskPath(vault: Vault, preferred: string): string {
	if (!noteExists(vault, preferred)) {
		return preferred;
	}
	const dot = preferred.lastIndexOf(".md");
	const base = dot >= 0 ? preferred.slice(0, dot) : preferred;
	let i = 2;
	while (noteExists(vault, `${base}-${i}.md`)) {
		i += 1;
	}
	return `${base}-${i}.md`;
}

function parsePriority(raw: unknown): TaskPriority {
	if (typeof raw === "string" && (TASK_PRIORITIES as string[]).includes(raw)) {
		return raw as TaskPriority;
	}
	return "none";
}

/**
 * Accept any non-empty string status (Settings-driven columns).
 * Empty / missing → `"backlog"` for graceful migration of older notes.
 */
function parseTaskStatus(raw: unknown): TaskStatus {
	if (typeof raw === "string" && raw.trim()) {
		return raw.trim();
	}
	return "backlog";
}

/**
 * Parse an optional YAML boolean. Missing / non-boolean → `null` so callers
 * can soft-infer Eisenhower placement without rewriting the note.
 */
function readOptionalBoolean(raw: unknown): boolean | null {
	if (raw === true || raw === false) {
		return raw;
	}
	return null;
}

/**
 * Parse an optional YAML number (`sort_order`). Missing / non-finite → `null`.
 */
function readOptionalNumber(raw: unknown): number | null {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return raw;
	}
	if (typeof raw === "string" && raw.trim()) {
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function readStringArray(raw: unknown): string[] {
	if (typeof raw === "string" && raw.trim()) {
		return [raw.trim()];
	}
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readCustomFields(raw: unknown): CustomFieldMap {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return {};
	}
	const result: CustomFieldMap = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean" ||
			value === null ||
			(Array.isArray(value) && value.every((item) => typeof item === "string"))
		) {
			result[key] = value as CustomFieldMap[string];
		}
	}
	return result;
}

/**
 * Parse YAML date-time fields (`start_date`, `end_date`, `due`, `scheduled`):
 * `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (also space separator).
 */
function readDateTimeField(raw: unknown): string | null {
	if (typeof raw !== "string" || !raw.trim()) {
		return null;
	}
	const trimmed = raw.trim();
	const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(trimmed);
	if (!match) {
		return trimmed;
	}
	if (match[2] != null && match[3] != null) {
		return `${match[1]}T${match[2]}:${match[3]}`;
	}
	return match[1]!;
}
