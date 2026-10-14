/**
 * @file quickSubtask.ts
 * @purpose Create a child task under a parent with title-only prompt defaults.
 * @dependencies taskIo, projectScaffold, vault.process
 * @usedBy TableSubView “Add subtask”
 *
 * Reuses the standard task model (`parent_id` / `child_ids`) — no new schema.
 */

import { TFile, type App } from "obsidian";
import {
	defaultTaskStatusId,
	toWikiLink,
	type ProjectsEngineSettings,
	type Task,
	type TaskId,
} from "../models/types";
import { resolveProjectTasksFolder } from "./projectScaffold";
import {
	blankTaskDraft,
	loadAllTasks,
	nextTaskId,
	patchTaskFrontmatter,
	saveTaskNote,
	taskNotePath,
	uniqueTaskPath,
} from "./taskIo";

/**
 * Inputs for {@link createQuickSubtask}.
 */
export interface CreateQuickSubtaskArgs {
	app: App;
	settings: ProjectsEngineSettings;
	/** Parent task (must already exist on disk). */
	parent: Task;
	/** Project note file (for Tasks/ folder resolution + wikilink). */
	projectFile: TFile;
	/** Required non-empty title. */
	title: string;
}

/**
 * Result of a successful quick subtask create.
 */
export interface CreateQuickSubtaskResult {
	childId: TaskId;
	filePath: string;
	title: string;
}

/**
 * Create a subtask under {@link CreateQuickSubtaskArgs.parent} with New Task defaults.
 *
 * Writes the child note, then appends the child id to the parent’s `child_ids`
 * via `vault.process`. Project is always the parent’s project.
 */
export async function createQuickSubtask(
	args: CreateQuickSubtaskArgs,
): Promise<CreateQuickSubtaskResult> {
	const title = args.title.trim();
	if (!title) {
		throw new Error("Title is required");
	}

	const projectId = args.parent.projectId;
	if (!projectId) {
		throw new Error("Parent task has no project id");
	}

	const allTasks = await loadAllTasks(
		args.app,
		args.settings.tasksFolder,
		args.settings.hoursPerManday,
	);
	const id = nextTaskId(
		projectId,
		allTasks.map((task) => task.id),
	);
	const projectLink =
		typeof args.parent.project === "string" && args.parent.project.trim()
			? args.parent.project
			: toWikiLink(args.projectFile.basename);

	const tasksFolder = resolveProjectTasksFolder(args.projectFile, args.settings);
	const preferred = taskNotePath(tasksFolder, id, title);
	const filePath = uniqueTaskPath(args.app.vault, preferred);

	const draft = blankTaskDraft({
		id,
		projectId,
		projectLink,
		parentId: args.parent.id,
		filePath,
		status: defaultTaskStatusId(args.settings.taskStatuses),
	});
	draft.title = title;

	await saveTaskNote(args.app.vault, draft, args.settings.hoursPerManday);

	const parentFile = args.app.vault.getAbstractFileByPath(args.parent.filePath);
	if (parentFile instanceof TFile) {
		await patchTaskFrontmatter(args.app.vault, parentFile, (data) => {
			const existing = Array.isArray(data.child_ids)
				? data.child_ids.filter((item): item is string => typeof item === "string")
				: [];
			if (!existing.includes(id)) {
				data.child_ids = [...existing, id];
			}
		});
	}

	return { childId: id, filePath, title };
}
