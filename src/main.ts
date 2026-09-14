/**
 * Projects Engine — Obsidian plugin entry point.
 *
 * Registers the creation modal, settings tab, portfolio view, entity CRUD,
 * task editor, scheduler undo stack, and a debounced entity indexer.
 * Mobile-first: `isDesktopOnly` is false, writes go through `vault.process`,
 * and no Node.js builtins are imported.
 */

import { Notice, Plugin, TFile } from "obsidian";
import { CommandStack, Scheduler } from "./engine/Scheduler";
import { EntityIndexer } from "./engine/Indexer";
import { DEFAULT_SETTINGS, type CustomFieldEntityKind, type ProjectsEngineSettings } from "./models/types";
import { splitFrontmatter } from "./services/frontmatter";
import { scaffoldGovernance } from "./services/governance";
import { isValidTeamsChannelUrl, openExternalUrl } from "./services/urls";
import { ProjectsEngineSettingTab } from "./settings";
import { openEntityModal } from "./views/EntityModal";
import { ProjectCreationModal } from "./views/ProjectCreationModal";
import {
	PORTFOLIO_VIEW_TYPE,
	PortfolioView,
	activatePortfolioView,
} from "./views/PortfolioView";
import { openTaskEditorForActiveProject } from "./views/TaskEditorModal";

/**
 * Plugin façade shared with modals, views, and the settings tab.
 */
export default class ProjectsEnginePlugin extends Plugin {
	public override settings!: ProjectsEngineSettings;
	public indexer!: EntityIndexer;
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

		this.registerView(PORTFOLIO_VIEW_TYPE, (leaf) => new PortfolioView(leaf, this));

		this.app.workspace.onLayoutReady(() => {
			this.indexer.rebuild();
		});

		this.addRibbonIcon("briefcase", "Projects Engine: Portfolio", () => {
			void activatePortfolioView(this);
		});

		this.addCommand({
			id: "open-portfolio",
			name: "Open portfolio view",
			callback: () => {
				void activatePortfolioView(this);
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
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
		if (!Array.isArray(this.settings.customFieldSchemas)) {
			this.settings.customFieldSchemas = [];
		}
	}

	public async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Called by the creation modal after a project note is written so PRINCE2
	 * registers can be scaffolded without coupling the modal to governance I/O.
	 */
	public async afterProjectCreated(file: TFile, governance: string, projectId: string, name: string): Promise<void> {
		if (governance === "PRINCE2") {
			await scaffoldGovernance({
				vault: this.app.vault,
				governance: "PRINCE2",
				projectFile: file,
				projectId,
				projectName: name,
			});
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
