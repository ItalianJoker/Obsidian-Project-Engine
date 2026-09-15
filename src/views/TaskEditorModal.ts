/**
 * Task editor modal — thin host around {@link TaskEditor}.
 */

import { Modal, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { Task, TaskId, WikiLink } from "../models/types";
import { TaskEditor } from "./TaskEditor";

export { openTaskEditor, openTaskEditorForActiveProject } from "./TaskEditor";

/**
 * Modal host for the mountable task editor.
 */
export class TaskEditorModal extends Modal {
	private editor: TaskEditor | null = null;

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		private readonly projectId: string,
		private readonly projectLink: WikiLink,
		private readonly existing: Task | null = null,
		private readonly parentId: TaskId | null = null,
		private readonly onSaved?: () => void,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-task-modal");
	}

	override onOpen(): void {
		this.editor = new TaskEditor(
			this.app,
			this.plugin,
			this.projectId,
			this.projectLink,
			this.existing,
			this.parentId,
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
