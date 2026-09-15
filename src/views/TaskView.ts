/**
 * Dedicated task ItemView (tab surface) — parity with
 * [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) `TaskView`
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 *
 * Mounts {@link TaskEditor} with PE domain (hours, DAG, vault.process).
 */

import { ItemView, TFile, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { Task, TaskId, WikiLink } from "../models/types";
import { toWikiLink } from "../models/types";
import { loadAllTasks, parseTaskNote } from "../services/taskIo";
import { EmptyState } from "../ui/EmptyState";
import { loadProjectRows } from "./projectRows";
import { TaskEditor } from "./TaskEditor";

/** Registered ItemView type id. */
export const TASK_VIEW_TYPE = "projects-engine-task";

/**
 * Leaf state for create/edit task in a tab.
 * `filePath` addresses an existing task note; a new task needs projectId (+ optional parent).
 */
export interface TaskViewState {
	filePath?: string;
	projectId?: string;
	projectLink?: WikiLink;
	parentId?: TaskId | null;
	[key: string]: unknown;
}

/**
 * ItemView hosting the mountable task editor (settings: task editor surface = Tab).
 */
export class TaskView extends ItemView {
	private editor: TaskEditor | null = null;
	private state: TaskViewState = {};
	private taskTitle = "Task";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return TASK_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return truncateTitle(this.taskTitle, 10);
	}

	override getIcon(): string {
		return "square-check-big";
	}

	override getState(): TaskViewState {
		return { ...this.state };
	}

	override async setState(state: TaskViewState, result: ViewStateResult): Promise<void> {
		const same =
			Boolean(state.filePath) &&
			state.filePath === this.state.filePath &&
			this.editor !== null;
		this.state = state;
		if (!same) {
			await this.loadTask();
		}
		await super.setState(state, result);
	}

	override async onOpen(): Promise<void> {
		this.containerEl.addClass("pe-view");
		this.contentEl.addClass("pe-te-view", "pe-te-surface");
	}

	override async onClose(): Promise<void> {
		this.editor?.destroy();
		this.editor = null;
		this.contentEl.empty();
	}

	private async loadTask(): Promise<void> {
		this.editor?.destroy();
		this.editor = null;
		this.contentEl.empty();

		const { filePath, projectId: stateProjectId, projectLink: stateLink, parentId } =
			this.state;

		let projectId = stateProjectId ?? "";
		let projectLink = stateLink ?? ("" as WikiLink);
		let existing: Task | null = null;

		if (filePath) {
			const abstract = this.app.vault.getAbstractFileByPath(filePath);
			if (!(abstract instanceof TFile)) {
				this.showMissing("Task note not found.");
				return;
			}
			const markdown = await this.app.vault.cachedRead(abstract);
			const parsed = parseTaskNote(
				abstract,
				markdown,
				this.plugin.settings.hoursPerManday,
			);
			if (!parsed) {
				this.showMissing("This note is not a Projects Engine task.");
				return;
			}
			existing = parsed;
			projectId = parsed.projectId;
			projectLink = parsed.project;
		} else if (!projectId) {
			this.showMissing("No task or project was specified.");
			return;
		}

		const rows = loadProjectRows(this.app);
		const project = rows.find((item) => item.id === projectId);
		if (!project) {
			this.showMissing("This note does not belong to a project.");
			return;
		}

		if (!projectLink) {
			projectLink = stateLink ?? toWikiLink(project.file.basename);
		}

		await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);

		this.taskTitle = existing?.title ?? "New task";
		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();

		this.editor = new TaskEditor(
			this.app,
			this.plugin,
			projectId,
			projectLink,
			existing,
			parentId ?? existing?.parentId ?? null,
			{
				surface: "tab",
				close: () => {
					this.leaf.detach();
				},
			},
		);
		this.editor.mount(this.contentEl);
	}

	private showMissing(message: string): void {
		this.taskTitle = "Task";
		new EmptyState(this.contentEl)
			.setTitle("No task here")
			.setBody(message)
			.setAction("Back to projects", () => {
				void this.plugin.router.openDashboard();
			});
	}
}

function truncateTitle(title: string, max: number): string {
	const trimmed = title.trim() || "Task";
	return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
