/**
 * Eisenhower matrix SubView — four quadrants of Important × Urgent.
 *
 * Quadrants (default English labels; customisable in Settings → Eisenhower):
 * 1. Important + Urgent
 * 2. Important + Not urgent
 * 3. Not important + Urgent
 * 4. Not important + Not urgent
 *
 * Task notes store an explicit `important` boolean. **Urgent** is derived from
 * Priority (`high` | `urgent` → Urgent; otherwise Not urgent) — no YAML `urgent`.
 * Legacy `urgent` keys are ignored for placement. Dragging between quadrants
 * updates Important and may adjust Priority via {@link PersistEisenhowerCommand}.
 */

import { Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import {
	priorityForUrgentState,
	resolveEisenhowerFlags,
	toWikiLink,
	type EisenhowerQuadrantId,
	type EisenhowerQuadrantLabels,
	type Task,
} from "../../models/types";
import { formatDuePill, formatDisplayDateTime, isOverdue, effectiveDue } from "../../services/dateFormat";
import { PersistEisenhowerCommand } from "../../services/taskCommands";
import { EmptyState } from "../../ui/EmptyState";
import type { ProjectRow } from "../projectRows";
import type { SubView } from "../SubView";
import { openTaskEditor } from "../TaskEditor";
import { mountTaskTitleControls } from "../taskTitleControls";

export type { EisenhowerQuadrantId };

interface EisenhowerQuadrant {
	id: EisenhowerQuadrantId;
	title: string;
	subtitle: string;
	important: boolean;
	urgent: boolean;
}

const QUADRANT_FLAGS: {
	id: EisenhowerQuadrantId;
	important: boolean;
	urgent: boolean;
}[] = [
	{ id: "iu", important: true, urgent: true },
	{ id: "inu", important: true, urgent: false },
	{ id: "niu", important: false, urgent: true },
	{ id: "ninu", important: false, urgent: false },
];

/**
 * Build the four matrix cells from Settings labels.
 */
export function buildEisenhowerQuadrants(
	labels: EisenhowerQuadrantLabels,
): EisenhowerQuadrant[] {
	return QUADRANT_FLAGS.map((flags) => {
		const label = labels[flags.id];
		return {
			id: flags.id,
			title: label.title,
			subtitle: label.subtitle,
			important: flags.important,
			urgent: flags.urgent,
		};
	});
}

const DRAG_MIME = "application/x-projects-engine-eisenhower";

export interface EisenhowerSubViewProps {
	app: App;
	plugin: ProjectsEnginePlugin;
	project: ProjectRow;
	tasks: Task[];
	filterText: string;
	container: HTMLElement;
	onChanged: () => void;
}

/**
 * 2×2 matrix with HTML5 + pointer DnD between quadrants.
 */
export class EisenhowerSubView implements SubView {
	constructor(private readonly props: EisenhowerSubViewProps) {}

	public render(): void {
		const { container, project, tasks, filterText, plugin, onChanged } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-eisenhower-subview");

		const q = filterText.trim().toLowerCase();
		const projectTasks = tasks.filter((task) => {
			if (task.projectId !== project.id || task.parentId != null) {
				return false;
			}
			if (!q) return true;
			return `${task.title} ${task.priority}`.toLowerCase().includes(q);
		});

		if (tasks.filter((t) => t.projectId === project.id).length === 0) {
			new EmptyState(container)
				.setTitle("Eisenhower matrix is empty")
				.setBody("Add tasks, then drag cards between quadrants.")
				.setAction("+ Add task", () => {
					void openTaskEditor(plugin, {
						projectId: project.id,
						projectLink: toWikiLink(project.file.basename),
					});
				});
			return;
		}

		const quadrants = buildEisenhowerQuadrants(plugin.settings.eisenhowerLabels);
		const matrix = container.createDiv({ cls: "pe-eisenhower" });
		const byId = new Map(projectTasks.map((task) => [task.id, task] as const));
		const enableHtml5 = typeof window !== "undefined" && window.innerWidth >= 720;
		const dateFormat = plugin.settings.dateFormat;
		const timeFormat = plugin.settings.timeFormat;

		const onDrop = (taskId: string, quadrantId: EisenhowerQuadrantId): void => {
			const task = byId.get(taskId);
			const quadrant = quadrants.find((item) => item.id === quadrantId);
			if (!task || !quadrant) {
				new Notice("Task not found on this matrix");
				return;
			}
			const current = resolveEisenhowerFlags(task);
			if (current.important === quadrant.important && current.urgent === quadrant.urgent) {
				// Still persist if Important was unset, so placement becomes explicit.
				if (task.important != null) {
					return;
				}
			}
			void this.moveTask(task, quadrant).then(() => {
				onChanged();
				plugin.refreshOpenViews();
			});
		};

		for (const quadrant of quadrants) {
			const cell = matrix.createDiv({
				cls: `pe-eisenhower-quadrant pe-eisenhower-quadrant--${quadrant.id}`,
			});
			cell.dataset.quadrant = quadrant.id;
			this.wireQuadrantDrop(cell, quadrant.id, onDrop);

			const head = cell.createDiv({ cls: "pe-eisenhower-quadrant-head" });
			head.createEl("h4", { text: quadrant.title, cls: "pe-eisenhower-title" });
			head.createEl("p", { text: quadrant.subtitle, cls: "pe-eisenhower-subtitle" });
			const inQuadrant = projectTasks.filter((task) => {
				const flags = resolveEisenhowerFlags(task);
				return flags.important === quadrant.important && flags.urgent === quadrant.urgent;
			});
			head.createSpan({ text: String(inQuadrant.length), cls: "pe-eisenhower-count" });

			const cards = cell.createDiv({ cls: "pe-eisenhower-cards" });
			for (const task of inQuadrant) {
				const card = cards.createDiv({ cls: "pe-eisenhower-card pe-touch-target" });
				const titleWrap = card.createDiv({ cls: "pe-eisenhower-card-head" });
				mountTaskTitleControls(titleWrap, {
					plugin,
					project,
					task,
					titleClass: "pe-eisenhower-card-title pe-touch-target",
					titleAsButton: false,
				});

				const foot = card.createDiv({ cls: "pe-eisenhower-card-foot" });
				const dueIso = effectiveDue(task);
				if (dueIso) {
					const overdue = isOverdue(dueIso);
					const pill = foot.createSpan({
						text: formatDuePill(dueIso, dateFormat, timeFormat),
						cls: `pe-due-pill${overdue ? " is-overdue" : ""}`,
					});
					pill.title = formatDisplayDateTime(dueIso, dateFormat, timeFormat);
				}

				this.wireCardDnD(card, quadrant.id, task.id, onDrop, enableHtml5);
			}

			if (inQuadrant.length === 0) {
				cards.createEl("p", {
					text: "Drop tasks here",
					cls: "pe-help pe-eisenhower-empty",
				});
			}
		}
	}

	public refresh(): void {
		this.render();
	}

	public destroy(): void {
		this.props.container.empty();
	}

	private async moveTask(task: Task, quadrant: EisenhowerQuadrant): Promise<void> {
		const file = this.props.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Task file missing");
			return;
		}
		const nextPriority = priorityForUrgentState(task.priority, quadrant.urgent);
		this.props.plugin.commandStack.execute(
			new PersistEisenhowerCommand(
				this.props.app.vault,
				file,
				{ important: task.important, priority: task.priority },
				{ important: quadrant.important, priority: nextPriority },
			),
		);
		new Notice(`Moved to ${quadrant.title}`);
	}

	private wireQuadrantDrop(
		cell: HTMLElement,
		quadrantId: EisenhowerQuadrantId,
		onDrop: (taskId: string, quadrantId: EisenhowerQuadrantId) => void,
	): void {
		cell.addEventListener("dragover", (event) => {
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "move";
			}
			cell.addClass("is-drop-target");
		});
		cell.addEventListener("dragleave", () => cell.removeClass("is-drop-target"));
		cell.addEventListener("drop", (event) => {
			event.preventDefault();
			cell.removeClass("is-drop-target");
			const raw =
				event.dataTransfer?.getData(DRAG_MIME) ||
				event.dataTransfer?.getData("text/plain") ||
				"";
			let taskId = raw;
			try {
				const parsed = JSON.parse(raw) as { taskId?: string };
				if (parsed?.taskId) {
					taskId = parsed.taskId;
				}
			} catch {
				/* plain id */
			}
			if (taskId) {
				onDrop(taskId, quadrantId);
			}
		});
	}

	private wireCardDnD(
		card: HTMLElement,
		fromQuadrant: EisenhowerQuadrantId,
		taskId: string,
		onDrop: (taskId: string, quadrantId: EisenhowerQuadrantId) => void,
		enableHtml5: boolean,
	): void {
		if (enableHtml5) {
			card.draggable = true;
			card.addEventListener("dragstart", (event) => {
				event.dataTransfer?.setData(
					DRAG_MIME,
					JSON.stringify({ taskId, fromQuadrant }),
				);
				event.dataTransfer?.setData("text/plain", taskId);
				if (event.dataTransfer) {
					event.dataTransfer.effectAllowed = "move";
				}
				card.addClass("is-dragging");
			});
			card.addEventListener("dragend", () => {
				card.removeClass("is-dragging");
				this.props.container
					.querySelectorAll(".pe-eisenhower-quadrant.is-drop-target")
					.forEach((node) => node.removeClass("is-drop-target"));
			});
		}

		let active = false;
		let ghost: HTMLElement | null = null;
		let startX = 0;
		let startY = 0;
		let pointerId: number | null = null;

		const clearHighlights = (): void => {
			this.props.container
				.querySelectorAll(".pe-eisenhower-quadrant.is-drop-target")
				.forEach((node) => node.removeClass("is-drop-target"));
		};

		card.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.closest("button") ||
					target.closest("select") ||
					target.closest(".pe-task-title-row"))
			) {
				return;
			}
			active = true;
			pointerId = event.pointerId;
			startX = event.clientX;
			startY = event.clientY;
			card.setPointerCapture(event.pointerId);
			card.addClass("is-dragging");
		});

		card.addEventListener("pointermove", (event) => {
			if (!active || pointerId !== event.pointerId) return;
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			if (!ghost && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
				ghost = card.cloneNode(true) as HTMLElement;
				ghost.addClass("pe-eisenhower-ghost");
				ghost.style.width = `${card.offsetWidth}px`;
				document.body.appendChild(ghost);
			}
			if (ghost) {
				ghost.style.transform = `translate(${event.clientX - 20}px, ${event.clientY - 20}px)`;
			}
			clearHighlights();
			const el = document.elementFromPoint(event.clientX, event.clientY);
			const cell = el instanceof HTMLElement ? el.closest(".pe-eisenhower-quadrant") : null;
			cell?.addClass("is-drop-target");
		});

		const endPointer = (event: PointerEvent): void => {
			if (!active || pointerId !== event.pointerId) return;
			active = false;
			pointerId = null;
			card.removeClass("is-dragging");
			ghost?.remove();
			ghost = null;
			clearHighlights();
			const el = document.elementFromPoint(event.clientX, event.clientY);
			const cell = el instanceof HTMLElement ? el.closest(".pe-eisenhower-quadrant") : null;
			const toId =
				cell instanceof HTMLElement
					? (cell.dataset.quadrant as EisenhowerQuadrantId | undefined)
					: undefined;
			if (toId && toId !== fromQuadrant) {
				onDrop(taskId, toId);
			}
			try {
				card.releasePointerCapture(event.pointerId);
			} catch {
				/* already released */
			}
		};

		card.addEventListener("pointerup", endPointer);
		card.addEventListener("pointercancel", endPointer);
	}
}
