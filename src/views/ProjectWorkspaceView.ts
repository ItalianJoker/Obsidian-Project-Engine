/**
 * Project delivery workspace — one ItemView hosting Table / Gantt / Kanban SubViews.
 *
 * Chrome (toolbar left/center/right, ViewSwitcher, search header, in-leaf title
 * back to overview) adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * ProjectView (MIT © 2026 Stepan Kropachev and dotpm contributors).
 *
 * Domain: PE project frontmatter, governance-aware board, Teams URL, task I/O.
 */

import { ExtraButtonComponent, ItemView, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { Task } from "../models/types";
import { toWikiLink } from "../models/types";
import { loadAllTasks } from "../services/taskIo";
import { EmptyState } from "../ui/EmptyState";
import { ViewSwitcher } from "../ui/ViewSwitcher";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";
import type { SubView } from "./SubView";
import { GanttSubView } from "./subviews/GanttSubView";
import { KanbanSubView } from "./subviews/KanbanSubView";
import { TableSubView } from "./subviews/TableSubView";
import { TaskEditorModal } from "./TaskEditorModal";

/** Registered ItemView type id. */
export const WORKSPACE_VIEW_TYPE = "projects-engine-workspace";

/**
 * Delivery modes hosted as SubViews (obsidian-pm ViewMode analogue).
 */
export type WorkspaceViewMode = "table" | "gantt" | "kanban";

interface WorkspaceState {
	filePath?: string;
	mode?: WorkspaceViewMode;
	[key: string]: unknown;
}

/**
 * Host leaf: toolbar + search + SubView body for one project.
 */
export class ProjectWorkspaceView extends ItemView {
	private filePath: string | null = null;
	private project: ProjectRow | null = null;
	private tasks: Task[] = [];
	private mode: WorkspaceViewMode;
	private filterText = "";
	private zoomId: "day" | "week" | "month" = "week";
	private subview: SubView | null = null;
	private toolbarEl!: HTMLElement;
	private headerEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private initialized = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.mode = plugin.settings.defaultView;
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
			state.mode === "kanban"
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
		if (this.filePath && !this.project) {
			await this.loadProject();
		}
	}

	override async onClose(): Promise<void> {
		this.subview?.destroy?.();
		this.subview = null;
		this.contentEl.empty();
	}

	/**
	 * One-time DOM scaffold (safe if setState runs before onOpen).
	 */
	private ensureInitialized(): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		this.containerEl.addClass("pe-view");
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		this.toolbarEl = root.createDiv({ cls: "pe-toolbar" });
		this.headerEl = root.createDiv({ cls: "pe-project-header-mount" });
		this.bodyEl = root.createDiv({ cls: "pe-content" });
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

	/**
	 * Public refresh after task mutations (Kanban drop, modal save).
	 */
	public async refresh(): Promise<void> {
		await this.loadProject();
	}

	private renderMissing(): void {
		this.toolbarEl.empty();
		this.headerEl.empty();
		this.bodyEl.empty();
		new EmptyState(this.bodyEl)
			.setTitle("Project not found")
			.setBody("Return to the project list and open another project.")
			.setAction("Back to projects", () => {
				void this.plugin.router.openDashboard();
			});
	}

	private renderChrome(): void {
		const project = this.project;
		if (!project) {
			return;
		}

		const bar = this.toolbarEl;
		bar.empty();

		const left = bar.createDiv({ cls: "pe-toolbar-left" });
		const iconBtn = left.createEl("button", {
			cls: "pe-toolbar-icon pe-touch-target",
			attr: { type: "button", title: "Open overview", "aria-label": "Open overview" },
		});
		iconBtn.setText("◇");
		iconBtn.addEventListener("click", () => {
			void this.plugin.router.openOverview(project.file.path, this.leaf);
		});
		const title = left.createEl("button", {
			text: project.name,
			cls: "pe-toolbar-title pe-toolbar-title--link pe-touch-target",
			attr: { type: "button", title: "Open overview" },
		});
		title.addEventListener("click", () => {
			void this.plugin.router.openOverview(project.file.path, this.leaf);
		});
		left.createSpan({
			text: project.governance,
			cls: "pe-toolbar-chip",
		});

		const center = bar.createDiv({ cls: "pe-toolbar-center" });
		new ViewSwitcher<WorkspaceViewMode>(center, {
			options: [
				{ id: "table", icon: "table", label: "Table" },
				{ id: "gantt", icon: "git-fork", label: "Gantt" },
				{ id: "kanban", icon: "layout-dashboard", label: "Board" },
			],
			active: this.mode,
			onChange: (mode) => {
				this.mode = mode;
				void this.leaf.setViewState({
					type: WORKSPACE_VIEW_TYPE,
					state: this.getState(),
				});
				this.renderCurrentView();
			},
		});

		const right = bar.createDiv({ cls: "pe-toolbar-right" });
		const add = right.createEl("button", {
			text: "+ add task",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		add.addEventListener("click", () => {
			new TaskEditorModal(
				this.app,
				this.plugin,
				project.id,
				toWikiLink(project.file.basename),
			).open();
		});
		new ExtraButtonComponent(right)
			.setIcon("refresh-cw")
			.setTooltip("Refresh")
			.onClick(() => {
				void this.refresh();
			});
		const refreshEl = right.querySelector(".clickable-icon:last-child");
		refreshEl?.addClass("pe-touch-target");

		this.headerEl.empty();
		const header = this.headerEl.createDiv({ cls: "pe-project-header" });
		const primary = header.createDiv({ cls: "pe-project-header-primary" });
		const search = primary.createEl("input", {
			cls: "pe-project-header-search pe-touch-target",
			attr: {
				type: "search",
				placeholder: "Filter tasks…",
				"aria-label": "Filter tasks",
			},
		});
		search.value = this.filterText;
		search.addEventListener("input", () => {
			this.filterText = search.value;
			this.renderCurrentView();
		});
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
		};

		if (this.mode === "table") {
			this.subview = new TableSubView({
				app: this.app,
				plugin: this.plugin,
				project,
				tasks: this.tasks,
				filterText: this.filterText,
				container: this.bodyEl,
			});
		} else if (this.mode === "gantt") {
			this.subview = new GanttSubView({
				app: this.app,
				plugin: this.plugin,
				project,
				tasks: this.tasks,
				filterText: this.filterText,
				container: this.bodyEl,
				zoomId: this.zoomId,
				onZoomChange: (zoom) => {
					this.zoomId = zoom;
					this.renderCurrentView();
				},
			});
		} else {
			this.subview = new KanbanSubView({
				app: this.app,
				plugin: this.plugin,
				project,
				tasks: this.tasks,
				filterText: this.filterText,
				container: this.bodyEl,
				onChanged,
			});
		}
		this.subview.render();
	}
}
