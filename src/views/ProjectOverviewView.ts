/**
 * Project overview — project **Dashboard** home with screenshot-aligned chrome.
 *
 * Bound to the chrome switcher’s **Dashboard** tab (left of Table). Table /
 * Gantt / Board navigate to the Workspace leaf (task-only SubViews).
 *
 * Section order on Dashboard:
 * 1. Governance
 * 2. Registers (PRINCE2 only — Risk / Issue & Change / Quality widgets)
 * 3. Status (project status)
 * 4. Task summary / metrics
 * 5. Task search bar + task list
 * 6. Documents
 * 7. Linked Entities
 * 8. Actions
 *
 * Documents tree is file-based and excludes Tasks/. Edit / Delete project live
 * under Actions.
 *
 * Layout inspiration from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */

import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { activeTaskStatuses, projectStatusLabel, toWikiLink } from "../models/types";
import {
	createPrince2Stage,
	readProjectStages,
} from "../services/governance";
import { ensurePrince2DocumentStructure } from "../services/prince2Templates";
import {
	buildProjectDocumentsTree,
	tasksFolderBasename,
} from "../services/projectDocuments";
import {
	listProjectDocumentFolders,
} from "../services/projectDocumentNote";
import { setProjectStatus } from "../services/projectIo";
import {
	deleteProjectFolder,
	notifyProjectDeleted,
} from "../services/projectDelete";
import { containingProjectFolder } from "../services/projectPaths";
import {
	OPERATIONAL_REGISTERS,
	countRegisterEntries,
	createRegisterEntry,
	listRegisterEntries,
	projectRegistersFolder,
	registerIndexPath,
	type OperationalRegisterKind,
	type RegisterEntryRow,
} from "../services/registerIo";
import {
	formatGiornate,
	formatHours,
	formatHoursAndGiornate,
	giornateToHours,
} from "../services/timeLogs";
import { copyProjectObsidianUri } from "../services/obsidianUri";
import { isValidTeamsChannelUrl, openExternalUrl } from "../services/urls";
import { ConfirmModal } from "../ui/ConfirmModal";
import { CreateProjectDocumentModal } from "../ui/CreateProjectDocumentModal";
import { EmptyState } from "../ui/EmptyState";
import { renderProjectChrome } from "../ui/ProjectChrome";
import { renderProjectDocumentsTree } from "../ui/ProjectDocumentsTree";
import { TextPromptModal } from "../ui/TextPromptModal";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";
import { loadAllTasks } from "../services/taskIo";
import { openProjectEditor } from "./ProjectEditView";
import { TaskEditorModal } from "./TaskEditorModal";
import {
	TableSubView,
	type TaskDashboardFilters,
} from "./subviews/TableSubView";
import {
	isWorkspaceViewMode,
	type WorkspaceViewMode,
} from "./ProjectWorkspaceView";

/** Registered ItemView type id. */
export const OVERVIEW_VIEW_TYPE = "projects-engine-overview";

/** How many recent register entries to show per widget. */
const REGISTER_WIDGET_RECENT = 5;

interface OverviewState {
	filePath?: string;
	[key: string]: unknown;
}

/**
 * Project Dashboard leaf: Governance → Status → metrics → search+tasks → …
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
	/** Governance section (Semplificato blurb or PRINCE2 stages) — first body section. */
	private governanceEl!: HTMLElement;
	/**
	 * PRINCE2 operational registers widgets (Risk / Issue & Change / Quality).
	 * Hidden for Semplificato projects.
	 */
	private registersEl!: HTMLElement;
	/** Editable project status — after Registers (or Governance when Simplified). */
	private statusEl!: HTMLElement;
	/** Task / budget metric strip — third body section. */
	private metricsEl!: HTMLElement;
	/** Tasks section: in-body search + heading + table SubView. */
	private tasksSectionEl!: HTMLElement;
	/** Mount for Dashboard search / All / Filter (not in chrome). */
	private taskSearchEl!: HTMLElement;
	private tableEl!: HTMLElement;
	/** File-based documents tree (Documents /, Initiation /, … — not Tasks /). */
	private docsEl!: HTMLElement;
	/** Linked entities grid. */
	private entitiesEl!: HTMLElement;
	/** Edit / Open note / Delete project actions. */
	private actionsEl!: HTMLElement;
	/**
	 * Collapsed folder paths in the documents tree. Survives vault-driven
	 * refreshes so expand/collapse is not reset on every Sync event.
	 */
	private docsCollapsedPaths = new Set<string>();
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

	/**
	 * Build stable section mounts in Dashboard order:
	 * Governance → Registers (PRINCE2) → Status → metrics → search+tasks →
	 * Documents → Entities → Actions.
	 *
	 * Separate elements (not one meta panel) so CSS stacking cannot pull the
	 * task-table footer over Documents — each section is a normal block sibling.
	 */
	private ensureInitialized(): void {
		if (this.initialized) return;
		this.initialized = true;
		this.containerEl.addClass("pe-view");
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		root.addClass("pe-overview");
		this.chromeEl = root.createDiv({ cls: "pe-chrome-mount" });
		// 1. Governance first (before Status).
		this.governanceEl = root.createDiv({ cls: "pe-overview-governance" });
		// 2. PRINCE2 Registers widgets (empty / hidden for Semplificato).
		this.registersEl = root.createDiv({ cls: "pe-overview-registers" });
		// 3. Status
		this.statusEl = root.createDiv({ cls: "pe-overview-status" });
		// 4. Task summary / metrics
		this.metricsEl = root.createDiv({ cls: "pe-overview-summary pe-overview-metrics" });
		// 5. Task search + optional filter hint + task list
		this.tasksSectionEl = root.createDiv({ cls: "pe-overview-tasks" });
		this.taskSearchEl = this.tasksSectionEl.createDiv({ cls: "pe-overview-task-search" });
		this.filterEl = this.tasksSectionEl.createDiv({ cls: "pe-chrome-filter-panel" });
		this.tasksSectionEl.createEl("h3", { text: "Tasks", cls: "pe-section-title" });
		this.tableEl = this.tasksSectionEl.createDiv({ cls: "pe-overview-table" });
		// 6–8. Documents → Linked Entities → Actions
		this.docsEl = root.createDiv({ cls: "pe-overview-docs" });
		this.entitiesEl = root.createDiv({ cls: "pe-overview-entities" });
		this.actionsEl = root.createDiv({ cls: "pe-overview-actions" });
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
		this.governanceEl?.empty();
		this.registersEl?.empty();
		this.statusEl?.empty();
		this.metricsEl?.empty();
		this.taskSearchEl?.empty();
		this.tableEl?.empty();
		this.docsEl?.empty();
		this.entitiesEl?.empty();
		this.actionsEl?.empty();
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

		// Dashboard chrome: highlight Dashboard; search lives in the tasks section.
		renderProjectChrome({
			container: this.chromeEl,
			project,
			mode: "dashboard",
			searchText: this.filters.text,
			filterAll: !filterActive,
			showSearchRow: false,
			onModeChange: (mode) => {
				// Already on Dashboard — no-op when re-selecting home.
				if (mode === "dashboard") {
					return;
				}
				if (isWorkspaceViewMode(mode)) {
					void this.openWorkspace(mode);
				}
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
			onCopyObsidianUrl: () => {
				void copyProjectObsidianUri(this.app, project, { view: "overview" });
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

		// Optional hint when Filter is toggled from the in-body search row.
		this.filterEl.empty();
		if (this.showFilterPanel) {
			this.filterEl.addClass("is-open");
			this.filterEl.createEl("p", {
				cls: "pe-help",
				text: "Use Table / Gantt / Board filters for status and priority, or clear with All.",
			});
		} else {
			this.filterEl.removeClass("is-open");
		}

		// Body order: Governance → Registers → Status → metrics → search+tasks → Docs → Entities → Actions
		this.renderGovernance(project);
		this.renderRegisters(project);
		this.renderStatus(project);
		this.renderMetrics(project);
		this.renderTaskSearch(filterActive);
		this.renderTable();
		this.renderDocuments(project);
		this.renderEntities(project);
		this.renderActions(project);
	}

	/**
	 * Scan the project folder and render quick links (excludes Tasks/).
	 * Reuses the Overview vault event debounce for auto-refresh.
	 *
	 * “New note” opens {@link CreateProjectDocumentModal} so the file gets
	 * YAML `project` + body `## Links` wikilinks for Graph View.
	 */
	private renderDocuments(project: ProjectRow): void {
		const folder = containingProjectFolder(project.file.path);
		const excludeTasks = tasksFolderBasename(
			this.plugin.settings.scaffoldTasksFolder,
		);
		const nodes = folder
			? buildProjectDocumentsTree(this.app.vault, folder, {
					excludeRootFolderName: excludeTasks,
					excludeFilePaths: [project.file.path],
				})
			: [];

		renderProjectDocumentsTree({
			app: this.app,
			container: this.docsEl,
			nodes,
			collapsedPaths: this.docsCollapsedPaths,
			onToggleFolder: (folderPath) => {
				if (this.docsCollapsedPaths.has(folderPath)) {
					this.docsCollapsedPaths.delete(folderPath);
				} else {
					this.docsCollapsedPaths.add(folderPath);
				}
				this.renderDocuments(project);
			},
			onCreateNote: folder
				? (folderPath) => {
						this.openCreateDocumentModal(project, folder, folderPath);
					}
				: undefined,
		});
	}

	/**
	 * Modal to create a Graph-linked note under Documents / Initiation / etc.
	 */
	private openCreateDocumentModal(
		project: ProjectRow,
		projectFolder: string,
		initialFolderPath?: string,
	): void {
		const documentsFolderName =
			this.plugin.settings.scaffoldDocumentsFolder || "Documents";
		const folderChoices = listProjectDocumentFolders(this.app.vault, projectFolder, {
			documentsFolderName,
			excludeRootFolderName: tasksFolderBasename(
				this.plugin.settings.scaffoldTasksFolder,
			),
		});

		new CreateProjectDocumentModal(this.app, {
			projectFile: project.file,
			projectFolderPath: projectFolder,
			folderChoices,
			documentsFolderName,
			initialFolderPath,
			onCreated: async (file) => {
				this.renderDocuments(project);
				await this.app.workspace.getLeaf(false).openFile(file);
			},
		}).open();
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

	/**
	 * Editable project status — Dashboard section 2 (after Governance).
	 */
	private renderStatus(project: ProjectRow): void {
		const root = this.statusEl;
		root.empty();
		root.createEl("h3", { text: "Status", cls: "pe-section-title" });

		const statusRow = root.createDiv({ cls: "pe-overview-status-row pe-inline-row" });
		statusRow.createEl("label", { text: "Project status", cls: "pe-label" });
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
	}

	/**
	 * Budget / effort metric strip — Dashboard section 3 (task summary).
	 */
	private renderMetrics(project: ProjectRow): void {
		const root = this.metricsEl;
		root.empty();
		root.createEl("h3", { text: "Task summary", cls: "pe-section-title" });

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
	}

	/**
	 * In-body Search tasks… / All / Filter — Dashboard section 4 (with the task table).
	 * Kept out of chrome so Status → metrics → search+list reading order is correct.
	 */
	private renderTaskSearch(filterActive: boolean): void {
		const row = this.taskSearchEl;
		row.empty();
		row.addClass("pe-chrome-search-row");

		const search = row.createEl("input", {
			cls: "pe-chrome-search pe-touch-target",
			attr: {
				type: "search",
				placeholder: "Search tasks…",
				"aria-label": "Search tasks",
			},
		});
		search.value = this.filters.text;
		search.addEventListener("input", () => {
			this.filters.text = search.value;
			this.renderTable();
		});

		const chips = row.createDiv({ cls: "pe-chrome-filter-chips" });
		const allBtn = chips.createEl("button", {
			text: "All",
			cls: `pe-filter-chip pe-touch-target${!filterActive ? " is-active" : ""}`,
			attr: { type: "button", "aria-pressed": String(!filterActive) },
		});
		allBtn.addEventListener("click", () => {
			this.filters = { text: this.filters.text, status: "all", priority: "all" };
			this.showFilterPanel = false;
			this.render();
		});
		const filterBtn = chips.createEl("button", {
			text: "Filter",
			cls: `pe-filter-chip pe-touch-target${filterActive ? " is-active" : ""}`,
			attr: { type: "button", "aria-pressed": String(filterActive) },
		});
		filterBtn.addEventListener("click", () => {
			this.showFilterPanel = !this.showFilterPanel;
			this.render();
		});
	}

	/**
	 * Project edit / launch actions — last section on the home surface.
	 */
	private renderActions(project: ProjectRow): void {
		const actions = this.actionsEl;
		actions.empty();
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
		this.cta(row, "Copy Obsidian URL", false, () => {
			void copyProjectObsidianUri(this.app, project, { view: "overview" });
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

	/**
	 * Leave Dashboard for a task-only Workspace SubView (Table / Gantt / Board).
	 */
	private async openWorkspace(mode: WorkspaceViewMode): Promise<void> {
		const project = this.project;
		if (!project) return;
		await this.plugin.router.openWorkspace(project.file.path, this.leaf, mode);
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

	private renderEntities(project: ProjectRow): void {
		const section = this.entitiesEl;
		section.empty();
		section.createEl("h3", { text: "Linked Entities", cls: "pe-section-title" });
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

	private renderGovernance(project: ProjectRow): void {
		const section = this.governanceEl;
		section.empty();
		section.createEl("h3", { text: "Governance", cls: "pe-section-title" });

		if (project.governance === "Semplificato") {
			const columns = activeTaskStatuses(this.plugin.settings.taskStatuses);
			const flow =
				columns.length > 0
					? columns.map((item) => item.label).join(" → ")
					: "Backlog → In Progress → Review → Done";
			section.createEl("p", {
				cls: "pe-help",
				text: `Linear board: ${flow}. Open the Board view to move tasks (columns are configurable in Settings).`,
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
		this.cta(actions, "Ensure PRINCE2 docs", false, () => {
			void (async () => {
				const folder = project.file.parent?.path ?? "";
				await ensurePrince2DocumentStructure({
					vault: this.app.vault,
					projectFolder: folder,
					projectLink: toWikiLink(project.file.basename),
					projectName: project.name,
					initiationFolderName: this.plugin.settings.scaffoldInitiationFolder,
					registersFolderName: this.plugin.settings.scaffoldRegistersFolder,
				});
				new Notice("PRINCE2 document templates ready");
				await this.loadProject();
			})();
		});
		this.cta(actions, "Add stage", false, () => {
			void this.promptAddStage(project);
		});
	}

	/**
	 * PRINCE2-only Dashboard widgets: count / recent entries / quick-add / open.
	 * Cleared for Semplificato and when Settings → “Show PRINCE2 register widgets”
	 * is off. Register notes remain in Registers/ and the Documents tree either way.
	 */
	private renderRegisters(project: ProjectRow): void {
		const section = this.registersEl;
		section.empty();
		const showWidgets =
			project.governance === "PRINCE2" &&
			this.plugin.settings.showPrince2RegisterWidgets !== false;
		section.toggleClass("is-hidden", !showWidgets);
		if (!showWidgets) {
			return;
		}

		section.createEl("h3", { text: "Registers", cls: "pe-section-title" });
		section.createEl("p", {
			cls: "pe-help",
			text: "Operational Risk, Issue & Change, and Quality entries as linked notes. Quick-add creates a Graph-ready entry under Registers/.",
		});

		const registersFolder = projectRegistersFolder(
			project.file.path,
			this.plugin.settings.scaffoldRegistersFolder,
		);
		if (!registersFolder) {
			section.createEl("p", {
				cls: "pe-help",
				text: "Project folder not found — cannot load registers.",
			});
			return;
		}

		const grid = section.createDiv({ cls: "pe-register-widgets" });
		for (const meta of OPERATIONAL_REGISTERS) {
			const entries = listRegisterEntries(this.app, registersFolder, meta.kind);
			this.renderRegisterWidget(grid, project, registersFolder, meta.kind, meta.title, entries);
		}
	}

	/**
	 * One register card: title + counts, Open / Add, recent clickable rows.
	 */
	private renderRegisterWidget(
		parent: HTMLElement,
		project: ProjectRow,
		registersFolder: string,
		kind: OperationalRegisterKind,
		title: string,
		entries: RegisterEntryRow[],
	): void {
		const widget = parent.createDiv({ cls: "pe-register-widget" });
		const header = widget.createDiv({ cls: "pe-register-widget-header" });
		const counts = countRegisterEntries(entries);
		header.createEl("h4", {
			cls: "pe-register-widget-title",
			text: title,
		});
		header.createEl("span", {
			cls: "pe-register-widget-counts",
			text:
				counts.total === 0
					? "No entries yet"
					: `${counts.open} open · ${counts.total} total`,
		});

		const actions = widget.createDiv({ cls: "pe-inline-row pe-register-widget-actions" });
		this.cta(actions, "Open", false, () => {
			void this.openRegisterIndex(registersFolder, kind);
		});
		this.cta(actions, "Add entry", true, () => {
			this.promptAddRegisterEntry(project, kind);
		});

		const list = widget.createEl("ul", { cls: "pe-register-entry-list" });
		const recent = entries.slice(0, REGISTER_WIDGET_RECENT);
		if (recent.length === 0) {
			list.createEl("li", {
				cls: "pe-register-entry-empty",
				text: "No entries — use Add entry to create the first note.",
			});
			return;
		}
		for (const entry of recent) {
			const li = list.createEl("li", { cls: "pe-register-entry-row" });
			const button = li.createEl("button", {
				cls: "pe-register-entry-link pe-touch-target",
				attr: { type: "button" },
			});
			const metaBits = [entry.id, entry.status || "—"];
			if (entry.severityOrPriority) {
				metaBits.push(entry.severityOrPriority);
			}
			if (entry.date) {
				metaBits.push(entry.date);
			}
			button.createSpan({ cls: "pe-register-entry-meta", text: metaBits.join(" · ") });
			button.createSpan({ cls: "pe-register-entry-name", text: entry.title });
			button.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(entry.file);
			});
		}
	}

	/**
	 * Open (or create) the lean register index note for a kind.
	 */
	private async openRegisterIndex(
		registersFolder: string,
		kind: OperationalRegisterKind,
	): Promise<void> {
		const project = this.project;
		if (!project) {
			return;
		}
		try {
			await ensurePrince2DocumentStructure({
				vault: this.app.vault,
				projectFolder: project.file.parent?.path ?? "",
				projectLink: toWikiLink(project.file.basename),
				projectName: project.name,
				initiationFolderName: this.plugin.settings.scaffoldInitiationFolder,
				registersFolderName: this.plugin.settings.scaffoldRegistersFolder,
			});
			const path = registerIndexPath(registersFolder, kind);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			} else {
				new Notice(`Register note not found at ${path}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not open register: ${message}`);
		}
	}

	/**
	 * Prompt for a title, then create a Graph-linked entry note and open it.
	 */
	private promptAddRegisterEntry(
		project: ProjectRow,
		kind: OperationalRegisterKind,
	): void {
		const meta = OPERATIONAL_REGISTERS.find((item) => item.kind === kind);
		const noun = meta?.entryNoun ?? "entry";
		new TextPromptModal(this.app, {
			title: `Add ${noun}`,
			message: `Creates a Markdown note under Registers/ linked to this project (${meta?.title ?? kind}).`,
			placeholder: kind === "quality-register" ? "Product or check name" : "Short title",
			confirmLabel: "Create",
			onSubmit: async (value) => {
				const title = value.trim();
				if (!title) {
					return "Title is required";
				}
				try {
					const result = await createRegisterEntry({
						app: this.app,
						vault: this.app.vault,
						projectFile: project.file,
						kind,
						title,
						registersFolderName: this.plugin.settings.scaffoldRegistersFolder,
					});
					new Notice(`Created ${result.id}`);
					await this.app.workspace.getLeaf(false).openFile(result.file);
					await this.loadProject();
					return undefined;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return message;
				}
			},
		}).open();
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
