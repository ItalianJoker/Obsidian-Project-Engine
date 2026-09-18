/**
 * Task-list templates — Entity-as-a-Note blueprints assigned to projects.
 *
 * Templates live under Settings `taskListTemplatesFolder` with
 * `pe_type: task-list-template` and a nested YAML `tasks` tree. Applying a
 * template materialises real task notes under the project’s `Tasks/` folder
 * with `parent_id` / `child_ids`, Obsidian tags (via {@link buildMarkdownNote}),
 * and Graph `## Links`. All writes go through `vault.process`.
 */

import { Notice, TFile, type App, type Vault } from "obsidian";
import {
	TASK_LIST_TEMPLATE_PE_TYPE,
	defaultTaskStatusId,
	toWikiLink,
	wikiLinkTarget,
	type ProjectsEngineSettings,
	type TaskId,
	type TaskListTemplate,
	type TaskListTemplateItem,
	type TaskPriority,
	type TaskStatus,
	type WikiLink,
} from "../models/types";
import { buildGraphLinksSection, buildMarkdownNote, splitFrontmatter } from "./frontmatter";
import { patchProjectFrontmatter } from "./projectIo";
import { resolveProjectTasksFolder } from "./projectScaffold";
import {
	blankTaskDraft,
	loadAllTasks,
	nextTaskId,
	saveTaskNote,
	taskNotePath,
	uniqueTaskPath,
	type TaskDraft,
} from "./taskIo";
import { ensureFolder, joinVaultPath, sanitiseNoteBasename, writeNoteAtomic } from "./vaultIo";

const TASK_PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Flattened node produced while walking a template tree (pre-order DFS).
 * Used to allocate ids and wire parent/child links before writing notes.
 */
export interface FlattenedTemplateTask {
	/** Stable index in the flattened list (also used as temp key). */
	index: number;
	/** Index of the parent in the flattened list, or `null` for roots. */
	parentIndex: number | null;
	item: TaskListTemplateItem;
}

/**
 * Result of {@link applyTaskListTemplate}.
 */
export interface ApplyTaskListTemplateResult {
	/** Number of task notes created. */
	created: number;
	/** Absolute vault paths of the new notes. */
	paths: string[];
}

/**
 * Parse nested YAML `tasks` into typed {@link TaskListTemplateItem} nodes.
 * Invalid / empty titles are skipped; unknown statuses/priorities are dropped.
 */
export function parseTemplateTaskItems(raw: unknown): TaskListTemplateItem[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const items: TaskListTemplateItem[] = [];
	for (const entry of raw) {
		const parsed = parseOneTemplateItem(entry);
		if (parsed) {
			items.push(parsed);
		}
	}
	return items;
}

function parseOneTemplateItem(raw: unknown): TaskListTemplateItem | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return null;
	}
	const row = raw as Record<string, unknown>;
	const title = typeof row.title === "string" ? row.title.trim() : "";
	if (!title) {
		return null;
	}
	const item: TaskListTemplateItem = { title };
	if (typeof row.status === "string" && row.status.trim()) {
		item.status = row.status.trim() as TaskStatus;
	}
	if (typeof row.priority === "string" && (TASK_PRIORITIES as string[]).includes(row.priority)) {
		item.priority = row.priority as TaskPriority;
	}
	const hours =
		typeof row.estimate_hours === "number"
			? row.estimate_hours
			: typeof row.estimateHours === "number"
				? row.estimateHours
				: Number(row.estimate_hours);
	if (Number.isFinite(hours) && hours >= 0) {
		item.estimateHours = hours;
	}
	if (typeof row.notes === "string" && row.notes.trim()) {
		item.notes = row.notes.trim();
	}
	const children = parseTemplateTaskItems(row.children);
	if (children.length > 0) {
		item.children = children;
	}
	return item;
}

/**
 * Parse a template Markdown note into a {@link TaskListTemplate}.
 *
 * @returns `null` when `pe_type` is not a task-list template.
 */
export function parseTaskListTemplateNote(
	file: TFile,
	markdown: string,
): TaskListTemplate | null {
	const { data } = splitFrontmatter(markdown);
	if (data.pe_type !== TASK_LIST_TEMPLATE_PE_TYPE) {
		return null;
	}
	const name =
		typeof data.name === "string" && data.name.trim()
			? data.name.trim()
			: file.basename;
	return {
		name,
		description:
			typeof data.description === "string" && data.description.trim()
				? data.description.trim()
				: undefined,
		tasks: parseTemplateTaskItems(data.tasks),
		filePath: file.path,
		wikiLink: toWikiLink(file.basename),
	};
}

/**
 * Serialise template items for YAML (snake_case keys).
 */
export function serialiseTemplateTaskItems(
	items: readonly TaskListTemplateItem[],
): Record<string, unknown>[] {
	return items.map((item) => {
		const row: Record<string, unknown> = { title: item.title.trim() };
		if (item.status) row.status = item.status;
		if (item.priority && item.priority !== "none") row.priority = item.priority;
		if (item.estimateHours != null && item.estimateHours > 0) {
			row.estimate_hours = item.estimateHours;
		}
		if (item.notes?.trim()) row.notes = item.notes.trim();
		if (item.children && item.children.length > 0) {
			row.children = serialiseTemplateTaskItems(item.children);
		}
		return row;
	});
}

/**
 * Build Markdown for a task-list template note (tags via {@link buildMarkdownNote}).
 */
export function buildTaskListTemplateMarkdown(args: {
	name: string;
	description?: string;
	tasks: readonly TaskListTemplateItem[];
}): string {
	const name = args.name.trim();
	const frontmatter: Record<string, unknown> = {
		pe_type: TASK_LIST_TEMPLATE_PE_TYPE,
		name,
		tasks: serialiseTemplateTaskItems(args.tasks),
	};
	if (args.description?.trim()) {
		frontmatter.description = args.description.trim();
	}
	const body = [
		`# ${name}`,
		"",
		args.description?.trim() ? `${args.description.trim()}\n` : "",
		"## Task list",
		"",
		"Edit this note’s YAML `tasks` tree, or use **Projects Engine: Create / edit task list template**.",
		"",
		renderTemplateOutline(args.tasks),
		"",
	].join("\n");
	return buildMarkdownNote(frontmatter, body);
}

/**
 * Human-readable outline of the template tree for the note body.
 */
export function renderTemplateOutline(
	items: readonly TaskListTemplateItem[],
	depth = 0,
): string {
	const lines: string[] = [];
	const indent = "  ".repeat(depth);
	for (const item of items) {
		const meta: string[] = [];
		if (item.status) meta.push(item.status);
		if (item.priority && item.priority !== "none") meta.push(item.priority);
		if (item.estimateHours != null && item.estimateHours > 0) {
			meta.push(`${item.estimateHours}h`);
		}
		const suffix = meta.length > 0 ? ` (${meta.join(", ")})` : "";
		lines.push(`${indent}- ${item.title}${suffix}`);
		if (item.children?.length) {
			lines.push(renderTemplateOutline(item.children, depth + 1));
		}
	}
	return lines.join("\n");
}

/**
 * Depth-first flatten of a template tree for id allocation and parent wiring.
 */
export function flattenTemplateTasks(
	items: readonly TaskListTemplateItem[],
): FlattenedTemplateTask[] {
	const out: FlattenedTemplateTask[] = [];
	const walk = (nodes: readonly TaskListTemplateItem[], parentIndex: number | null): void => {
		for (const item of nodes) {
			const index = out.length;
			out.push({ index, parentIndex, item });
			if (item.children?.length) {
				walk(item.children, index);
			}
		}
	};
	walk(items, null);
	return out;
}

/**
 * Count how many task notes a template would create.
 */
export function countTemplateTasks(items: readonly TaskListTemplateItem[]): number {
	return flattenTemplateTasks(items).length;
}

/**
 * Resolve a template note by wikilink or bare name using the indexer / folder.
 */
export function resolveTaskListTemplateFile(
	app: App,
	settings: ProjectsEngineSettings,
	linkOrName: string,
): TFile | null {
	const target = wikiLinkTarget(linkOrName).trim();
	if (!target) {
		return null;
	}
	const lower = target.toLowerCase();
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		const peType =
			typeof fm?.pe_type === "string"
				? fm.pe_type
				: folderImpliesTemplate(file.path, settings)
					? TASK_LIST_TEMPLATE_PE_TYPE
					: "";
		if (peType !== TASK_LIST_TEMPLATE_PE_TYPE) {
			continue;
		}
		if (file.basename.toLowerCase() === lower) {
			return file;
		}
		const name = typeof fm?.name === "string" ? fm.name.trim() : "";
		if (name && name.toLowerCase() === lower) {
			return file;
		}
	}
	const path = joinVaultPath(
		settings.taskListTemplatesFolder,
		`${sanitiseNoteBasename(target)}.md`,
	);
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

function folderImpliesTemplate(path: string, settings: ProjectsEngineSettings): boolean {
	const prefix = settings.taskListTemplatesFolder.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!prefix) return false;
	return path.replace(/\\/g, "/").startsWith(prefix + "/");
}

/**
 * Load and parse a template from a vault file.
 */
export async function loadTaskListTemplate(
	app: App,
	file: TFile,
): Promise<TaskListTemplate | null> {
	const markdown = await app.vault.cachedRead(file);
	return parseTaskListTemplateNote(file, markdown);
}

/**
 * Persist a new or existing template note atomically.
 */
export async function saveTaskListTemplateNote(
	vault: Vault,
	path: string,
	args: { name: string; description?: string; tasks: readonly TaskListTemplateItem[] },
): Promise<TFile> {
	const markdown = buildTaskListTemplateMarkdown(args);
	return writeNoteAtomic(vault, path, markdown);
}

/**
 * Suggested path for a new template note under the configured folder.
 */
export function taskListTemplateNotePath(
	settings: ProjectsEngineSettings,
	name: string,
): string {
	const basename = sanitiseNoteBasename(name);
	return joinVaultPath(settings.taskListTemplatesFolder, `${basename}.md`);
}

/**
 * Apply a parsed template to a project: create task notes under `Tasks/`.
 *
 * Idempotent for empty projects; on re-apply always appends new task ids
 * (callers should confirm when the folder already has tasks).
 *
 * @remarks Uses {@link saveTaskNote} → `vault.process`. Marks the project with
 * `task_list_template_applied` and ensures `task_list_template` wikilink.
 */
export async function applyTaskListTemplate(args: {
	app: App;
	vault: Vault;
	projectFile: TFile;
	projectId: string;
	projectLink: WikiLink;
	template: TaskListTemplate;
	settings: ProjectsEngineSettings;
}): Promise<ApplyTaskListTemplateResult> {
	const flat = flattenTemplateTasks(args.template.tasks);
	if (flat.length === 0) {
		new Notice(`Template “${args.template.name}” has no tasks`);
		return { created: 0, paths: [] };
	}

	const tasksFolder = resolveProjectTasksFolder(args.projectFile, args.settings);
	await ensureFolder(args.vault, tasksFolder);

	const existing = await loadAllTasks(
		args.app,
		tasksFolder,
		args.settings.hoursPerManday,
	);
	const existingIds = new Set<TaskId>(existing.map((task) => task.id));
	const defaultStatus = defaultTaskStatusId(args.settings.taskStatuses);

	const drafts: TaskDraft[] = [];
	const allocatedIds: TaskId[] = [];

	for (const node of flat) {
		const id = nextTaskId(args.projectId, [...existingIds, ...allocatedIds]);
		allocatedIds.push(id);
		const preferred = taskNotePath(tasksFolder, id, node.item.title);
		const filePath = uniqueTaskPath(args.vault, preferred);
		const parentId =
			node.parentIndex != null ? allocatedIds[node.parentIndex] ?? null : null;
		const draft = blankTaskDraft({
			id,
			projectId: args.projectId,
			projectLink: args.projectLink,
			parentId,
			filePath,
			status: node.item.status ?? defaultStatus,
			priority: node.item.priority ?? "none",
		});
		draft.title = node.item.title;
		if (node.item.estimateHours != null) {
			draft.estimateHours = node.item.estimateHours;
		}
		if (node.item.notes) {
			draft.notes = node.item.notes;
		}
		drafts.push(draft);
	}

	// Wire child_ids on parents before write so notes are self-consistent.
	for (let i = 0; i < drafts.length; i++) {
		const draft = drafts[i];
		if (!draft) continue;
		const children = flat
			.map((node, idx) => (node.parentIndex === i ? drafts[idx]?.id : null))
			.filter((id): id is TaskId => Boolean(id));
		draft.childIds = children;
	}

	const paths: string[] = [];
	for (const draft of drafts) {
		const file = await saveTaskNote(args.vault, draft, args.settings.hoursPerManday);
		paths.push(file.path);
	}

	const templateLink = args.template.wikiLink;
	await patchProjectFrontmatter(args.vault, args.projectFile, (data) => {
		data.task_list_template = templateLink;
		data.task_list_template_applied = new Date().toISOString();
	});

	return { created: paths.length, paths };
}

/**
 * Read the project’s assigned template wikilink (if any) and apply it.
 *
 * Safe no-op when the field is empty or the template note is missing.
 */
export async function applyAssignedTaskListTemplate(args: {
	app: App;
	vault: Vault;
	projectFile: TFile;
	projectId: string;
	settings: ProjectsEngineSettings;
}): Promise<ApplyTaskListTemplateResult | null> {
	const markdown = await args.vault.cachedRead(args.projectFile);
	const { data } = splitFrontmatter(markdown);
	const raw =
		typeof data.task_list_template === "string" ? data.task_list_template.trim() : "";
	if (!raw) {
		return null;
	}
	const file = resolveTaskListTemplateFile(args.app, args.settings, raw);
	if (!file) {
		new Notice(`Task list template “${wikiLinkTarget(raw)}” was not found`);
		return null;
	}
	const template = await loadTaskListTemplate(args.app, file);
	if (!template) {
		new Notice(`Could not parse task list template “${file.basename}”`);
		return null;
	}
	if (template.tasks.length === 0) {
		new Notice(`Template “${template.name}” has no tasks to apply`);
		return { created: 0, paths: [] };
	}
	const projectLink = toWikiLink(args.projectFile.basename);
	return applyTaskListTemplate({
		app: args.app,
		vault: args.vault,
		projectFile: args.projectFile,
		projectId: args.projectId,
		projectLink,
		template,
		settings: args.settings,
	});
}

/**
 * Count Markdown notes currently under the project Tasks folder.
 */
export async function countProjectTaskNotes(
	app: App,
	projectFile: TFile,
	settings: ProjectsEngineSettings,
): Promise<number> {
	const folder = resolveProjectTasksFolder(projectFile, settings);
	const prefix = folder.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
	let count = 0;
	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.replace(/\\/g, "/").startsWith(prefix)) {
			continue;
		}
		const peType = app.metadataCache.getFileCache(file)?.frontmatter?.pe_type;
		if (peType === "task" || peType == null) {
			count += 1;
		}
	}
	return count;
}

/**
 * Flat editor row used by the template modal (indent encodes hierarchy).
 */
export interface TaskListTemplateEditorRow {
	title: string;
	status: string;
	priority: TaskPriority;
	estimateHours: string;
	/** Nesting depth (0 = root). */
	depth: number;
}

/**
 * Convert a nested template tree into flat indented editor rows.
 */
export function treeToRows(
	items: readonly TaskListTemplateItem[],
	depth = 0,
): TaskListTemplateEditorRow[] {
	const rows: TaskListTemplateEditorRow[] = [];
	for (const item of items) {
		rows.push({
			title: item.title,
			status: item.status ?? "",
			priority: item.priority ?? "none",
			estimateHours:
				item.estimateHours != null && item.estimateHours > 0
					? String(item.estimateHours)
					: "",
			depth,
		});
		if (item.children?.length) {
			rows.push(...treeToRows(item.children, depth + 1));
		}
	}
	return rows;
}

/**
 * Rebuild a nested {@link TaskListTemplateItem} tree from indented rows.
 *
 * Parent of a row at depth D is the nearest preceding row with depth D-1.
 */
export function rowsToTree(
	rows: readonly TaskListTemplateEditorRow[],
): TaskListTemplateItem[] {
	const roots: TaskListTemplateItem[] = [];
	const stack: { depth: number; item: TaskListTemplateItem }[] = [];

	for (const row of rows) {
		const title = row.title.trim();
		if (!title) continue;

		const hours = Number.parseFloat(row.estimateHours);
		const item: TaskListTemplateItem = {
			title,
			status: (row.status.trim() || undefined) as TaskStatus | undefined,
			priority: row.priority !== "none" ? row.priority : undefined,
			estimateHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
			children: [],
		};

		const depth = Math.max(0, row.depth);
		while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= depth) {
			stack.pop();
		}
		const parent = stack[stack.length - 1];
		if (!parent) {
			roots.push(item);
		} else {
			parent.item.children = parent.item.children ?? [];
			parent.item.children.push(item);
		}
		stack.push({ depth, item });
	}

	const prune = (nodes: TaskListTemplateItem[]): TaskListTemplateItem[] =>
		nodes.map((node) => {
			const children = node.children?.length ? prune(node.children) : undefined;
			const next: TaskListTemplateItem = { title: node.title };
			if (node.status) next.status = node.status;
			if (node.priority) next.priority = node.priority;
			if (node.estimateHours != null) next.estimateHours = node.estimateHours;
			if (node.notes) next.notes = node.notes;
			if (children?.length) next.children = children;
			return next;
		});

	return prune(roots);
}

/**
 * Lean starter template used when the user creates their first catalogue note
 * from Settings (optional seed content — not dumped into every project).
 */
export function defaultStarterTemplateItems(): TaskListTemplateItem[] {
	return [
		{
			title: "Kick-off",
			priority: "medium",
			estimateHours: 2,
			children: [
				{ title: "Agenda & invites", estimateHours: 1 },
				{ title: "Stakeholder map", estimateHours: 1 },
			],
		},
		{
			title: "Discovery",
			children: [
				{ title: "As-is workshop", estimateHours: 4 },
				{ title: "Gap analysis", estimateHours: 4 },
			],
		},
		{ title: "Delivery planning", priority: "high", estimateHours: 4 },
		{ title: "Close-out & handover", estimateHours: 2 },
	];
}

/**
 * Ensure the templates folder exists (Settings / first create).
 */
export async function ensureTaskListTemplatesFolder(
	vault: Vault,
	settings: ProjectsEngineSettings,
): Promise<string> {
	const folder = settings.taskListTemplatesFolder || "Projects/Entities/Task List Templates";
	await ensureFolder(vault, folder);
	return folder;
}

/**
 * Whether a project Tasks folder already contains notes (for apply confirmation).
 */
export function projectTasksFolderHasNotes(
	app: App,
	projectFile: TFile,
	settings: ProjectsEngineSettings,
): boolean {
	const folder = resolveProjectTasksFolder(projectFile, settings);
	const prefix = folder.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
	return app.vault.getMarkdownFiles().some((file) =>
		file.path.replace(/\\/g, "/").startsWith(prefix),
	);
}

/** Re-export for callers that need Graph Links when documenting templates. */
export { buildGraphLinksSection };
