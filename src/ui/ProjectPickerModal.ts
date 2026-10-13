/**
 * @file ProjectPickerModal.ts
 * @purpose Choose a project before creating a task from Global Dashboard.
 * @dependencies projectRows
 * @usedBy GlobalDashboardView
 *
 * Uses a `<select>` dropdown (not button chips) so the picker matches other
 * PE forms (folder / template selects) and stays keyboard-accessible.
 */

import { Modal, Notice, type App } from "obsidian";
import type { ProjectRow } from "../views/projectRows";

export interface ProjectPickerModalOptions {
	projects: ProjectRow[];
	title?: string;
	message?: string;
	/** Optional pre-selected project id. */
	initialProjectId?: string;
	onPick: (project: ProjectRow) => void;
}

/**
 * Modal with a project dropdown for task creation when no project context exists.
 */
export class ProjectPickerModal extends Modal {
	private selectEl!: HTMLSelectElement;

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

		const field = contentEl.createDiv({ cls: "pe-field" });
		field.createEl("label", {
			text: "Project *",
			cls: "pe-label",
			attr: { for: "pe-project-picker-select" },
		});
		this.selectEl = field.createEl("select", {
			cls: "pe-input pe-touch-target pe-project-picker-select",
			attr: {
				id: "pe-project-picker-select",
				"aria-label": "Select project",
			},
		});
		this.selectEl.createEl("option", {
			text: "Select a project…",
			attr: { value: "" },
		});
		const sorted = [...options.projects].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
		for (const project of sorted) {
			this.selectEl.createEl("option", {
				text: `${project.id} — ${project.name}`,
				attr: { value: project.id },
			});
		}
		if (
			options.initialProjectId &&
			sorted.some((project) => project.id === options.initialProjectId)
		) {
			this.selectEl.value = options.initialProjectId;
		}

		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
		const confirm = actions.createEl("button", {
			text: "Continue",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		confirm.addEventListener("click", () => this.submit());
		this.selectEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				this.submit();
			}
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const id = this.selectEl.value.trim();
		if (!id) {
			new Notice("Select a project");
			return;
		}
		const project = this.options.projects.find((row) => row.id === id);
		if (!project) {
			new Notice("Project not found");
			return;
		}
		this.options.onPick(project);
		this.close();
	}
}
