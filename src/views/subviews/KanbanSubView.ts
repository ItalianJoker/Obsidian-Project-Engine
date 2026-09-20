/**
 * Operational Kanban SubView hosted in the project workspace.
 *
 * Columns come from Settings → Board → Task board columns (`taskStatuses`).
 * Drag-and-drop wiring reuses {@link wireKanbanCardDnD}; chrome follows the
 * Board mode of [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * without copying branding.
 *
 * Settings toggles:
 * - `kanbanShowSubtasks` — include nested tasks as cards (default: roots only)
 * - `kanbanShowDescriptionPreview` — show a short `notes` / body preview on cards
 */

import { Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import {
	activeTaskStatuses,
	defaultTaskStatusId,
	taskStatusLabel,
	type Task,
	type TaskStatusOption,
} from "../../models/types";
import { toWikiLink } from "../../models/types";
import { formatDuePill, formatDisplayDateTime, isOverdue, effectiveDue } from "../../services/dateFormat";
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
 * One column per active task status with DnD + compact edit affordance.
 */
export class KanbanSubView implements SubView {
	constructor(private readonly props: KanbanSubViewProps) {}

	public render(): void {
		const { container, project, tasks, filterText, plugin, onChanged } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-kanban-subview");

		const columns = activeTaskStatuses(plugin.settings.taskStatuses);
		const fallbackStatus = defaultTaskStatusId(plugin.settings.taskStatuses);
		const showSubtasks = plugin.settings.kanbanShowSubtasks === true;
		const showPreview = plugin.settings.kanbanShowDescriptionPreview === true;

		const q = filterText.trim().toLowerCase();
		const projectTasks = tasks.filter((task) => {
			if (task.projectId !== project.id) {
				return false;
			}
			if (!showSubtasks && task.parentId != null) {
				return false;
			}
			if (!q) return true;
			return `${task.title} ${task.status} ${task.notes ?? ""}`.toLowerCase().includes(q);
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

		if (columns.length === 0) {
			new EmptyState(container)
				.setTitle("No board columns")
				.setBody("Add or un-archive task columns in Settings → Board.")
				.setAction("Open settings", () => {
					(
						plugin.app as unknown as {
							setting?: { open: () => void; openTabById: (id: string) => void };
						}
					).setting?.open();
				});
			return;
		}

		const board = container.createDiv({ cls: "pe-kanban" });
		const enableHtml5 = typeof window !== "undefined" && window.innerWidth >= 720;
		const isMobile = typeof window !== "undefined" && window.innerWidth < 720;
		const byId = new Map(projectTasks.map((task) => [task.id, task] as const));
		const dateFormat = plugin.settings.dateFormat;

		const onDrop = (taskId: string, toStatus: string): void => {
			const task = byId.get(taskId);
			if (!task) {
				new Notice("Task not found on this board");
				return;
			}
			if (resolveColumnId(task.status, columns, fallbackStatus) === toStatus && task.status === toStatus) {
				return;
			}
			void this.moveTaskStatus(task, toStatus, columns).then(() => {
				onChanged();
				plugin.refreshOpenViews();
			});
		};

		for (const columnDef of columns) {
			const status = columnDef.id;
			const column = board.createDiv({
				cls: "pe-kanban-column",
			});
			column.style.setProperty("--pe-kanban-col-color", columnDef.color ?? "#94a3b8");
			wireKanbanColumnDrop(column, status, onDrop);

			const head = column.createDiv({ cls: "pe-kanban-column-head" });
			head.createEl("h4", {
				text: columnDef.label,
				cls: "pe-kanban-title",
			});
			const inColumn = projectTasks.filter(
				(task) => resolveColumnId(task.status, columns, fallbackStatus) === status,
			);
			head.createSpan({ text: String(inColumn.length), cls: "pe-kanban-count" });

			const cards = column.createDiv({ cls: "pe-kanban-cards" });
			for (const task of inColumn) {
				const card = cards.createDiv({ cls: "pe-kanban-card pe-touch-target" });

				card.createEl("div", {
					text: task.title || task.id,
					cls: "pe-kanban-card-title",
				});

				if (showPreview) {
					const preview = descriptionPreview(task);
					if (preview) {
						card.createEl("p", {
							text: preview,
							cls: "pe-kanban-card-preview",
						});
					}
				}

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
					for (const target of columns) {
						select.createEl("option", {
							text: target.label,
							attr: { value: target.id },
						});
					}
					select.value = status;
					select.addEventListener("change", () => {
						const next = select.value;
						if (next !== status) {
							void this.moveTaskStatus(task, next, columns).then(() => {
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

	private async moveTaskStatus(
		task: Task,
		status: string,
		columns: TaskStatusOption[],
	): Promise<void> {
		const file = this.props.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Task file missing");
			return;
		}
		const command = new PersistStatusCommand(
			this.props.app.vault,
			file,
			task.status,
			status,
		);
		this.props.plugin.commandStack.execute(command);
		await command.settled();
		new Notice(`Moved to ${taskStatusLabel(columns, status)}`);
	}
}

/**
 * Map a note’s status onto an active Board column.
 * Unknown / archived ids fall into the first (default) column for display
 * without rewriting YAML until the user moves the card.
 */
function resolveColumnId(
	status: string,
	columns: readonly TaskStatusOption[],
	fallback: string,
): string {
	if (columns.some((item) => item.id === status)) {
		return status;
	}
	return fallback;
}

/**
 * Short description preview from task notes (first non-empty line, capped).
 */
function descriptionPreview(task: Task): string {
	const raw = (task.notes ?? "").trim();
	if (!raw) {
		return "";
	}
	const line = raw.split(/\r?\n/).find((item) => item.trim().length > 0) ?? "";
	const trimmed = line.trim();
	if (trimmed.length <= 120) {
		return trimmed;
	}
	return `${trimmed.slice(0, 117)}…`;
}
