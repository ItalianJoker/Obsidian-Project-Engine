/**
 * In-plugin release notes ItemView — adapted from
 * [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) `ReleaseNotesView`
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 *
 * Renders bilingual {@link RELEASE_NOTES} bundled at build time.
 */

import {
	Component,
	ItemView,
	MarkdownRenderer,
	type ViewStateResult,
	WorkspaceLeaf,
} from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { EmptyState } from "../ui/EmptyState";
import { RELEASE_NOTES_MARKDOWN } from "./releaseNotesData";

/** Registered ItemView type id. */
export const RELEASE_NOTES_VIEW_TYPE = "projects-engine-release-notes";

/**
 * Optional `since` version — when set, shows notes for the current release
 * (PE ships a single bundled RELEASE_NOTES.md for v1.x).
 */
export interface ReleaseNotesState {
	since?: string;
	[key: string]: unknown;
}

/**
 * Leaf showing What's new for Projects Engine.
 */
export class ReleaseNotesView extends ItemView {
	private state: ReleaseNotesState = {};
	private readonly notes = new Component();

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return RELEASE_NOTES_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Release notes";
	}

	override getIcon(): string {
		return "gift";
	}

	override getState(): ReleaseNotesState {
		return { ...this.state };
	}

	override async setState(state: ReleaseNotesState, result: ViewStateResult): Promise<void> {
		this.state = state;
		await this.render();
		await super.setState(state, result);
	}

	override async onOpen(): Promise<void> {
		this.containerEl.addClass("pe-view");
		this.contentEl.addClass("pe-release-notes");
		await this.render();
	}

	override async onClose(): Promise<void> {
		this.notes.unload();
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		const version = this.plugin.manifest.version;
		this.notes.unload();
		this.notes.load();
		this.contentEl.empty();

		const page = this.contentEl.createDiv({ cls: "pe-release-notes-page" });
		page.createEl("h1", { text: `What's new in Projects Engine ${version}` });

		const body = RELEASE_NOTES_MARKDOWN.trim();
		if (!body) {
			new EmptyState(page)
				.setTitle("No release notes")
				.setBody(`Version ${version} has no notes.`);
			return;
		}

		const section = page.createDiv({ cls: "pe-release-notes-release" });
		section.createEl("h2", { text: version });
		await MarkdownRenderer.render(
			this.app,
			body,
			section.createDiv({ cls: "markdown-rendered" }),
			"",
			this.notes,
		);

		page.createEl("a", {
			cls: "pe-release-notes-link",
			text: "Full release notes on GitHub",
			href: "https://github.com/ItalianJoker/Obsidian-Project-Engine/blob/main/RELEASE_NOTES.md",
		});
	}
}
