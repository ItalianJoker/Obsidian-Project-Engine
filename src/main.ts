/**
 * Projects Engine — Obsidian plugin entry point.
 *
 * Registers the ViewRouter-driven Dashboard → Overview → Workspace funnel
 * (adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) IA),
 * creation modal, settings, entity CRUD, task editor, scheduler undo stack,
 * and a debounced entity indexer.
 *
 * Mobile-first: `isDesktopOnly` is false, writes go through `vault.process`,
 * and no Node.js builtins are imported.
 */

import { Notice, Plugin, TFile } from "obsidian";
import { CommandStack, Scheduler } from "./engine/Scheduler";
import { EntityIndexer } from "./engine/Indexer";
import { DEFAULT_SETTINGS, type CustomFieldEntityKind, type ProjectsEngineSettings } from "./models/types";
import { splitFrontmatter } from "./services/frontmatter";
import { scaffoldProjectTree } from "./services/projectScaffold";
import { applyAssignedTaskListTemplate } from "./services/taskListTemplates";
import {
	handleProjectDeepLink,
	PROJECTS_ENGINE_URI_ACTION,
} from "./services/obsidianUri";
import { isValidTeamsChannelUrl, openExternalUrl } from "./services/urls";
import { ProjectsEngineSettingTab } from "./settings";
import { openEntityModal } from "./views/EntityModal";
import { openTaskListTemplateModal } from "./views/TaskListTemplateModal";
import { ProjectCreationModal } from "./views/ProjectCreationModal";
import {
	DASHBOARD_VIEW_TYPE,
	DashboardView,
} from "./views/DashboardView";
import { OVERVIEW_VIEW_TYPE, ProjectOverviewView } from "./views/ProjectOverviewView";
import {
	PROJECT_EDIT_VIEW_TYPE,
	ProjectEditView,
} from "./views/ProjectEditView";
import {
	WORKSPACE_VIEW_TYPE,
	ProjectWorkspaceView,
} from "./views/ProjectWorkspaceView";
import { RELEASE_NOTES_VIEW_TYPE, ReleaseNotesView } from "./views/ReleaseNotesView";
import { TASK_VIEW_TYPE, TaskView } from "./views/TaskView";
import { activateGanttView } from "./views/GanttView";
import { ViewRouter } from "./views/ViewRouter";
import { openTaskEditorForActiveProject } from "./views/TaskEditor";

/**
 * Plugin façade shared with modals, views, and the settings tab.
 */
export default class ProjectsEnginePlugin extends Plugin {
	public override settings!: ProjectsEngineSettings;
	public indexer!: EntityIndexer;
	public router!: ViewRouter;
	public readonly scheduler = new Scheduler();
	public readonly commandStack = new CommandStack();

	/**
	 * Load settings, start the indexer, and register UI surfaces.
	 */
	override async onload(): Promise<void> {
		await this.loadSettings();

		this.indexer = new EntityIndexer(
			this.app,
			() => this.settings,
			this.settings.indexerDebounceMs,
		);
		this.router = new ViewRouter(this);

		this.registerEvent(
			this.app.vault.on("create", () => this.indexer.scheduleRebuild()),
		);
		this.registerEvent(
			this.app.vault.on("modify", () => this.indexer.scheduleRebuild()),
		);
		this.registerEvent(
			this.app.vault.on("delete", () => this.indexer.scheduleRebuild()),
		);
		this.registerEvent(
			this.app.vault.on("rename", () => this.indexer.scheduleRebuild()),
		);
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => this.indexer.scheduleRebuild()),
		);

		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
		this.registerView(OVERVIEW_VIEW_TYPE, (leaf) => new ProjectOverviewView(leaf, this));
		this.registerView(WORKSPACE_VIEW_TYPE, (leaf) => new ProjectWorkspaceView(leaf, this));
		this.registerView(PROJECT_EDIT_VIEW_TYPE, (leaf) => new ProjectEditView(leaf, this));
		this.registerView(TASK_VIEW_TYPE, (leaf) => new TaskView(leaf, this));
		this.registerView(RELEASE_NOTES_VIEW_TYPE, (leaf) => new ReleaseNotesView(leaf, this));

		/**
		 * Deep link: `obsidian://projects-engine?vault=…&id=PRJ-…&view=overview`
		 * Opens the Overview (or Workspace) ItemView — not the raw `.md` editor.
		 */
		this.registerObsidianProtocolHandler(PROJECTS_ENGINE_URI_ACTION, (params) => {
			void handleProjectDeepLink(this, params);
		});

		this.app.workspace.onLayoutReady(() => {
			this.indexer.rebuild();
		});

		this.addRibbonIcon("briefcase", "Projects Engine: Projects", () => {
			void this.router.openDashboard();
		});

		this.addCommand({
			id: "open-portfolio",
			name: "Open projects pane",
			callback: () => {
				void this.router.openDashboard();
			},
		});

		this.addCommand({
			id: "show-release-notes",
			name: "Show release notes",
			callback: () => {
				void this.router.openReleaseNotes();
			},
		});

		this.addCommand({
			id: "open-gantt",
			name: "Open Gantt for current project",
			callback: () => {
				void activateGanttView(this);
			},
		});

		this.addCommand({
			id: "open-workspace",
			name: "Open workspace for current project",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (fm?.pe_type !== "project") {
					return false;
				}
				if (!checking) {
					void this.router.openWorkspace(file.path);
				}
				return true;
			},
		});

		this.addCommand({
			id: "open-overview",
			name: "Open overview for current project",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (fm?.pe_type !== "project") {
					return false;
				}
				if (!checking) {
					void this.router.openOverview(file.path);
				}
				return true;
			},
		});

		this.addCommand({
			id: "edit-current-project",
			name: "Edit current project",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (fm?.pe_type !== "project") {
					return false;
				}
				if (!checking) {
					void this.router.openProjectEdit(file.path);
				}
				return true;
			},
		});

		this.addCommand({
			id: "create-project",
			name: "Create project",
			callback: () => this.openCreationModal(),
		});

		this.addCommand({
			id: "create-task",
			name: "Create task for active project",
			callback: () => {
				void openTaskEditorForActiveProject(this);
			},
		});

		this.registerEntityCommands();

		this.addCommand({
			id: "create-task-list-template",
			name: "Create task list template",
			callback: () => openTaskListTemplateModal(this),
		});

		this.addCommand({
			id: "edit-active-task-list-template",
			name: "Edit active task list template",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				const peType = this.app.metadataCache.getFileCache(file)?.frontmatter?.pe_type;
				if (peType !== "task-list-template") {
					return false;
				}
				if (!checking) {
					openTaskListTemplateModal(this, file);
				}
				return true;
			},
		});

		this.addCommand({
			id: "open-teams-channel",
			name: "Open Teams channel for current project",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				if (checking) {
					return true;
				}
				void this.openTeamsChannel(file);
				return true;
			},
		});

		this.addCommand({
			id: "scheduler-undo",
			name: "Undo last schedule change",
			callback: () => {
				if (!this.commandStack.undo()) {
					new Notice("Nothing to undo");
				} else {
					new Notice("Undid last change");
				}
			},
		});

		this.addCommand({
			id: "scheduler-redo",
			name: "Redo last schedule change",
			callback: () => {
				if (!this.commandStack.redo()) {
					new Notice("Nothing to redo");
				} else {
					new Notice("Redid last change");
				}
			},
		});

		this.addSettingTab(new ProjectsEngineSettingTab(this.app, this));
	}

	/**
	 * Cancel pending indexer timers so a disabled plugin does not rebuild later.
	 */
	override onunload(): void {
		this.indexer?.cancel();
		this.commandStack.clear();
	}

	public openCreationModal(): void {
		new ProjectCreationModal(this.app, this).open();
	}

	/**
	 * Merge persisted data onto {@link DEFAULT_SETTINGS}.
	 */
	public async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<ProjectsEngineSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...saved,
			projectStatuses: DEFAULT_SETTINGS.projectStatuses.map((item) => ({ ...item })),
			taskStatuses: DEFAULT_SETTINGS.taskStatuses.map((item) => ({ ...item })),
			customFieldSchemas: [],
		};
		if (saved?.customFieldSchemas && Array.isArray(saved.customFieldSchemas)) {
			this.settings.customFieldSchemas = saved.customFieldSchemas;
		}
		if (saved?.projectStatuses && Array.isArray(saved.projectStatuses) && saved.projectStatuses.length > 0) {
			this.settings.projectStatuses = saved.projectStatuses
				.filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
				.map((item) => ({
					id: item.id.trim(),
					label: item.label.trim() || item.id,
					color: typeof item.color === "string" ? item.color : undefined,
					archived: item.archived === true,
				}))
				.filter((item) => item.id.length > 0);
		}
		if (this.settings.projectStatuses.length === 0) {
			this.settings.projectStatuses = DEFAULT_SETTINGS.projectStatuses.map((item) => ({
				...item,
			}));
		}
		if (saved?.taskStatuses && Array.isArray(saved.taskStatuses) && saved.taskStatuses.length > 0) {
			this.settings.taskStatuses = saved.taskStatuses
				.filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
				.map((item) => ({
					id: item.id.trim(),
					label: item.label.trim() || item.id,
					color: typeof item.color === "string" ? item.color : undefined,
					archived: item.archived === true,
				}))
				.filter((item) => item.id.length > 0);
		} else {
			this.settings.taskStatuses = DEFAULT_SETTINGS.taskStatuses.map((item) => ({ ...item }));
		}
		if (this.settings.taskStatuses.length === 0) {
			this.settings.taskStatuses = DEFAULT_SETTINGS.taskStatuses.map((item) => ({
				...item,
			}));
		}
		if (this.settings.projectSurface !== "workspace") {
			this.settings.projectSurface = "overview";
		}
		if (this.settings.taskEditorSurface !== "tab") {
			this.settings.taskEditorSurface = "modal";
		}
		if (
			this.settings.defaultView !== "gantt" &&
			this.settings.defaultView !== "kanban" &&
			this.settings.defaultView !== "eisenhower"
		) {
			this.settings.defaultView = "table";
		}
		if (!Number.isFinite(this.settings.hoursPerManday) || this.settings.hoursPerManday <= 0) {
			this.settings.hoursPerManday = 8;
		}
		const dateFormats = new Set(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);
		if (!dateFormats.has(this.settings.dateFormat)) {
			this.settings.dateFormat = "DD/MM/YYYY";
		}
		if (this.settings.timeFormat !== "12h") {
			this.settings.timeFormat = "24h";
		}
		const zooms = new Set(["day", "week", "month", "quarter", "year"]);
		if (!zooms.has(this.settings.ganttGranularity)) {
			this.settings.ganttGranularity = "week";
		}
		if (
			this.settings.ganttWeekLabel !== "dateRange" &&
			this.settings.ganttWeekLabel !== "both"
		) {
			this.settings.ganttWeekLabel = "weekNumber";
		}
		if (
			this.settings.lineBorders !== "none" &&
			this.settings.lineBorders !== "vertical" &&
			this.settings.lineBorders !== "both"
		) {
			this.settings.lineBorders = "horizontal";
		}
		this.settings.showSubtreeConnections = this.settings.showSubtreeConnections !== false;
		this.settings.kanbanShowSubtasks = this.settings.kanbanShowSubtasks === true;
		this.settings.kanbanShowDescriptionPreview =
			this.settings.kanbanShowDescriptionPreview === true;
		this.settings.autoSchedule = this.settings.autoSchedule !== false;
		this.settings.pullForwardOnEarlyFinish = this.settings.pullForwardOnEarlyFinish === true;
		this.settings.saveTaskOnClose = this.settings.saveTaskOnClose !== false;
		this.settings.showReleaseNotes = this.settings.showReleaseNotes !== false;
		this.settings.showPrince2RegisterWidgets =
			this.settings.showPrince2RegisterWidgets !== false;
		this.settings.scaffoldTasksFolder = this.settings.scaffoldTasksFolder || "Tasks";
		this.settings.scaffoldInitiationFolder =
			this.settings.scaffoldInitiationFolder || "Initiation";
		this.settings.scaffoldDocumentsFolder =
			this.settings.scaffoldDocumentsFolder || "Documents";
		this.settings.scaffoldRegistersFolder =
			this.settings.scaffoldRegistersFolder || "Registers";
		this.settings.taskListTemplatesFolder =
			this.settings.taskListTemplatesFolder ||
			"Projects/Entities/Task List Templates";
	}

	public async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Called by the creation modal after a project note is written so the
	 * containment tree (Tasks / Initiation / Documents / Registers) is
	 * scaffolded, an optional task-list template is applied, and the router
	 * can open the new project.
	 */
	public async afterProjectCreated(
		file: TFile,
		governance: string,
		projectId: string,
		name: string,
	): Promise<void> {
		await scaffoldProjectTree({
			vault: this.app.vault,
			projectFile: file,
			projectId,
			projectName: name,
			governance: governance === "PRINCE2" ? "PRINCE2" : "Semplificato",
			settings: this.settings,
		});
		const applied = await applyAssignedTaskListTemplate({
			app: this.app,
			vault: this.app.vault,
			projectFile: file,
			projectId,
			settings: this.settings,
		});
		if (applied && applied.created > 0) {
			new Notice(`Applied task list template (${applied.created} tasks)`);
		}
		await this.router.openProjectLink(file.path);
	}

	/**
	 * Refresh every open Projects Engine leaf after a status / data mutation.
	 */
	public refreshOpenViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			if (leaf.view instanceof DashboardView) {
				leaf.view.refresh();
			}
		}
		for (const leaf of this.app.workspace.getLeavesOfType(OVERVIEW_VIEW_TYPE)) {
			if (leaf.view instanceof ProjectOverviewView) {
				void leaf.view.refresh();
			}
		}
		for (const leaf of this.app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE)) {
			if (leaf.view instanceof ProjectWorkspaceView) {
				void leaf.view.refresh();
			}
		}
	}

	private registerEntityCommands(): void {
		const kinds: { id: string; kind: CustomFieldEntityKind; name: string }[] = [
			{ id: "create-customer", kind: "customer", name: "Create customer" },
			{ id: "create-team-member", kind: "team-member", name: "Create team member" },
			{ id: "create-project-type", kind: "project-type", name: "Create project type" },
			{ id: "create-technology", kind: "project-technology", name: "Create technology" },
			{ id: "create-stakeholder", kind: "stakeholder", name: "Create stakeholder" },
		];
		for (const item of kinds) {
			this.addCommand({
				id: item.id,
				name: item.name,
				callback: () => openEntityModal(this, item.kind),
			});
		}

		this.addCommand({
			id: "edit-active-entity",
			name: "Edit active entity note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				const peType = this.app.metadataCache.getFileCache(file)?.frontmatter?.pe_type;
				const kind = peTypeToCustomKind(peType);
				if (!kind) {
					return false;
				}
				if (!checking) {
					openEntityModal(this, kind, file);
				}
				return true;
			},
		});
	}

	/**
	 * Quick-launch the Teams channel stored on the active project note.
	 */
	private async openTeamsChannel(file: TFile): Promise<void> {
		const markdown = await this.app.vault.cachedRead(file);
		const { data } = splitFrontmatter(markdown);
		const url = typeof data.teams_channel_url === "string" ? data.teams_channel_url.trim() : "";
		if (!url) {
			new Notice("This note has no teams_channel_url");
			return;
		}
		if (!isValidTeamsChannelUrl(url)) {
			new Notice("teams_channel_url is not a valid Teams link");
			return;
		}
		openExternalUrl(url);
	}
}

function peTypeToCustomKind(peType: unknown): CustomFieldEntityKind | null {
	switch (peType) {
		case "customer":
			return "customer";
		case "team-member":
			return "team-member";
		case "project-type":
			return "project-type";
		case "technology":
			return "project-technology";
		case "stakeholder":
			return "stakeholder";
		default:
			return null;
	}
}
