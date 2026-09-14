/**
 * Projects Engine — Obsidian plugin entry point.
 *
 * Registers the creation modal, settings tab, scheduler, undo stack, and a
 * debounced entity indexer. The plugin is mobile-first: `isDesktopOnly` is
 * false in manifest.json, writes go through `vault.process`, and no Node.js
 * builtins are imported.
 */

import { Notice, Plugin, TFile } from "obsidian";
import { CommandStack, Scheduler } from "./engine/Scheduler";
import { EntityIndexer } from "./engine/Indexer";
import { DEFAULT_SETTINGS, type ProjectsEngineSettings } from "./models/types";
import { splitFrontmatter } from "./services/frontmatter";
import { isValidTeamsChannelUrl, openExternalUrl } from "./services/urls";
import { ProjectsEngineSettingTab } from "./settings";
import { ProjectCreationModal } from "./views/ProjectCreationModal";

/**
 * Plugin façade shared with the modal and settings tab.
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

		this.app.workspace.onLayoutReady(() => {
			this.indexer.rebuild();
		});

		this.addRibbonIcon("briefcase", "Projects Engine: New project", () => {
			this.openCreationModal();
		});

		this.addCommand({
			id: "create-project",
			name: "Create project",
			callback: () => this.openCreationModal(),
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
				}
			},
		});

		this.addCommand({
			id: "scheduler-redo",
			name: "Redo last schedule change",
			callback: () => {
				if (!this.commandStack.redo()) {
					new Notice("Nothing to redo");
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
