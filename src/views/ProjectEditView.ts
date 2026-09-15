/**
 * In-leaf project edit ItemView — parity with
 * [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) `ProjectEditView`
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 *
 * Mounts {@link ProjectEditor} with PE domain fields.
 */

import { ItemView, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { EmptyState } from "../ui/EmptyState";
import { ProjectEditor } from "./ProjectEditor";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";

/** Registered ItemView type id. */
export const PROJECT_EDIT_VIEW_TYPE = "projects-engine-project-edit";

/**
 * Leaf state addressing a project note to edit.
 */
export interface ProjectEditState {
	filePath?: string;
	[key: string]: unknown;
}

/**
 * ItemView for editing project frontmatter in a dedicated leaf.
 */
export class ProjectEditView extends ItemView {
	private editor: ProjectEditor | null = null;
	private state: ProjectEditState = {};
	private project: ProjectRow | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return PROJECT_EDIT_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return truncateTitle(this.project?.name ?? "Project", 10);
	}

	override getIcon(): string {
		return "settings";
	}

	override getState(): ProjectEditState {
		return { ...this.state };
	}

	override async setState(state: ProjectEditState, result: ViewStateResult): Promise<void> {
		const changed = state.filePath !== this.state.filePath;
		this.state = state;
		if (changed || !this.project) {
			await this.loadProject();
		}
		await super.setState(state, result);
	}

	override async onOpen(): Promise<void> {
		this.containerEl.addClass("pe-view");
		this.contentEl.empty();
		this.contentEl.addClass("pe-root");
		if (this.state.filePath) {
			await this.loadProject();
		}
	}

	override async onClose(): Promise<void> {
		this.editor?.destroy();
		this.editor = null;
		this.contentEl.empty();
	}

	private async loadProject(): Promise<void> {
		this.editor?.destroy();
		this.editor = null;
		this.contentEl.empty();

		const path = this.state.filePath;
		if (!path) {
			this.showMissing("No project was specified.");
			return;
		}
		const rows = loadProjectRows(this.app);
		this.project = findProjectRow(rows, path) ?? null;
		if (!this.project) {
			this.showMissing("The project note may have been moved or deleted.");
			return;
		}

		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();

		const mount = this.contentEl.createDiv({ cls: "pe-edit" });
		this.editor = new ProjectEditor(
			this.app,
			this.plugin,
			this.project,
			{
				surface: "tab",
				close: () => {
					void this.plugin.router.openOverview(this.project!.file.path, this.leaf);
				},
			},
			() => {
				// Reload overview after save (close already navigates).
			},
		);
		this.editor.mount(mount);
	}

	private showMissing(message: string): void {
		this.project = null;
		new EmptyState(this.contentEl)
			.setTitle("Project not found")
			.setBody(message)
			.setAction("Back to projects", () => {
				void this.plugin.router.openDashboard();
			});
	}
}

/**
 * Open project editor in modal or tab (default: tab — matches obsidian-pm Edit leaf).
 */
export async function openProjectEditor(
	plugin: ProjectsEnginePlugin,
	project: ProjectRow,
	opts?: {
		leaf?: WorkspaceLeaf;
		forceModal?: boolean;
		onSaved?: () => void;
	},
): Promise<void> {
	if (opts?.forceModal) {
		const { ProjectEditModal } = await import("./ProjectEditModal");
		new ProjectEditModal(plugin.app, plugin, project, opts.onSaved).open();
		return;
	}
	await plugin.router.openProjectEdit(project.file.path, opts?.leaf);
}

function truncateTitle(title: string, max: number): string {
	const trimmed = title.trim() || "Project";
	return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
