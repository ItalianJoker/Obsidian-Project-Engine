/**
 * @file ProjectPickerModal.ts
 * @purpose Choose a project before creating a task from Global Dashboard.
 * @dependencies projectRows
 * @usedBy GlobalDashboardView
 */

import { Modal, type App } from "obsidian";
import type { ProjectRow } from "../views/projectRows";

export interface ProjectPickerModalOptions {
	projects: ProjectRow[];
	title?: string;
	message?: string;
	onPick: (project: ProjectRow) => void;
}

/**
 * Modal listing projects for task creation when no project context exists.
 */
export class ProjectPickerModal extends Modal {
	constructor(
		app: App,
		private readonly options: ProjectPickerModalOptions,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
	}

	override onOpen(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		contentEl.createEl("h2", { text: options.title ?? "Select project" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: options.message ?? "Choose the project for the new task.",
		});

		const list = contentEl.createDiv({ cls: "pe-project-picker-list" });
		const fragment = document.createDocumentFragment();
		for (const project of options.projects) {
			const row = document.createElement("button");
			row.type = "button";
			row.className = "pe-project-picker-row pe-touch-target";
			row.textContent = `${project.id} — ${project.name}`;
			row.addEventListener("click", () => {
				options.onPick(project);
				this.close();
			});
			fragment.appendChild(row);
		}
		list.appendChild(fragment);

		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
