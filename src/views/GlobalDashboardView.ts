/**
 * @file GlobalDashboardView.ts
 * @purpose Global Tasks Dashboard — all tasks across projects with shared filters.
 * @dependencies taskIo, TableSubView / KanbanSubView / EisenhowerSubView,
 *   GlobalDashboardChrome, ProjectPickerModal, openTaskEditor
 * @usedBy main.ts, ViewRouter, DashboardView toolbar
 *
 * Reuses project Task section chrome (search, All/Filter, view switchers) and the
 * same SubViews as Workspace — Table / Board / Eisenhower — without duplicating
 * filter or card/table rendering. Project-name badges stay on tasks; overdue rows
 * keep `.pe-task-row--overdue` / due-pill highlighting from the shared subviews.
 */

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	toWikiLink,
	type Task,
	type TaskPriority,
} from "../models/types";
import { loadAllTasks } from "../services/taskIo";
import { EmptyState } from "../ui/EmptyState";
import {
	renderGlobalDashboardChrome,
	type GlobalDashboardMode,
} from "../ui/GlobalDashboardChrome";
import { ProjectPickerModal } from "../ui/ProjectPickerModal";
import { loadProjectRows, type ProjectRow } from "./projectRows";
import { openTaskEditor } from "./TaskEditor";
import type { SubView } from "./SubView";
import { EisenhowerSubView } from "./subviews/EisenhowerSubView";
import { KanbanSubView } from "./subviews/KanbanSubView";
import {
	TableSubView,
	type TaskDashboardFilters,
} from "./subviews/TableSubView";

/** Registered ItemView type id. */
export const GLOBAL_DASHBOARD_VIEW_TYPE = "projects-engine-global-dashboard";

const TASK_PRIORITY_FILTERS: Array<"all" | TaskPriority> = [
	"all",
	"none",
	"low",
	"medium",
	"high",
	"urgent",
];

/**
 * Leaf aggregating tasks from every project with Table / Board / Eisenhower.
 */
export class GlobalDashboardView extends ItemView {
	private tasks: Task[] = [];
	private projects: ProjectRow[] = [];
	private mode: GlobalDashboardMode = "table";
	private filters: TaskDashboardFilters = {
		text: "",
		status: "all",
		priority: "all",
	};
	private showFilterPanel = false;
	private reloadTimer: number | null = null;
	private chromeEl!: HTMLElement;
	private filterEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private subview: SubView | null = null;

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
		this.chromeEl = root.createDiv({ cls: "pe-chrome-mount" });
		this.filterEl = root.createDiv({ cls: "pe-chrome-filter-panel" });
		this.bodyEl = root.createDiv({ cls: "pe-content" });
		this.registerVaultListeners();
		await this.reload();
	}

	override async onClose(): Promise<void> {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.subview?.destroy?.();
		this.subview = null;
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
		this.renderChrome();
		this.renderCurrentView();
	}

	private renderChrome(): void {
		const filterActive =
			this.filters.status !== "all" ||
			this.filters.priority !== "all" ||
			this.showFilterPanel;

		renderGlobalDashboardChrome({
			container: this.chromeEl,
			mode: this.mode,
			searchText: this.filters.text,
			filterAll: !filterActive,
			onModeChange: (mode) => {
				this.mode = mode;
				this.renderChrome();
				this.renderCurrentView();
			},
			onSearchChange: (text) => {
				this.filters.text = text;
				this.renderCurrentView();
			},
			onAddTask: () => this.openNewTask(),
			onBackToProjects: () => {
				void this.plugin.router.openDashboard();
			},
			onAllClick: () => {
				this.filters = { text: this.filters.text, status: "all", priority: "all" };
				this.showFilterPanel = false;
				this.renderChrome();
				this.renderCurrentView();
			},
			onFilterClick: () => {
				this.showFilterPanel = !this.showFilterPanel;
				this.renderChrome();
			},
		});

		this.filterEl.empty();
		if (this.showFilterPanel) {
			this.filterEl.addClass("is-open");
			const status = this.filterEl.createEl("select", {
				cls: "pe-input pe-touch-target pe-header-filter",
				attr: { "aria-label": "Filter by status" },
			});
			status.createEl("option", {
				text: "All statuses",
				attr: { value: "all" },
			});
			const statusOptions = this.plugin.settings.taskStatuses;
			const knownIds = new Set(statusOptions.map((item) => item.id));
			for (const option of statusOptions) {
				status.createEl("option", {
					text: option.label,
					attr: { value: option.id },
				});
			}
			if (this.filters.status !== "all" && !knownIds.has(this.filters.status)) {
				status.createEl("option", {
					text: this.filters.status,
					attr: { value: this.filters.status },
				});
			}
			status.value = this.filters.status;
			status.addEventListener("change", () => {
				this.filters.status = status.value as TaskDashboardFilters["status"];
				this.renderChrome();
				this.renderCurrentView();
			});

			const priority = this.filterEl.createEl("select", {
				cls: "pe-input pe-touch-target pe-header-filter",
				attr: { "aria-label": "Filter by priority" },
			});
			for (const value of TASK_PRIORITY_FILTERS) {
				priority.createEl("option", {
					text: value === "all" ? "All priorities" : value,
					attr: { value },
				});
			}
			priority.value = this.filters.priority;
			priority.addEventListener("change", () => {
				this.filters.priority = priority.value as TaskDashboardFilters["priority"];
				this.renderChrome();
				this.renderCurrentView();
			});
		} else {
			this.filterEl.removeClass("is-open");
		}
	}

	private renderCurrentView(): void {
		this.subview?.destroy?.();
		this.subview = null;
		this.bodyEl.empty();

		if (this.projects.length === 0 && this.tasks.length === 0) {
			new EmptyState(this.bodyEl)
				.setIcon("◇")
				.setTitle("No projects yet")
				.setBody("Create a project first, then add tasks from Global Dashboard.")
				.setAction("Projects", () => {
					void this.plugin.router.openDashboard();
				});
			return;
		}

		const onChanged = (): void => {
			void this.reload();
			this.plugin.refreshOpenViews();
		};
		const onNewTask = (): void => this.openNewTask();

		const scopedTasks = this.tasks.filter((task) => {
			if (this.filters.status !== "all" && task.status !== this.filters.status) {
				return false;
			}
			if (this.filters.priority !== "all" && task.priority !== this.filters.priority) {
				return false;
			}
			return true;
		});

		if (this.mode === "table") {
			this.subview = new TableSubView({
				app: this.app,
				plugin: this.plugin,
				projects: this.projects,
				tasks: this.tasks,
				filters: { ...this.filters },
				container: this.bodyEl,
				showProjectBadge: true,
				onNewTask,
			});
		} else if (this.mode === "eisenhower") {
			this.subview = new EisenhowerSubView({
				app: this.app,
				plugin: this.plugin,
				projects: this.projects,
				tasks: scopedTasks,
				filterText: this.filters.text,
				container: this.bodyEl,
				onChanged,
				showProjectBadge: true,
				onNewTask,
			});
		} else {
			this.subview = new KanbanSubView({
				app: this.app,
				plugin: this.plugin,
				projects: this.projects,
				tasks: scopedTasks,
				filterText: this.filters.text,
				container: this.bodyEl,
				onChanged,
				showProjectBadge: true,
				onNewTask,
			});
		}
		this.subview.render();
	}

	/**
	 * New Task from Global Dashboard — project dropdown then existing task modal.
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
