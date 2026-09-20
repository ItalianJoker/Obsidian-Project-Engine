/**
 * Read-only task detail modal — Overview-style detail surface for a task note.
 *
 * Clicking a task **name** (Table / Dashboard list, Board, Eisenhower, Gantt)
 * opens this view. Editing is a separate affordance (pencil / Edit button) that
 * launches {@link openTaskEditor}. Neither path opens the Markdown file in the
 * Obsidian editor.
 *
 * @packageDocumentation
 */

import { Modal, setIcon, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { Task, TaskPriority } from "../models/types";
import {
	isUrgentFromPriority,
	taskStatusLabel,
	toWikiLink,
	wikiLinkTarget,
} from "../models/types";
import {
	effectiveDue,
	formatDisplayDateTime,
} from "../services/dateFormat";
import {
	formatHours,
	formatHoursAndGiornate,
} from "../services/timeLogs";
import type { ProjectRow } from "./projectRows";
import { openTaskEditor } from "./TaskEditor";

/**
 * Arguments for {@link openTaskDetail} / {@link TaskDetailModal}.
 */
export interface OpenTaskDetailOptions {
	/** Containing project (for Edit hand-off and display context). */
	project: ProjectRow;
	/** Task whose fields are shown read-only. */
	task: Task;
	/** Optional callback after the user leaves detail and opens edit. */
	onEdit?: () => void;
}

/**
 * Open the read-only task detail modal.
 *
 * @param plugin — Active Projects Engine plugin.
 * @param options — Project + task to display.
 *
 * @remarks Does not call `openFile` / `openLinkText`. Edit is opt-in via the
 * modal footer or the pencil control on list/card titles.
 */
export function openTaskDetail(
	plugin: ProjectsEnginePlugin,
	options: OpenTaskDetailOptions,
): void {
	new TaskDetailModal(plugin.app, plugin, options).open();
}

/**
 * Modal host for a read-only task summary (all primary YAML-backed fields).
 */
export class TaskDetailModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		private readonly options: OpenTaskDetailOptions,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-task-detail-modal");
	}

	override onOpen(): void {
		const { contentEl, options, plugin } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		contentEl.addClass("pe-task-detail");

		const { task, project } = options;
		const name = task.title.trim() || task.id;
		const dateFormat = plugin.settings.dateFormat;
		const timeFormat = plugin.settings.timeFormat;
		const hoursPer = plugin.settings.hoursPerManday;
		const statuses = plugin.settings.taskStatuses;

		const header = contentEl.createDiv({ cls: "pe-task-detail-header" });
		header.createEl("h2", { text: name });
		header.createEl("p", {
			cls: "pe-modal-lead",
			text: `ID ${task.id} · Project ${project.id}`,
		});

		const grid = contentEl.createDiv({ cls: "pe-task-detail-grid" });
		this.field(grid, "Status", taskStatusLabel(statuses, task.status));
		this.field(grid, "Priority", priorityLabel(task.priority));
		this.field(
			grid,
			"Assignee",
			task.assignee ? wikiLinkTarget(task.assignee) : "—",
		);
		this.field(
			grid,
			"Start date",
			task.startDate
				? formatDisplayDateTime(task.startDate, dateFormat, timeFormat)
				: "—",
		);
		this.field(
			grid,
			"End date",
			task.endDate
				? formatDisplayDateTime(task.endDate, dateFormat, timeFormat)
				: "—",
		);
		const due = effectiveDue(task);
		this.field(
			grid,
			"Due date",
			due ? formatDisplayDateTime(due, dateFormat, timeFormat) : "—",
		);
		this.field(
			grid,
			"Scheduled",
			task.scheduled
				? formatDisplayDateTime(task.scheduled, dateFormat, timeFormat)
				: "—",
		);
		this.field(grid, "Duration", `${task.durationDays} day${task.durationDays === 1 ? "" : "s"}`);
		this.field(
			grid,
			"Estimate",
			task.estimateHours > 0
				? formatHoursAndGiornate(task.estimateHours, hoursPer)
				: "—",
		);
		this.field(
			grid,
			"Actual",
			task.actualHours > 0
				? formatHoursAndGiornate(task.actualHours, hoursPer)
				: formatHours(0),
		);
		this.field(
			grid,
			"Remaining",
			formatHoursAndGiornate(task.remainingHours, hoursPer),
		);
		this.field(grid, "Important", task.important === true ? "Yes" : task.important === false ? "No" : "—");
		this.field(
			grid,
			"Urgent (from priority)",
			isUrgentFromPriority(task.priority) ? "Yes" : "No",
		);
		this.field(grid, "Milestone", task.isMilestone ? "Yes" : "No");
		this.field(grid, "Stage boundary", task.isStageBoundary ? "Yes" : "No");
		this.field(grid, "Parent", task.parentId ?? "—");
		this.field(
			grid,
			"Subtasks",
			task.childIds.length > 0 ? task.childIds.join(", ") : "—",
		);
		this.field(
			grid,
			"Blocked by",
			task.blockedBy.length > 0 ? task.blockedBy.join(", ") : "—",
		);
		this.field(
			grid,
			"Blocking",
			task.blocking.length > 0 ? task.blocking.join(", ") : "—",
		);

		if (task.notes?.trim()) {
			const notes = contentEl.createDiv({ cls: "pe-task-detail-notes" });
			notes.createEl("h3", { text: "Notes", cls: "pe-section-title" });
			notes.createEl("p", { text: task.notes.trim(), cls: "pe-task-detail-notes-body" });
		}

		if (task.timeLogs.length > 0) {
			const logs = contentEl.createDiv({ cls: "pe-task-detail-logs" });
			logs.createEl("h3", { text: "Time logs", cls: "pe-section-title" });
			const list = logs.createEl("ul", { cls: "pe-task-detail-log-list" });
			for (const log of task.timeLogs) {
				const member = log.member ? wikiLinkTarget(log.member) : "—";
				const line = `${log.date} · ${formatHours(log.duration)} · ${member}${
					log.note?.trim() ? ` — ${log.note.trim()}` : ""
				}`;
				list.createEl("li", { text: line });
			}
		}

		const actions = contentEl.createDiv({ cls: "pe-actions pe-task-detail-actions" });
		const close = actions.createEl("button", {
			text: "Close",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		close.addEventListener("click", () => this.close());

		const edit = actions.createEl("button", {
			cls: "pe-primary pe-touch-target pe-task-detail-edit",
			attr: { type: "button" },
		});
		setIcon(edit, "pencil");
		edit.createSpan({ text: "Edit task" });
		edit.addEventListener("click", () => {
			this.close();
			void openTaskEditor(plugin, {
				projectId: project.id,
				projectLink: toWikiLink(project.file.basename),
				existing: task,
				parentId: task.parentId,
			});
			options.onEdit?.();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	/** One label + value pair in the detail grid. */
	private field(parent: HTMLElement, label: string, value: string): void {
		const cell = parent.createDiv({ cls: "pe-task-detail-field" });
		cell.createEl("span", { text: label, cls: "pe-label pe-task-detail-label" });
		cell.createEl("span", { text: value, cls: "pe-task-detail-value" });
	}
}

function priorityLabel(priority: TaskPriority): string {
	switch (priority) {
		case "none":
			return "None";
		case "low":
			return "Low";
		case "medium":
			return "Medium";
		case "high":
			return "High";
		case "urgent":
			return "Urgent";
		default:
			return priority;
	}
}
