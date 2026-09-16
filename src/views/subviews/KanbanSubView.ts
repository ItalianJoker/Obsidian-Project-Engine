/**
 * Semplificato / operational Kanban SubView hosted in the project workspace.
 *
 * Drag-and-drop wiring reuses {@link wireKanbanCardDnD}; chrome follows the
 * Board mode of [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * (column-per-status) without copying branding.
 */

import { Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import type { SemplificatoStatus, Task } from "../../models/types";
import { toWikiLink } from "../../models/types";
import { formatDuePill, formatDisplayDateTime, isOverdue, effectiveDue } from "../../services/dateFormat";
import {
	SEMPLIFICATO_LABELS,
	SEMPLIFICATO_STATUSES,
} from "../../services/governance";
import { PersistStatusCommand } from "../../services/taskCommands";
import { EmptyState } from "../../ui/EmptyState";
import { wireKanbanCardDnD, wireKanbanColumnDrop } from "../kanbanDnD";
import type { ProjectRow } from "../projectRows";
import type { SubView } from "../SubView";
import { openTaskEditor } from "../TaskEditor";

export interface KanbanSubViewProps {
	app: App;
	plugin: ProjectsEnginePlugin;
	project: ProjectRow;
	tasks: Task[];
	filterText: string;
	container: HTMLElement;
	onChanged: () => void;
}

/**
 * One column per Semplificato status with DnD + compact edit affordance.
 */
export class KanbanSubView implements SubView {
	constructor(private readonly props: KanbanSubViewProps) {}

	public render(): void {
		const { container, project, tasks, filterText, plugin, onChanged } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-kanban-subview");

		const q = filterText.trim().toLowerCase();
		const projectTasks = tasks.filter((task) => {
			if (task.projectId !== project.id || task.parentId != null) {
				return false;
			}
			if (!q) return true;
			return `${task.title} ${task.status}`.toLowerCase().includes(q);
		});

		if (tasks.filter((t) => t.projectId === project.id).length === 0) {
			new EmptyState(container)
				.setTitle("Board is empty")
				.setBody("Add tasks, then drag cards between columns.")
				.setAction("+ Add task", () => {
					void openTaskEditor(plugin, {
						projectId: project.id,
						projectLink: toWikiLink(project.file.basename),
					});
				});
			return;
		}

		const board = container.createDiv({ cls: "pe-kanban" });
		const enableHtml5 = typeof window !== "undefined" && window.innerWidth >= 720;
		const isMobile = typeof window !== "undefined" && window.innerWidth < 720;
		const byId = new Map(projectTasks.map((task) => [task.id, task] as const));
		const dateFormat = plugin.settings.dateFormat;

		const onDrop = (taskId: string, toStatus: SemplificatoStatus): void => {
			const task = byId.get(taskId);
			if (!task) {
				new Notice("Task not found on this board");
				return;
			}
			if (normaliseStatus(task.status) === toStatus) {
				return;
			}
			void this.moveTaskStatus(task, toStatus).then(() => {
				onChanged();
				plugin.refreshOpenViews();
			});
		};

		for (const status of SEMPLIFICATO_STATUSES) {
			const column = board.createDiv({
				cls: `pe-kanban-column pe-kanban-column--${status}`,
			});
			wireKanbanColumnDrop(column, status, onDrop);

			const head = column.createDiv({ cls: "pe-kanban-column-head" });
			head.createEl("h4", { text: SEMPLIFICATO_LABELS[status], cls: "pe-kanban-title" });
			const inColumn = projectTasks.filter((task) => normaliseStatus(task.status) === status);
			head.createSpan({ text: String(inColumn.length), cls: "pe-kanban-count" });

			const cards = column.createDiv({ cls: "pe-kanban-cards" });
			for (const task of inColumn) {
				const card = cards.createDiv({ cls: "pe-kanban-card pe-touch-target" });

				card.createEl("div", {
					text: task.title || task.id,
					cls: "pe-kanban-card-title",
				});

				const foot = card.createDiv({ cls: "pe-kanban-card-foot" });
				const dueIso = effectiveDue(task);
				const timeFormat = plugin.settings.timeFormat;
				if (dueIso) {
					const overdue = isOverdue(dueIso);
					const pill = foot.createSpan({
						text: formatDuePill(dueIso, dateFormat, timeFormat),
						cls: `pe-due-pill${overdue ? " is-overdue" : ""}`,
					});
					pill.title = formatDisplayDateTime(dueIso, dateFormat, timeFormat);
				}
				if (task.scheduled) {
					foot.createSpan({
						text: formatDuePill(task.scheduled, dateFormat, timeFormat),
						cls: "pe-scheduled-pill",
						attr: {
							title: `Scheduled: ${formatDisplayDateTime(task.scheduled, dateFormat, timeFormat)}`,
						},
					});
				}

				const actions = card.createDiv({ cls: "pe-kanban-card-actions" });
				const edit = actions.createEl("button", {
					text: "Edit",
					cls: "pe-kanban-edit pe-secondary pe-touch-target",
					attr: { type: "button" },
				});
				edit.addEventListener("click", (event) => {
					event.stopPropagation();
					void openTaskEditor(plugin, {
						projectId: project.id,
						projectLink: toWikiLink(project.file.basename),
						existing: task,
						parentId: task.parentId,
					});
				});

				if (isMobile) {
					const select = actions.createEl("select", {
						cls: "pe-kanban-status-fallback pe-input pe-touch-target",
						attr: { "aria-label": "Move to column" },
					});
					for (const target of SEMPLIFICATO_STATUSES) {
						select.createEl("option", {
							text: SEMPLIFICATO_LABELS[target],
							attr: { value: target },
						});
					}
					select.value = status;
					select.addEventListener("change", () => {
						const next = select.value as SemplificatoStatus;
						if (next !== status) {
							void this.moveTaskStatus(task, next).then(() => {
								onChanged();
								plugin.refreshOpenViews();
							});
						}
					});
				}

				wireKanbanCardDnD(card, column, null, {
					taskId: task.id,
					fromStatus: status,
					onDrop,
					enableHtml5,
				});
			}

			if (inColumn.length === 0) {
				cards.createEl("p", { text: "Drop tasks here", cls: "pe-help pe-kanban-empty" });
			}
		}
	}

	public refresh(): void {
		this.render();
	}

	public destroy(): void {
		this.props.container.empty();
	}

	private async moveTaskStatus(task: Task, status: SemplificatoStatus): Promise<void> {
		const file = this.props.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Task file missing");
			return;
		}
		this.props.plugin.commandStack.execute(
			new PersistStatusCommand(this.props.app.vault, file, task.status, status),
		);
		new Notice(`Moved to ${SEMPLIFICATO_LABELS[status]}`);
	}
}

function normaliseStatus(status: string): SemplificatoStatus {
	if (
		status === "backlog" ||
		status === "in-progress" ||
		status === "review" ||
		status === "done"
	) {
		return status;
	}
	return "backlog";
}
