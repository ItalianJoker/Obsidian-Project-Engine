/**
 * Project delivery workspace — one ItemView hosting Table / Gantt / Kanban /
 * Eisenhower SubViews.
 *
 * Chrome (icon, name, “This project”, view switchers, + add task, Search tasks…)
 * matches Luca’s dotpm screenshots; pattern adapted from
 * [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) ProjectView
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	type Task,
	type TaskPriority,
} from "../models/types";
import { toWikiLink } from "../models/types";
import { loadAllTasks } from "../services/taskIo";
import { copyProjectObsidianUri } from "../services/obsidianUri";
import { EmptyState } from "../ui/EmptyState";
import { renderProjectChrome } from "../ui/ProjectChrome";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";
import type { SubView } from "./SubView";
import { EisenhowerSubView } from "./subviews/EisenhowerSubView";
import { GanttSubView, type GanttZoomId } from "./subviews/GanttSubView";
import { KanbanSubView } from "./subviews/KanbanSubView";
import { TableSubView, type TaskDashboardFilters } from "./subviews/TableSubView";
import { openProjectEditor } from "./ProjectEditView";
import { TaskEditorModal } from "./TaskEditorModal";

/** Registered ItemView type id. */
export const WORKSPACE_VIEW_TYPE = "projects-engine-workspace";

/**
 * Delivery modes hosted as SubViews (obsidian-pm ViewMode analogue).
 * Task-only surfaces — Table / Gantt / Board / Eisenhower. Project home is
 * {@link ProjectChromeMode} `"dashboard"` (Overview leaf), not a Workspace SubView.
 */
export type WorkspaceViewMode = "table" | "gantt" | "kanban" | "eisenhower";

/**
 * Full project chrome switcher: Dashboard (home) plus the task views.
 * Order in the UI: Dashboard | Table | Gantt | Board | Eisenhower.
 */
export type ProjectChromeMode = "dashboard" | WorkspaceViewMode;

/**
 * True when `mode` is a Workspace SubView (not the project Dashboard / Overview).
 */
export function isWorkspaceViewMode(mode: ProjectChromeMode): mode is WorkspaceViewMode {
	return (
		mode === "table" || mode === "gantt" || mode === "kanban" || mode === "eisenhower"
	);
}

interface WorkspaceState {
	filePath?: string;
	mode?: WorkspaceViewMode;
	[key: string]: unknown;
}

const TASK_PRIORITY_FILTERS: Array<"all" | TaskPriority> = [
	"all",
	"none",
	"low",
	"medium",
	"high",
	"urgent",
];

/**
 * Host leaf: screenshot chrome + SubView body for one project.
 */
export class ProjectWorkspaceView extends ItemView {
	private filePath: string | null = null;
	private project: ProjectRow | null = null;
	private tasks: Task[] = [];
	private mode: WorkspaceViewMode;
	private filters: TaskDashboardFilters = {
		text: "",
		status: "all",
		priority: "all",
	};
	private showFilterPanel = false;
	private zoomId: GanttZoomId = "week";
	private subview: SubView | null = null;
	private chromeEl!: HTMLElement;
	private filterEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private initialized = false;
	private reloadTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.mode = plugin.settings.defaultView;
		this.zoomId = plugin.settings.ganttGranularity;
		this.navigation = false;
	}

	override getViewType(): string {
		return WORKSPACE_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.project?.name ?? "Workspace";
	}

	override getIcon(): string {
		return "kanban";
	}

	override getState(): WorkspaceState {
		return {
			filePath: this.filePath ?? undefined,
			mode: this.mode,
		};
	}

	override async setState(state: WorkspaceState, result: unknown): Promise<void> {
		this.ensureInitialized();
		let needsLoad = false;
		if (typeof state.filePath === "string" && state.filePath !== this.filePath) {
			this.filePath = state.filePath;
			needsLoad = true;
		}
		if (
			state.mode === "table" ||
			state.mode === "gantt" ||
			state.mode === "kanban" ||
			state.mode === "eisenhower"
		) {
			this.mode = state.mode;
		}
		if (needsLoad) {
			await this.loadProject();
		} else if (this.project) {
			this.renderChrome();
			this.renderCurrentView();
		}
		await super.setState(state, result as import("obsidian").ViewStateResult);
	}

	override async onOpen(): Promise<void> {
		this.ensureInitialized();
		this.registerAutoRefresh();
		if (this.filePath && !this.project) {
			await this.loadProject();
		}
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

	private ensureInitialized(): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		this.containerEl.addClass("pe-view");
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		root.addClass("pe-workspace");
		this.chromeEl = root.createDiv({ cls: "pe-chrome-mount" });
		this.filterEl = root.createDiv({ cls: "pe-chrome-filter-panel" });
		this.bodyEl = root.createDiv({ cls: "pe-content" });
	}

	private registerAutoRefresh(): void {
		const schedule = (): void => {
			if (this.reloadTimer !== null) {
				window.clearTimeout(this.reloadTimer);
			}
			this.reloadTimer = window.setTimeout(() => {
				this.reloadTimer = null;
				void this.refresh();
			}, this.plugin.settings.indexerDebounceMs);
		};
		this.registerEvent(this.app.vault.on("modify", schedule));
		this.registerEvent(this.app.vault.on("create", schedule));
		this.registerEvent(this.app.vault.on("delete", schedule));
		this.registerEvent(this.app.vault.on("rename", schedule));
		this.registerEvent(this.app.metadataCache.on("resolved", schedule));
	}

	private async loadProject(): Promise<void> {
		this.ensureInitialized();
		const rows = loadProjectRows(this.app);
		this.project = this.filePath ? findProjectRow(rows, this.filePath) ?? null : null;
		if (!this.project) {
			this.renderMissing();
			return;
		}
		this.tasks = (
			await loadAllTasks(
				this.app,
				this.plugin.settings.tasksFolder,
				this.plugin.settings.hoursPerManday,
			)
		).filter((task) => task.projectId === this.project!.id);
		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
		this.renderChrome();
		this.renderCurrentView();
	}

	/** Public refresh after task mutations (Kanban drop, modal save, status). */
	public async refresh(): Promise<void> {
		await this.loadProject();
	}

	private renderMissing(): void {
		this.chromeEl.empty();
		this.filterEl.empty();
		this.bodyEl.empty();
		new EmptyState(this.bodyEl)
			.setTitle("Project not found")
			.setBody("Return to the project list and open another project.")
			.setAction("Back to projects", () => {
				void this.plugin.router.openDashboard();
			});
	}

	private openAddTask(): void {
		const project = this.project;
		if (!project) return;
		new TaskEditorModal(
			this.app,
			this.plugin,
			project.id,
			toWikiLink(project.file.basename),
		).open();
	}

	private renderChrome(): void {
		const project = this.project;
		if (!project) return;

		const filterActive =
			this.filters.status !== "all" ||
			this.filters.priority !== "all" ||
			this.showFilterPanel;

		renderProjectChrome({
			container: this.chromeEl,
			project,
			mode: this.mode,
			searchText: this.filters.text,
			filterAll: !filterActive,
			onModeChange: (mode) => {
				// Dashboard is the Overview leaf — leave Workspace when selected.
				if (mode === "dashboard") {
					void this.plugin.router.openOverview(project.file.path, this.leaf);
					return;
				}
				if (!isWorkspaceViewMode(mode)) {
					return;
				}
				this.mode = mode;
				void this.leaf.setViewState({
					type: WORKSPACE_VIEW_TYPE,
					state: this.getState(),
				});
				this.renderChrome();
				this.renderCurrentView();
			},
			onSearchChange: (text) => {
				this.filters.text = text;
				this.renderCurrentView();
			},
			onAddTask: () => this.openAddTask(),
			onOpenSettings: () => {
				void openProjectEditor(this.plugin, project, {
					onSaved: () => void this.refresh(),
				});
			},
			onCopyObsidianUrl: () => {
				void copyProjectObsidianUri(this.app, project, {
					view: "workspace",
					mode: this.mode,
				});
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
			extraToolbar:
				this.mode === "gantt"
					? (parent) => {
							/* GanttSubView owns Day/Week/… and Today/Expand — leave mount empty */
							parent.addClass("pe-chrome-extra--gantt-host");
						}
					: undefined,
			showSearchRow: true,
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
			// Offer every configured status (including archived) so filters still match old notes.
			const statusOptions = this.plugin.settings.taskStatuses;
			const knownIds = new Set(statusOptions.map((item) => item.id));
			for (const option of statusOptions) {
				status.createEl("option", {
					text: option.label,
					attr: { value: option.id },
				});
			}
			// If the active filter points at an unknown id, keep it selectable.
			if (
				this.filters.status !== "all" &&
				!knownIds.has(this.filters.status)
			) {
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
		const project = this.project;
		if (!project) {
			this.renderMissing();
			return;
		}
		this.subview?.destroy?.();
		this.subview = null;
		this.bodyEl.empty();

		const onChanged = (): void => {
			void this.refresh();
			this.plugin.refreshOpenViews();
		};

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
				project,
				tasks: this.tasks,
				filters: { ...this.filters },
				container: this.bodyEl,
			});
		} else if (this.mode === "gantt") {
			this.subview = new GanttSubView({
				app: this.app,
				plugin: this.plugin,
				project,
				tasks: scopedTasks,
				filterText: this.filters.text,
				container: this.bodyEl,
				zoomId: this.zoomId,
				onZoomChange: (zoom) => {
					this.zoomId = zoom;
					this.renderCurrentView();
				},
			});
		} else if (this.mode === "eisenhower") {
			this.subview = new EisenhowerSubView({
				app: this.app,
				plugin: this.plugin,
				project,
				tasks: scopedTasks,
				filterText: this.filters.text,
				container: this.bodyEl,
				onChanged,
			});
		} else {
			this.subview = new KanbanSubView({
				app: this.app,
				plugin: this.plugin,
				project,
				tasks: scopedTasks,
				filterText: this.filters.text,
				container: this.bodyEl,
				onChanged,
			});
		}
		this.subview.render();
	}
}
