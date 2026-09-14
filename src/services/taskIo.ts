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
	IsoDate,
	SchedulableTask,
	Task,
	TaskId,
	TaskStatus,
	TimeLog,
	WikiLink,
} from "../models/types";
import { toWikiLink, wikiLinkTarget } from "../models/types";
import { buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import { computeMandayRollup, parseTimeLogs, serialiseTimeLogs } from "./timeLogs";
import { joinVaultPath, noteExists, processNote, sanitiseNoteBasename, writeNoteAtomic } from "./vaultIo";

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
	blockedBy: TaskId[];
	blocking: TaskId[];
	startDate: IsoDate | null;
	endDate: IsoDate | null;
	durationDays: number;
	estimateMandays: number;
	timeLogs: TimeLog[];
	status: TaskStatus;
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
}): TaskDraft {
	return {
		id: args.id,
		title: "",
		project: args.projectLink,
		projectId: args.projectId,
		parentId: args.parentId,
		childIds: [],
		blockedBy: [],
		blocking: [],
		startDate: null,
		endDate: null,
		durationDays: 1,
		estimateMandays: 0,
		timeLogs: [],
		status: "backlog",
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
	const estimate =
		typeof data.estimate_mandays === "number"
			? data.estimate_mandays
			: Number(data.estimate_mandays) || 0;
	const rollup = computeMandayRollup(estimate, timeLogs, hoursPerManday);

	return {
		id,
		title,
		project,
		projectId,
		parentId: typeof data.parent_id === "string" ? data.parent_id : null,
		childIds: readStringArray(data.child_ids),
		blockedBy: readStringArray(data.blocked_by),
		blocking: readStringArray(data.blocking),
		startDate: typeof data.start_date === "string" ? data.start_date : null,
		endDate: typeof data.end_date === "string" ? data.end_date : null,
		durationDays:
			typeof data.duration_days === "number"
				? data.duration_days
				: Number(data.duration_days) || 0,
		estimateMandays: estimate,
		actualMandays: rollup.actualMandays,
		remainingMandays: rollup.remainingMandays,
		timeLogs,
		status: (typeof data.status === "string" ? data.status : "backlog") as TaskStatus,
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
	const rollup = computeMandayRollup(draft.estimateMandays, draft.timeLogs, hoursPerManday);
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
		duration_days: draft.durationDays,
		estimate_mandays: draft.estimateMandays,
		actual_mandays: rollup.actualMandays,
		remaining_mandays: rollup.remainingMandays,
		time_logs: serialiseTimeLogs(draft.timeLogs),
		status: draft.status,
		is_milestone: draft.isMilestone,
		is_stage_boundary: draft.isStageBoundary,
		custom_fields: draft.customFields,
	};
	if (draft.stageId) frontmatter.stage_id = draft.stageId;
	if (draft.stageSequence != null) frontmatter.stage_sequence = draft.stageSequence;
	if (draft.workPackageId) frontmatter.work_package_id = draft.workPackageId;
	if (draft.assignee) frontmatter.assignee = draft.assignee;
	if (draft.notes) frontmatter.notes = draft.notes;

	const body = [
		`# ${draft.title.trim() || draft.id}`,
		"",
		draft.notes?.trim() ? draft.notes.trim() + "\n" : "",
		`Project: ${draft.project}`,
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
		startDate: task.startDate,
		endDate: task.endDate,
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
		list.sort((a, b) => a.title.localeCompare(b.title));
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
