/**
 * Edit Project modal — thin host around {@link ProjectEditor}.
 */

import { Modal, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { ProjectRow } from "./projectRows";
import { ProjectEditor } from "./ProjectEditor";

/**
 * Modal host for the mountable project editor.
 */
export class ProjectEditModal extends Modal {
	private editor: ProjectEditor | null = null;

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		private readonly project: ProjectRow,
		private readonly onSaved?: () => void,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-project-edit-modal");
	}

	override onOpen(): void {
		this.editor = new ProjectEditor(
			this.app,
			this.plugin,
			this.project,
			{ surface: "modal", close: () => this.close() },
			this.onSaved,
		);
		this.editor.mount(this.contentEl);
	}

	override onClose(): void {
		this.editor?.destroy();
		this.editor = null;
		this.contentEl.empty();
	}
}
