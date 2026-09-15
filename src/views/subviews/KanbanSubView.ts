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
 * One column per Semplificato status with DnD + button fallback.
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
				.setBody("Add tasks, then drag cards between columns (or use status buttons).")
				.setAction("+ add task", () => {
					void openTaskEditor(plugin, {
					projectId: project.id,
					projectLink: toWikiLink(project.file.basename),
				});
				});
			return;
		}

		const board = container.createDiv({ cls: "pe-kanban" });
		const enableHtml5 = typeof window !== "undefined" && window.innerWidth >= 720;
		const byId = new Map(projectTasks.map((task) => [task.id, task] as const));

		const onDrop = (taskId: string, toStatus: SemplificatoStatus): void => {
			const task = byId.get(taskId);
			if (!task) {
				new Notice("Task not found on this board");
				return;
			}
			if (normaliseStatus(task.status) === toStatus) {
				return;
			}
			void this.moveTaskStatus(task, toStatus).then(onChanged);
		};

		for (const status of SEMPLIFICATO_STATUSES) {
			const column = board.createDiv({ cls: "pe-kanban-column" });
			wireKanbanColumnDrop(column, status, onDrop);
			column.createEl("h4", { text: SEMPLIFICATO_LABELS[status], cls: "pe-kanban-title" });
			const cards = column.createDiv({ cls: "pe-kanban-cards" });
			const inColumn = projectTasks.filter((task) => normaliseStatus(task.status) === status);
			for (const task of inColumn) {
				const card = cards.createDiv({ cls: "pe-kanban-card pe-touch-target" });
				const head = card.createDiv({ cls: "pe-kanban-card-head" });
				const handle = head.createEl("button", {
					text: "⠿",
					cls: "pe-kanban-handle pe-touch-target",
					attr: {
						type: "button",
						"aria-label": "Drag to change status",
						title: "Drag to another column",
					},
				});
				head.createEl("div", {
					text: task.title || task.id,
					cls: "pe-kanban-card-title",
				});
				card.createEl("div", {
					text: `${task.remainingMandays.toFixed(1)} md left`,
					cls: "pe-help",
				});
				wireKanbanCardDnD(card, column, handle, {
					taskId: task.id,
					fromStatus: status,
					onDrop,
					enableHtml5,
				});

				const row = card.createDiv({ cls: "pe-inline-row" });
				const edit = row.createEl("button", {
					text: "Edit",
					cls: "pe-secondary pe-touch-target",
					attr: { type: "button" },
				});
				edit.addEventListener("click", () => {
					void openTaskEditor(plugin, {
					projectId: project.id,
					projectLink: toWikiLink(project.file.basename),
					existing: task,
					parentId: task.parentId,
				});
				});
				for (const target of SEMPLIFICATO_STATUSES) {
					if (target === status) continue;
					const move = row.createEl("button", {
						text: SEMPLIFICATO_LABELS[target],
						cls: "pe-secondary pe-touch-target pe-kanban-move",
						attr: { type: "button", title: `Move to ${SEMPLIFICATO_LABELS[target]}` },
					});
					move.addEventListener("click", () => {
						void this.moveTaskStatus(task, target).then(onChanged);
					});
				}
			}
			if (inColumn.length === 0) {
				cards.createEl("p", { text: "Drop tasks here", cls: "pe-help pe-kanban-empty" });
			}
		}

		const projectStatus = container.createDiv({ cls: "pe-inline-row pe-project-status-row" });
		projectStatus.createEl("span", { text: "Project status:", cls: "pe-label" });
		for (const status of SEMPLIFICATO_STATUSES) {
			const button = projectStatus.createEl("button", {
				text: SEMPLIFICATO_LABELS[status],
				cls: `pe-segment pe-touch-target${project.status === status ? " is-active" : ""}`,
				attr: { type: "button" },
			});
			button.addEventListener("click", () => {
				void this.setProjectStatus(status).then(onChanged);
			});
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

	private async setProjectStatus(status: SemplificatoStatus): Promise<void> {
		this.props.plugin.commandStack.execute(
			new PersistStatusCommand(
				this.props.app.vault,
				this.props.project.file,
				this.props.project.status,
				status,
			),
		);
		new Notice(`Project status → ${SEMPLIFICATO_LABELS[status]}`);
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
