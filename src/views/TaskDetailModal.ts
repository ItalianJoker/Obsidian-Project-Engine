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

import { Modal, setIcon, TFile, type App } from "obsidian";
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
import { loadAllTasks } from "../services/taskIo";
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
 */
export function openTaskDetail(
	plugin: ProjectsEnginePlugin,
	options: OpenTaskDetailOptions,
): void {
	new TaskDetailModal(plugin.app, plugin, options).open();
}

/**
 * Modal host for a read-only task summary standardized with Entity Card layout
 * and interactive internal links (Project, Assignee, Dependencies, Time logs).
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
		contentEl.addClass("pe-task-detail-modal-body");

		const { task, project } = options;
		const name = task.title.trim() || task.id;
		const dateFormat = plugin.settings.dateFormat;
		const timeFormat = plugin.settings.timeFormat;
		const hoursPer = plugin.settings.hoursPerManday;
		const statuses = plugin.settings.taskStatuses;

		// Card shell matching ViewEntityModal
		const card = contentEl.createDiv({ cls: "pe-entity-card pe-task-detail-card" });

		// Header: Title, Badges, Action buttons (Edit, Open note)
		const header = card.createDiv({ cls: "pe-entity-card-header" });
		const titleGroup = header.createDiv({ cls: "pe-entity-card-title-group" });
		titleGroup.createEl("h2", { text: name, cls: "pe-entity-card-title" });

		// Badges
		const statusText = taskStatusLabel(statuses, task.status);
		titleGroup.createSpan({
			cls: `pe-entity-kind-badge pe-status-badge`,
			text: statusText,
		});

		if (task.priority && task.priority !== "none") {
			titleGroup.createSpan({
				cls: `pe-entity-kind-badge pe-priority-badge`,
				text: `Priority: ${priorityLabel(task.priority)}`,
			});
		}

		if (task.isMilestone) {
			titleGroup.createSpan({
				cls: "pe-entity-kind-badge pe-milestone-badge",
				text: "Milestone",
			});
		}

		if (isUrgentFromPriority(task.priority)) {
			titleGroup.createSpan({
				cls: "pe-entity-kind-badge pe-urgent-badge",
				text: "Urgent",
			});
		}

		// Quick actions in header matching ViewEntityModal
		const actions = header.createDiv({ cls: "pe-entity-card-actions" });

		const editBtn = actions.createEl("button", {
			cls: "pe-primary pe-touch-target pe-entity-action-btn",
			attr: { type: "button", title: `Edit task ${task.id}` },
		});
		setIcon(editBtn, "pencil");
		editBtn.createSpan({ text: "Edit" });
		editBtn.addEventListener("click", () => {
			this.close();
			void openTaskEditor(plugin, {
				projectId: project.id,
				projectLink: toWikiLink(project.file.basename),
				existing: task,
				parentId: task.parentId,
			});
			options.onEdit?.();
		});

		const openNoteBtn = actions.createEl("button", {
			cls: "pe-secondary pe-touch-target pe-entity-action-btn",
			attr: { type: "button", title: `Open note for ${task.id}` },
		});
		setIcon(openNoteBtn, "file-text");
		openNoteBtn.createSpan({ text: "Open note" });
		openNoteBtn.addEventListener("click", () => {
			this.close();
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (file instanceof TFile) {
				void this.app.workspace.getLeaf(false).openFile(file);
			}
		});

		// Subtitle with Task ID & Project Link
		const lead = card.createDiv({ cls: "pe-entity-card-field full-width pe-task-meta-bar" });
		const leadChips = lead.createDiv({ cls: "pe-entity-chips" });
		leadChips.createSpan({ cls: "pe-entity-chip", text: `ID: ${task.id}` });

		const projectChip = leadChips.createSpan({
			cls: "pe-entity-chip pe-clickable-chip pe-project-chip",
			text: `Project: ${project.id} ${project.name}`,
		});
		projectChip.title = `Open project ${project.name}`;
		projectChip.addEventListener("click", () => {
			this.close();
			void this.plugin.router.openProjectLink(project.file.path);
		});

		// Grid for primary attributes
		const grid = card.createDiv({ cls: "pe-entity-card-grid" });

		// Assignee (internal link to Stakeholder note)
		const assigneeCell = grid.createDiv({ cls: "pe-entity-card-field" });
		assigneeCell.createEl("span", { text: "Assignee", cls: "pe-entity-card-label" });
		if (task.assignee) {
			const targetName = wikiLinkTarget(task.assignee);
			const chips = assigneeCell.createDiv({ cls: "pe-entity-chips" });
			const chip = chips.createSpan({
				text: targetName,
				cls: "pe-entity-chip pe-clickable-chip",
			});
			chip.title = `Open stakeholder ${targetName}`;
			chip.addEventListener("click", () => {
				this.close();
				void this.app.workspace.openLinkText(targetName, task.filePath);
			});
		} else {
			assigneeCell.createEl("span", { text: "—", cls: "pe-entity-card-value" });
		}

		// Dates
		this.renderSingleField(
			grid,
			"Start date",
			task.startDate ? formatDisplayDateTime(task.startDate, dateFormat, timeFormat) : "—",
		);
		this.renderSingleField(
			grid,
			"End date",
			task.endDate ? formatDisplayDateTime(task.endDate, dateFormat, timeFormat) : "—",
		);
		const due = effectiveDue(task);
		this.renderSingleField(
			grid,
			"Due date",
			due ? formatDisplayDateTime(due, dateFormat, timeFormat) : "—",
		);
		this.renderSingleField(
			grid,
			"Scheduled",
			task.scheduled ? formatDisplayDateTime(task.scheduled, dateFormat, timeFormat) : "—",
		);

		// Effort & Duration
		this.renderSingleField(
			grid,
			"Duration",
			`${task.durationDays} day${task.durationDays === 1 ? "" : "s"}`,
		);
		this.renderSingleField(
			grid,
			"Estimate",
			task.estimateHours > 0 ? formatHoursAndGiornate(task.estimateHours, hoursPer) : "—",
		);
		this.renderSingleField(
			grid,
			"Actual",
			task.actualHours > 0 ? formatHoursAndGiornate(task.actualHours, hoursPer) : formatHours(0),
		);
		this.renderSingleField(
			grid,
			"Remaining",
			formatHoursAndGiornate(task.remainingHours, hoursPer),
		);

		// Flags
		this.renderSingleField(
			grid,
			"Important",
			task.important === true ? "Yes" : task.important === false ? "No" : "—",
		);
		this.renderSingleField(
			grid,
			"Stage boundary",
			task.isStageBoundary ? "Yes" : "No",
		);

		// Helper to navigate to related tasks
		const openRelatedTask = async (taskId: string) => {
			const all = await loadAllTasks(this.app, plugin.settings.tasksFolder, plugin.settings.hoursPerManday);
			const target = all.find((t) => t.id === taskId);
			if (target) {
				this.close();
				openTaskDetail(plugin, { project, task: target, onEdit: options.onEdit });
			} else {
				this.close();
				void this.app.workspace.openLinkText(taskId, task.filePath);
			}
		};

		// Hierarchy & Dependencies (Internal Links as chips)
		if (task.parentId) {
			this.renderTaskChipsBlock(grid, "Parent task", [task.parentId], openRelatedTask);
		}
		if (task.childIds.length > 0) {
			this.renderTaskChipsBlock(grid, "Subtasks", task.childIds, openRelatedTask);
		}
		if (task.blockedBy.length > 0) {
			this.renderTaskChipsBlock(grid, "Blocked by", task.blockedBy, openRelatedTask);
		}
		if (task.blocking.length > 0) {
			this.renderTaskChipsBlock(grid, "Blocking", task.blocking, openRelatedTask);
		}

		// Notes
		if (task.notes?.trim()) {
			const notesBlock = card.createDiv({ cls: "pe-entity-card-field full-width pe-task-detail-notes" });
			notesBlock.createEl("span", { text: "Notes", cls: "pe-entity-card-label" });
			notesBlock.createEl("p", { text: task.notes.trim(), cls: "pe-task-detail-notes-body" });
		}

		// Time logs
		if (task.timeLogs.length > 0) {
			const logsBlock = card.createDiv({ cls: "pe-entity-card-field full-width pe-task-detail-logs" });
			logsBlock.createEl("span", {
				text: `Time logs (${task.timeLogs.length})`,
				cls: "pe-entity-card-label",
			});
			const logList = logsBlock.createDiv({ cls: "pe-task-detail-log-items" });
			for (const log of task.timeLogs) {
				const logRow = logList.createDiv({ cls: "pe-task-log-row" });
				logRow.createSpan({ text: `${log.date} · ${formatHours(log.duration)} · `, cls: "pe-log-meta" });
				if (log.member) {
					const memberName = wikiLinkTarget(log.member);
					const memberChip = logRow.createSpan({
						text: memberName,
						cls: "pe-entity-chip pe-clickable-chip pe-log-member",
					});
					memberChip.title = `Open stakeholder ${memberName}`;
					memberChip.addEventListener("click", () => {
						this.close();
						void this.app.workspace.openLinkText(memberName, task.filePath);
					});
				} else {
					logRow.createSpan({ text: "—", cls: "pe-log-meta" });
				}
				if (log.note?.trim()) {
					logRow.createSpan({ text: ` — ${log.note.trim()}`, cls: "pe-log-note" });
				}
			}
		}

		// Footer action
		const footer = contentEl.createDiv({ cls: "pe-actions pe-task-detail-actions" });
		const closeBtn = footer.createEl("button", {
			text: "Close",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		closeBtn.addEventListener("click", () => this.close());
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private renderSingleField(
		grid: HTMLElement,
		label: string,
		value: string,
		fullWidth = false,
	): void {
		const field = grid.createDiv({
			cls: `pe-entity-card-field ${fullWidth ? "full-width" : ""}`,
		});
		field.createEl("span", { text: label, cls: "pe-entity-card-label" });
		field.createEl("span", { text: value, cls: "pe-entity-card-value" });
	}

	private renderTaskChipsBlock(
		grid: HTMLElement,
		label: string,
		taskIds: string[],
		onTaskClick: (taskId: string) => void,
	): void {
		const field = grid.createDiv({ cls: "pe-entity-card-field full-width" });
		field.createEl("span", {
			text: `${label} (${taskIds.length})`,
			cls: "pe-entity-card-label",
		});
		const chips = field.createDiv({ cls: "pe-entity-chips" });
		for (const id of taskIds) {
			const chip = chips.createSpan({
				text: id,
				cls: "pe-entity-chip pe-clickable-chip",
			});
			chip.title = `Open task ${id}`;
			chip.addEventListener("click", () => onTaskClick(id));
		}
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

