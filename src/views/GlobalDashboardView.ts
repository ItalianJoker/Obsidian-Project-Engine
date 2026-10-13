/**
 * @file GlobalDashboardView.ts
 * @purpose Global Tasks Dashboard — all tasks across projects with shared filters.
 * @dependencies taskIo, TableSubView.filterTasks, ProjectPickerModal, openTaskEditor
 * @usedBy main.ts, ViewRouter, DashboardView toolbar
 *
 * Reuses {@link filterTasks} / {@link TaskDashboardFilters} from TableSubView
 * so filter behaviour stays in sync with project dashboards (no duplicated logic).
 */

import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	activeTaskStatuses,
	isCompletedTaskStatus,
	toWikiLink,
	type Task,
	type TaskPriority,
	type TaskStatus,
} from "../models/types";
import { isExpiredDateTime } from "../services/dateFormat";
import { loadAllTasks } from "../services/taskIo";
import { EmptyState } from "../ui/EmptyState";
import { ProjectPickerModal } from "../ui/ProjectPickerModal";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";
import { openTaskEditor } from "./TaskEditor";
import { openTaskDetail } from "./TaskDetailModal";
import {
	filterTasks,
	type TaskDashboardFilters,
} from "./subviews/TableSubView";

/** Registered ItemView type id. */
export const GLOBAL_DASHBOARD_VIEW_TYPE = "projects-engine-global-dashboard";

const TASK_PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Leaf aggregating tasks from every project with project-name badges and overdue highlight.
 */
export class GlobalDashboardView extends ItemView {
	private tasks: Task[] = [];
	private projects: ProjectRow[] = [];
	private filters: TaskDashboardFilters = {
		text: "",
		status: "all",
		priority: "all",
	};
	private reloadTimer: number | null = null;
	private toolbarEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private searchTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return GLOBAL_DASHBOARD_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Global Dashboard";
	}

	override getIcon(): string {
		return "layout-list";
	}

	override async onOpen(): Promise<void> {
		this.containerEl.addClass("pe-view");
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		root.addClass("pe-global-dashboard");
		this.toolbarEl = root.createDiv({ cls: "pe-toolbar" });
		this.bodyEl = root.createDiv({ cls: "pe-content" });
		this.registerVaultListeners();
		await this.reload();
	}

	override async onClose(): Promise<void> {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		if (this.searchTimer !== null) {
			window.clearTimeout(this.searchTimer);
			this.searchTimer = null;
		}
		this.contentEl.empty();
	}

	/** Public refresh for {@link ProjectsEnginePlugin.refreshOpenViews}. */
	public refresh(): void {
		void this.reload();
	}

	private registerVaultListeners(): void {
		const schedule = (): void => {
			if (this.reloadTimer !== null) {
				window.clearTimeout(this.reloadTimer);
			}
			this.reloadTimer = window.setTimeout(() => {
				this.reloadTimer = null;
				void this.reload();
			}, this.plugin.settings.indexerDebounceMs);
		};
		this.registerEvent(this.app.vault.on("create", schedule));
		this.registerEvent(this.app.vault.on("modify", schedule));
		this.registerEvent(this.app.vault.on("delete", schedule));
		this.registerEvent(this.app.vault.on("rename", schedule));
		this.registerEvent(this.app.metadataCache.on("resolved", schedule));
	}

	private async reload(): Promise<void> {
		this.plugin.indexer.rebuild();
		this.projects = loadProjectRows(this.app);
		this.tasks = await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);
		this.render();
	}

	private render(): void {
		this.renderToolbar();
		this.bodyEl.empty();

		const visible = filterTasks(this.tasks, this.filters);
		if (visible.length === 0) {
			new EmptyState(this.bodyEl)
				.setIcon("◇")
				.setTitle(this.tasks.length === 0 ? "No tasks yet" : "No matching tasks")
				.setBody(
					this.tasks.length === 0
						? "Create a task from a project or use New Task here with a project selector."
						: "Try a different search or clear status / priority filters.",
				)
				.setAction("New Task", () => this.openNewTask());
			return;
		}

		const table = this.bodyEl.createEl("table", {
			cls: "pe-table pe-task-table pe-task-dashboard pe-global-task-table",
		});
		const head = table.createEl("thead").createEl("tr");
		for (const label of ["PROJECT", "TASK", "STATUS", "PRIORITY", "DUE", "SCHEDULED"]) {
			head.createEl("th", { text: label });
		}

		const tbody = table.createEl("tbody");
		const fragment = document.createDocumentFragment();
		const statuses = this.plugin.settings.taskStatuses;
		for (const task of visible) {
			const completed = isCompletedTaskStatus(task.status, statuses);
			const overdue =
				!completed &&
				(isExpiredDateTime(task.due) || isExpiredDateTime(task.scheduled));
			const tr = document.createElement("tr");
			tr.className = overdue
				? "pe-task-row pe-task-row--expired pe-task-row--overdue"
				: "pe-task-row";

			const projectTd = document.createElement("td");
			projectTd.setAttribute("data-label", "Project");
			const project = findProjectRow(this.projects, task.projectId);
			const badge = document.createElement("button");
			badge.type = "button";
			badge.className = "pe-project-badge pe-touch-target";
			badge.textContent = project?.name || task.projectId;
			badge.title = project ? `${project.id} — ${project.name}` : task.projectId;
			badge.addEventListener("click", (event) => {
				event.stopPropagation();
				if (project) {
					void this.plugin.router.openOverview(project.file.path);
				} else {
					new Notice(`Project “${task.projectId}” not found`);
				}
			});
			projectTd.appendChild(badge);
			tr.appendChild(projectTd);

			const titleTd = document.createElement("td");
			titleTd.setAttribute("data-label", "Task");
			const titleBtn = document.createElement("button");
			titleBtn.type = "button";
			titleBtn.className = "pe-task-title-link pe-touch-target";
			titleBtn.textContent = task.title || task.id;
			titleBtn.addEventListener("click", () => {
				if (!project) {
					new Notice(`Project “${task.projectId}” not found`);
					return;
				}
				openTaskDetail(this.plugin, {
					project,
					task,
					onEdit: () => void this.reload(),
				});
			});
			titleTd.appendChild(titleBtn);
			tr.appendChild(titleTd);

			tr.appendChild(this.textCell("Status", task.status));
			tr.appendChild(this.textCell("Priority", task.priority));
			tr.appendChild(this.textCell("Due", task.due ?? "—"));
			tr.appendChild(this.textCell("Scheduled", task.scheduled ?? "—"));
			fragment.appendChild(tr);
		}
		tbody.appendChild(fragment);

		const addRow = this.bodyEl.createDiv({ cls: "pe-task-add-row" });
		const addBtn = addRow.createEl("button", {
			cls: "pe-task-add pe-touch-target",
			attr: { type: "button", "aria-label": "New Task", title: "New Task" },
		});
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: "New Task", cls: "pe-task-add-label" });
		addBtn.addEventListener("click", () => this.openNewTask());
	}

	private textCell(label: string, text: string): HTMLTableCellElement {
		const td = document.createElement("td");
		td.setAttribute("data-label", label);
		td.textContent = text;
		return td;
	}

	private renderToolbar(): void {
		const bar = this.toolbarEl;
		bar.empty();
		const left = bar.createDiv({ cls: "pe-toolbar-left" });
		left.createEl("h2", { text: "Global Dashboard", cls: "pe-toolbar-title" });

		const center = bar.createDiv({ cls: "pe-toolbar-center pe-toolbar-filters" });
		const search = center.createEl("input", {
			cls: "pe-toolbar-search pe-touch-target",
			attr: {
				type: "search",
				placeholder: "Search tasks…",
				"aria-label": "Search tasks",
			},
		});
		search.value = this.filters.text;
		// Debounced search to avoid thrashing large task lists.
		search.addEventListener("input", () => {
			if (this.searchTimer !== null) {
				window.clearTimeout(this.searchTimer);
			}
			this.searchTimer = window.setTimeout(() => {
				this.searchTimer = null;
				this.filters.text = search.value;
				this.render();
			}, this.plugin.settings.indexerDebounceMs);
		});

		const status = center.createEl("select", {
			cls: "pe-input pe-touch-target pe-toolbar-filter",
			attr: { "aria-label": "Filter by status" },
		});
		status.createEl("option", { text: "All statuses", attr: { value: "all" } });
		for (const option of activeTaskStatuses(this.plugin.settings.taskStatuses)) {
			status.createEl("option", {
				text: option.label,
				attr: { value: option.id },
			});
		}
		status.value = this.filters.status;
		status.addEventListener("change", () => {
			this.filters.status = status.value as "all" | TaskStatus;
			this.render();
		});

		const priority = center.createEl("select", {
			cls: "pe-input pe-touch-target pe-toolbar-filter",
			attr: { "aria-label": "Filter by priority" },
		});
		priority.createEl("option", { text: "All priorities", attr: { value: "all" } });
		for (const value of TASK_PRIORITIES) {
			priority.createEl("option", {
				text: value.charAt(0).toUpperCase() + value.slice(1),
				attr: { value },
			});
		}
		priority.value = this.filters.priority;
		priority.addEventListener("change", () => {
			this.filters.priority = priority.value as "all" | TaskPriority;
			this.render();
		});

		const right = bar.createDiv({ cls: "pe-toolbar-right" });
		const back = right.createEl("button", {
			text: "Projects",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		back.addEventListener("click", () => {
			void this.plugin.router.openDashboard();
		});
		const neu = right.createEl("button", {
			text: "+ New Task",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		neu.addEventListener("click", () => this.openNewTask());
	}

	/**
	 * New Task from Global Dashboard — project selector then existing task modal.
	 */
	private openNewTask(): void {
		if (this.projects.length === 0) {
			new Notice("Create a project first");
			return;
		}
		new ProjectPickerModal(this.app, {
			projects: this.projects,
			title: "New Task",
			message: "Select the project for this task.",
			onPick: (project) => {
				void openTaskEditor(this.plugin, {
					projectId: project.id,
					projectLink: toWikiLink(project.file.basename),
					onSaved: () => void this.reload(),
				});
			},
		}).open();
	}
}

/**
 * Activate or reveal the Global Dashboard leaf.
 */
export async function activateGlobalDashboardView(
	plugin: ProjectsEnginePlugin,
): Promise<void> {
	const { workspace } = plugin.app;
	for (const existing of workspace.getLeavesOfType(GLOBAL_DASHBOARD_VIEW_TYPE)) {
		workspace.revealLeaf(existing);
		return;
	}
	const leaf = workspace.getLeaf("tab");
	await leaf.setViewState({ type: GLOBAL_DASHBOARD_VIEW_TYPE, active: true });
	workspace.revealLeaf(leaf);
}
