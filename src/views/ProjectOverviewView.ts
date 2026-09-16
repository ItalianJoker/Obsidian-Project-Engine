/**
 * Project overview — project home with screenshot-aligned chrome and task table.
 *
 * Primary surface shows the hierarchical task dashboard (task-table.png).
 * Compact meta, governance, then Edit / Delete actions at the bottom.
 *
 * Layout inspiration from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { projectStatusLabel, toWikiLink } from "../models/types";
import {
	SEMPLIFICATO_LABELS,
	createPrince2Stage,
	ensurePrince2Registers,
	readProjectStages,
} from "../services/governance";
import { setProjectStatus } from "../services/projectIo";
import {
	deleteProjectFolder,
	notifyProjectDeleted,
} from "../services/projectDelete";
import { containingProjectFolder } from "../services/projectPaths";
import {
	formatGiornate,
	formatHours,
	formatHoursAndGiornate,
	giornateToHours,
} from "../services/timeLogs";
import { isValidTeamsChannelUrl, openExternalUrl } from "../services/urls";
import { ConfirmModal } from "../ui/ConfirmModal";
import { EmptyState } from "../ui/EmptyState";
import { renderProjectChrome } from "../ui/ProjectChrome";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";
import { loadAllTasks } from "../services/taskIo";
import { openProjectEditor } from "./ProjectEditView";
import { TaskEditorModal } from "./TaskEditorModal";
import {
	TableSubView,
	type TaskDashboardFilters,
} from "./subviews/TableSubView";
import type { WorkspaceViewMode } from "./ProjectWorkspaceView";
import { WORKSPACE_VIEW_TYPE } from "./ProjectWorkspaceView";

/** Registered ItemView type id. */
export const OVERVIEW_VIEW_TYPE = "projects-engine-overview";

interface OverviewState {
	filePath?: string;
	[key: string]: unknown;
}

/**
 * Project home leaf: chrome + task table + secondary meta / governance.
 */
export class ProjectOverviewView extends ItemView {
	private filePath: string | null = null;
	private project: ProjectRow | null = null;
	private tasks: Awaited<ReturnType<typeof loadAllTasks>> = [];
	private filters: TaskDashboardFilters = {
		text: "",
		status: "all",
		priority: "all",
	};
	private showFilterPanel = false;
	private table: TableSubView | null = null;
	private chromeEl!: HTMLElement;
	private filterEl!: HTMLElement;
	private tableEl!: HTMLElement;
	private metaEl!: HTMLElement;
	private initialized = false;
	private reloadTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return OVERVIEW_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.project?.name ?? "Project";
	}

	override getIcon(): string {
		return "layout-dashboard";
	}

	override getState(): OverviewState {
		return { filePath: this.filePath ?? undefined };
	}

	override async setState(state: OverviewState, result: unknown): Promise<void> {
		this.ensureInitialized();
		if (typeof state.filePath === "string" && state.filePath !== this.filePath) {
			this.filePath = state.filePath;
			await this.loadProject();
		}
		await super.setState(state, result as import("obsidian").ViewStateResult);
	}

	override async onOpen(): Promise<void> {
		this.ensureInitialized();
		this.registerAutoRefresh();
		if (this.filePath) {
			await this.loadProject();
		} else {
			this.renderMissing();
		}
	}

	override async onClose(): Promise<void> {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.table?.destroy?.();
		this.table = null;
		this.contentEl.empty();
	}

	/** Public refresh for status / vault mutations. */
	public async refresh(): Promise<void> {
		await this.loadProject();
	}

	private ensureInitialized(): void {
		if (this.initialized) return;
		this.initialized = true;
		this.containerEl.addClass("pe-view");
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		root.addClass("pe-overview");
		this.chromeEl = root.createDiv({ cls: "pe-chrome-mount" });
		this.filterEl = root.createDiv({ cls: "pe-chrome-filter-panel" });
		this.tableEl = root.createDiv({ cls: "pe-overview-table" });
		this.metaEl = root.createDiv({ cls: "pe-overview-meta-panel" });
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
		this.render();
		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
	}

	private renderMissing(): void {
		this.chromeEl?.empty();
		this.filterEl?.empty();
		this.tableEl?.empty();
		this.metaEl?.empty();
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		this.initialized = false;
		new EmptyState(root)
			.setTitle("Project not found")
			.setBody("The project note may have been moved or deleted.")
			.setAction("Back to projects", () => {
				void this.plugin.router.openDashboard();
			});
	}

	private render(): void {
		const project = this.project;
		if (!project) {
			this.renderMissing();
			return;
		}

		const filterActive =
			this.filters.status !== "all" ||
			this.filters.priority !== "all" ||
			this.showFilterPanel;

		renderProjectChrome({
			container: this.chromeEl,
			project,
			mode: "table",
			searchText: this.filters.text,
			filterAll: !filterActive,
			onModeChange: (mode) => {
				void this.openWorkspace(mode);
			},
			onSearchChange: (text) => {
				this.filters.text = text;
				this.renderTable();
			},
			onAddTask: () => {
				new TaskEditorModal(
					this.app,
					this.plugin,
					project.id,
					toWikiLink(project.file.basename),
				).open();
			},
			onOpenSettings: () => {
				void openProjectEditor(this.plugin, project, {
					onSaved: () => void this.refresh(),
				});
			},
			onAllClick: () => {
				this.filters = { text: this.filters.text, status: "all", priority: "all" };
				this.showFilterPanel = false;
				this.render();
			},
			onFilterClick: () => {
				this.showFilterPanel = !this.showFilterPanel;
				this.render();
			},
		});

		this.filterEl.empty();
		if (this.showFilterPanel) {
			this.filterEl.addClass("is-open");
			this.filterEl.createEl("p", {
				cls: "pe-help",
				text: "Use Workspace filters for status and priority, or clear with All.",
			});
		} else {
			this.filterEl.removeClass("is-open");
		}

		this.renderTable();
		this.renderMeta(project);
	}

	private renderTable(): void {
		const project = this.project;
		if (!project) return;
		this.table?.destroy?.();
		this.tableEl.empty();
		this.table = new TableSubView({
			app: this.app,
			plugin: this.plugin,
			project,
			tasks: this.tasks,
			filters: { ...this.filters },
			container: this.tableEl,
		});
		this.table.render();
	}

	private renderMeta(project: ProjectRow): void {
		const root = this.metaEl;
		root.empty();

		const hoursPer = this.plugin.settings.hoursPerManday;
		const remainingHours = this.tasks.reduce((s, t) => s + t.remainingHours, 0);
		const loggedHours = this.tasks.reduce((s, t) => s + t.actualHours, 0);
		const estimateHours = this.tasks.reduce((s, t) => s + t.estimateHours, 0);
		const budgetHours = giornateToHours(project.assignedDays, hoursPer);

		const metrics = root.createDiv({ cls: "pe-metric-strip" });
		this.metric(metrics, "Tasks", String(this.tasks.length));
		this.metric(
			metrics,
			"Budget",
			`${formatGiornate(project.assignedDays)} · ${formatHours(budgetHours)}`,
		);
		this.metric(metrics, "Logged", formatHoursAndGiornate(loggedHours, hoursPer));
		this.metric(metrics, "Remaining", formatHoursAndGiornate(remainingHours, hoursPer));
		this.metric(metrics, "Est. tasks", formatHours(estimateHours));

		const statusRow = root.createDiv({ cls: "pe-overview-status-row pe-inline-row" });
		statusRow.createEl("label", { text: "Status", cls: "pe-label" });
		const statusSelect = statusRow.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { "aria-label": "Project status" },
		});
		const options = this.plugin.settings.projectStatuses.filter(
			(item) => !item.archived || item.id === project.status,
		);
		for (const option of options) {
			statusSelect.createEl("option", {
				text: option.label,
				attr: { value: option.id },
			});
		}
		if (!options.some((item) => item.id === project.status)) {
			statusSelect.createEl("option", {
				text: project.status,
				attr: { value: project.status },
			});
		}
		statusSelect.value = project.status;
		statusSelect.addEventListener("change", () => {
			void (async () => {
				try {
					await setProjectStatus(this.app.vault, project.file, statusSelect.value);
					new Notice(
						`Status → ${projectStatusLabel(this.plugin.settings.projectStatuses, statusSelect.value)}`,
					);
					this.plugin.refreshOpenViews();
					await this.loadProject();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not update status: ${message}`);
				}
			})();
		});

		this.renderEntities(root, project);
		this.renderGovernance(root, project);
		this.renderActions(root, project);
	}

	/**
	 * Project edit / launch actions sit at the bottom of the meta panel so
	 * primary content (metrics, status, entities) stays above the fold.
	 */
	private renderActions(root: HTMLElement, project: ProjectRow): void {
		const actions = root.createDiv({ cls: "pe-overview-actions" });
		actions.createEl("h3", { text: "Actions", cls: "pe-section-title" });
		const row = actions.createDiv({ cls: "pe-inline-row" });
		this.cta(row, "Edit project", false, () => {
			void openProjectEditor(this.plugin, project, {
				onSaved: () => void this.refresh(),
			});
		});
		this.cta(row, "Open note", false, () => {
			void this.app.workspace.getLeaf(false).openFile(project.file);
		});
		if (project.teamsChannelUrl) {
			this.cta(row, "Teams channel", false, () => {
				if (!isValidTeamsChannelUrl(project.teamsChannelUrl)) {
					new Notice("teams_channel_url is not a valid Teams link");
					return;
				}
				openExternalUrl(project.teamsChannelUrl);
			});
		}
		if (project.projectUrl) {
			this.cta(row, "Project URL", false, () => {
				openExternalUrl(project.projectUrl);
			});
		}
		this.cta(row, "Delete project…", false, () => {
			this.confirmDelete(project);
		});
	}

	private confirmDelete(project: ProjectRow): void {
		const folder = containingProjectFolder(project.file.path) || project.file.path;
		new ConfirmModal(this.app, {
			title: "Delete project?",
			message: `This will permanently remove the project folder and all plugin-managed contents:\n\n${folder}\n\nThis cannot be undone (unless your vault trash can recover it).`,
			confirmLabel: "Delete project",
			dangerous: true,
			onConfirm: async () => {
				try {
					const result = await deleteProjectFolder({
						app: this.app,
						vault: this.app.vault,
						projectFile: project.file,
						projectsRoot: this.plugin.settings.projectsFolder,
					});
					notifyProjectDeleted(result.deletedPath, result.trashed);
					this.plugin.refreshOpenViews();
					await this.plugin.router.openDashboard();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not delete project: ${message}`);
				}
			},
		}).open();
	}

	private async openWorkspace(mode: WorkspaceViewMode): Promise<void> {
		const project = this.project;
		if (!project) return;
		await this.plugin.router.openWorkspace(project.file.path, this.leaf);
		await this.leaf.setViewState({
			type: WORKSPACE_VIEW_TYPE,
			state: { filePath: project.file.path, mode },
		});
	}

	private metric(parent: HTMLElement, label: string, value: string): void {
		const cell = parent.createDiv({ cls: "pe-metric" });
		cell.createDiv({ text: label, cls: "pe-metric-label" });
		const valueEl = cell.createDiv({ cls: "pe-metric-value" });
		for (const line of value.split("\n")) {
			valueEl.createDiv({ text: line });
		}
	}

	private cta(
		parent: HTMLElement,
		label: string,
		primary: boolean,
		onClick: () => void,
	): void {
		const button = parent.createEl("button", {
			text: label,
			cls: `${primary ? "pe-primary" : "pe-secondary"} pe-touch-target`,
			attr: { type: "button" },
		});
		button.addEventListener("click", onClick);
	}

	private renderEntities(root: HTMLElement, project: ProjectRow): void {
		const section = root.createDiv({ cls: "pe-section pe-overview-entities" });
		section.createEl("h3", { text: "Linked entities", cls: "pe-section-title" });
		const grid = section.createDiv({ cls: "pe-entity-grid" });
		this.entityBlock(grid, "Customer", project.customer ? [project.customer] : []);
		this.entityBlock(grid, "Project type", project.projectType ? [project.projectType] : []);
		this.entityBlock(grid, "Technologies", project.technologies);
		this.entityBlock(grid, "Team", project.team);
		this.entityBlock(grid, "Stakeholders", project.stakeholders);
		this.entityBlock(grid, "Work orders", project.commesse);
		if (project.parentProjectId) {
			this.entityBlock(grid, "Parent project", [project.parentProjectId]);
		}
	}

	private entityBlock(parent: HTMLElement, title: string, values: string[]): void {
		const block = parent.createDiv({ cls: "pe-entity-block" });
		block.createEl("h4", { text: title });
		if (values.length === 0) {
			block.createEl("p", { text: "—", cls: "pe-help" });
			return;
		}
		const list = block.createEl("ul");
		for (const value of values) {
			list.createEl("li", { text: stripWiki(value) });
		}
	}

	private renderGovernance(root: HTMLElement, project: ProjectRow): void {
		const section = root.createDiv({ cls: "pe-section" });
		section.createEl("h3", { text: "Governance", cls: "pe-section-title" });

		if (project.governance === "Semplificato") {
			section.createEl("p", {
				cls: "pe-help",
				text: `Linear board: ${Object.values(SEMPLIFICATO_LABELS).join(" → ")}. Open the Board view to move tasks.`,
			});
			return;
		}

		const fm = this.app.metadataCache.getFileCache(project.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const stages = readProjectStages(fm);
		const list = section.createEl("ul", { cls: "pe-stage-list" });
		for (const stage of stages) {
			list.createEl("li", {
				text: `${stage.sequence}. ${stage.name} · boundary ${stage.boundaryTaskId ?? "—"} · ${stage.status}`,
			});
		}
		if (stages.length === 0) {
			list.createEl("li", { text: "No management stages yet." });
		}

		const actions = section.createDiv({ cls: "pe-inline-row" });
		this.cta(actions, "Ensure registers", false, () => {
			void (async () => {
				const folder = project.file.parent?.path ?? "";
				await ensurePrince2Registers(
					this.app.vault,
					folder,
					toWikiLink(project.file.basename),
					project.name,
					this.plugin.settings.scaffoldRegistersFolder,
				);
				new Notice("PRINCE2 registers ready");
				await this.loadProject();
			})();
		});
		this.cta(actions, "Add stage", false, () => {
			void this.promptAddStage(project);
		});
	}

	private async promptAddStage(row: ProjectRow): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(row.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const existing = readProjectStages(fm);
		const name = window.prompt("Stage name", `Stage ${existing.length + 1}`);
		if (!name?.trim()) {
			return;
		}
		try {
			const tasks = await loadAllTasks(
				this.app,
				this.plugin.settings.tasksFolder,
				this.plugin.settings.hoursPerManday,
			);
			const tasksFolder =
				containingProjectFolder(row.file.path)
					? `${containingProjectFolder(row.file.path)}/${this.plugin.settings.scaffoldTasksFolder || "Tasks"}`
					: this.plugin.settings.tasksFolder;
			const result = await createPrince2Stage({
				vault: this.app.vault,
				projectFile: row.file,
				projectId: row.id,
				projectLink: toWikiLink(row.file.basename),
				stageName: name.trim(),
				sequence: existing.length + 1,
				tasksFolder,
				existingTaskIds: tasks.map((task) => task.id),
				hoursPerManday: this.plugin.settings.hoursPerManday,
			});
			new Notice(
				`Created stage ${result.stage.name} with boundary ${result.boundaryTaskId}`,
			);
			await this.loadProject();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not create stage: ${message}`);
		}
	}
}

function stripWiki(value: string): string {
	return value.replace(/^\[\[/, "").replace(/\]\]$/, "");
}
