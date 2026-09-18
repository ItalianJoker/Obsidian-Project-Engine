/**
 * Create / edit modal for Entity-as-a-Note task-list templates.
 *
 * Persists nested `tasks` YAML via {@link saveTaskListTemplateNote} /
 * `vault.process`. English UI; touch-friendly rows for title, status,
 * priority, estimate hours, and indent (hierarchy).
 */

import { Modal, Notice, Setting, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	TASK_LIST_TEMPLATE_PE_TYPE,
	defaultTaskStatusId,
	type TaskPriority,
} from "../models/types";
import { splitFrontmatter } from "../services/frontmatter";
import {
	countTemplateTasks,
	defaultStarterTemplateItems,
	ensureTaskListTemplatesFolder,
	parseTemplateTaskItems,
	rowsToTree,
	saveTaskListTemplateNote,
	taskListTemplateNotePath,
	treeToRows,
	type TaskListTemplateEditorRow,
} from "../services/taskListTemplates";
import { noteExists, sanitiseNoteBasename } from "../services/vaultIo";

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Open the create/edit template modal.
 *
 * @param existing - When set, loads and updates that note; otherwise creates.
 */
export function openTaskListTemplateModal(
	plugin: ProjectsEnginePlugin,
	existing: TFile | null = null,
): void {
	new TaskListTemplateModal(plugin.app, plugin, existing).open();
}

/**
 * Touch-friendly template editor.
 */
export class TaskListTemplateModal extends Modal {
	private name = "";
	private description = "";
	private rows: TaskListTemplateEditorRow[] = [];
	private errorEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		private readonly existing: TFile | null,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
	}

	override onOpen(): void {
		void this.bootstrap();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async bootstrap(): Promise<void> {
		if (this.existing) {
			await this.loadExisting();
		} else {
			this.name = "";
			this.description = "";
			this.rows = treeToRows(defaultStarterTemplateItems());
		}
		this.render();
	}

	private async loadExisting(): Promise<void> {
		if (!this.existing) return;
		const markdown = await this.app.vault.cachedRead(this.existing);
		const { data } = splitFrontmatter(markdown);
		this.name =
			typeof data.name === "string" && data.name.trim()
				? data.name.trim()
				: this.existing.basename;
		this.description =
			typeof data.description === "string" ? data.description : "";
		const items = parseTemplateTaskItems(data.tasks);
		this.rows =
			items.length > 0
				? treeToRows(items)
				: [
						{
							title: "",
							status: defaultTaskStatusId(this.plugin.settings.taskStatuses),
							priority: "none",
							estimateHours: "",
							depth: 0,
						},
					];
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");

		contentEl.createEl("h2", {
			text: this.existing ? "Edit task list template" : "New task list template",
		});
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: "Templates are Markdown notes. Assign one to a project on create/edit, then apply to generate Tasks/ notes (with hierarchy).",
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		new Setting(contentEl)
			.setName("Name *")
			.setDesc("Becomes the note basename and the wikilink projects store.")
			.addText((text) => {
				text.inputEl.addClass("pe-touch-target");
				text.setValue(this.name).onChange((value) => {
					this.name = value;
				});
			});

		new Setting(contentEl)
			.setName("Description")
			.addTextArea((area) => {
				area.inputEl.addClass("pe-touch-target");
				area.inputEl.rows = 2;
				area.setValue(this.description).onChange((value) => {
					this.description = value;
				});
			});

		contentEl.createEl("h3", { text: "Tasks" });
		contentEl.createEl("p", {
			cls: "pe-help",
			text: "Indent creates subtasks. Empty titles are ignored on save.",
		});

		this.listEl = contentEl.createDiv({ cls: "pe-template-task-list" });
		this.renderRows();

		const addRow = contentEl.createDiv({ cls: "pe-actions" });
		const addBtn = addRow.createEl("button", {
			text: "Add task",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		addBtn.addEventListener("click", () => {
			this.rows.push({
				title: "",
				status: defaultTaskStatusId(this.plugin.settings.taskStatuses),
				priority: "none",
				estimateHours: "",
				depth: 0,
			});
			this.renderRows();
		});

		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
		const save = actions.createEl("button", {
			text: this.existing ? "Save template" : "Create template",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		save.addEventListener("click", () => {
			void this.submit();
		});
	}

	private renderRows(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		const statuses = this.plugin.settings.taskStatuses.filter((s) => !s.archived);

		this.rows.forEach((row, index) => {
			const wrap = this.listEl!.createDiv({ cls: "pe-template-task-row" });
			wrap.style.marginLeft = `${row.depth * 16}px`;

			const title = wrap.createEl("input", {
				cls: "pe-input pe-touch-target",
				attr: {
					type: "text",
					placeholder: "Task title",
					"aria-label": `Task ${index + 1} title`,
				},
			});
			title.value = row.title;
			title.addEventListener("input", () => {
				row.title = title.value;
			});

			const meta = wrap.createDiv({ cls: "pe-inline-row" });

			const status = meta.createEl("select", {
				cls: "pe-input pe-touch-target",
				attr: { "aria-label": "Status" },
			});
			for (const opt of statuses) {
				status.createEl("option", { text: opt.label, attr: { value: opt.id } });
			}
			if (!statuses.some((s) => s.id === row.status) && row.status) {
				status.createEl("option", { text: row.status, attr: { value: row.status } });
			}
			status.value = row.status || defaultTaskStatusId(this.plugin.settings.taskStatuses);
			status.addEventListener("change", () => {
				row.status = status.value;
			});

			const priority = meta.createEl("select", {
				cls: "pe-input pe-touch-target",
				attr: { "aria-label": "Priority" },
			});
			for (const p of PRIORITIES) {
				priority.createEl("option", {
					text: p === "none" ? "Priority" : p,
					attr: { value: p },
				});
			}
			priority.value = row.priority;
			priority.addEventListener("change", () => {
				row.priority = priority.value as TaskPriority;
			});

			const hours = meta.createEl("input", {
				cls: "pe-input pe-touch-target",
				attr: {
					type: "number",
					min: "0",
					step: "0.25",
					placeholder: "Hours",
					"aria-label": "Estimate hours",
				},
			});
			hours.value = row.estimateHours;
			hours.addEventListener("input", () => {
				row.estimateHours = hours.value;
			});

			const indent = meta.createEl("button", {
				text: "Indent",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button", title: "Make subtask of previous sibling" },
			});
			indent.disabled = index === 0;
			indent.addEventListener("click", () => {
				const prev = this.rows[index - 1];
				if (!prev) return;
				// At most one level deeper than the previous row.
				row.depth = Math.min(row.depth + 1, prev.depth + 1);
				this.renderRows();
			});

			const outdent = meta.createEl("button", {
				text: "Outdent",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			outdent.disabled = row.depth === 0;
			outdent.addEventListener("click", () => {
				row.depth = Math.max(0, row.depth - 1);
				this.renderRows();
			});

			const remove = meta.createEl("button", {
				text: "Remove",
				cls: "pe-danger pe-touch-target",
				attr: { type: "button" },
			});
			remove.addEventListener("click", () => {
				this.rows.splice(index, 1);
				this.renderRows();
			});
		});
	}

	private showErrors(errors: string[]): void {
		if (!this.errorEl) return;
		this.errorEl.empty();
		if (errors.length === 0) {
			this.errorEl.hide();
			return;
		}
		this.errorEl.show();
		const list = this.errorEl.createEl("ul");
		for (const error of errors) {
			list.createEl("li", { text: error });
		}
	}

	private async submit(): Promise<void> {
		const name = this.name.trim();
		const errors: string[] = [];
		if (!name) {
			errors.push("Name is required");
		}
		const tree = rowsToTree(this.rows);
		if (countTemplateTasks(tree) === 0) {
			errors.push("Add at least one task with a title");
		}
		this.showErrors(errors);
		if (errors.length > 0) {
			new Notice(errors[0] ?? "Fix the form");
			return;
		}

		try {
			await ensureTaskListTemplatesFolder(this.app.vault, this.plugin.settings);
			const path = this.existing
				? this.existing.path
				: taskListTemplateNotePath(this.plugin.settings, name);
			if (!this.existing && noteExists(this.app.vault, path)) {
				throw new Error(`A template already exists at ${path}`);
			}
			// If renaming on edit, keep path (basename rename out of scope for this modal).
			await saveTaskListTemplateNote(this.app.vault, path, {
				name: this.existing ? (sanitiseNoteBasename(name) || this.existing.basename) : name,
				description: this.description.trim() || undefined,
				tasks: tree,
			});
			this.plugin.indexer.rebuild();
			new Notice(
				this.existing
					? `Saved template “${name}”`
					: `Created template “${name}” (${countTemplateTasks(tree)} tasks)`,
			);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not save template: ${message}`);
			this.showErrors([message]);
		}
	}
}

/** Expose pe_type constant for active-file edit command. */
export { TASK_LIST_TEMPLATE_PE_TYPE };
