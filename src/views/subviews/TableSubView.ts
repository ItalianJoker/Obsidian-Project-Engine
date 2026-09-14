/**
 * Nested task table SubView — dashboard-style columns (status, priority,
 * assignee, estimate hours) rather than a plain note dump.
 */

import type { App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import type { Task, TaskId, TaskPriority, TaskStatus } from "../../models/types";
import { toWikiLink, wikiLinkTarget } from "../../models/types";
import { formatHours, formatHoursAndGiornate } from "../../services/timeLogs";
import type { ProjectRow } from "../projectRows";
import type { SubView } from "../SubView";
import { TaskEditorModal } from "../TaskEditorModal";
import { EmptyState } from "../../ui/EmptyState";

/**
 * Workspace task filters (combinable with free-text search).
 */
export interface TaskDashboardFilters {
	text: string;
	status: "all" | TaskStatus;
	priority: "all" | TaskPriority;
}

/**
 * Props for {@link TableSubView}.
 */
export interface TableSubViewProps {
	app: App;
	plugin: ProjectsEnginePlugin;
	project: ProjectRow;
	tasks: Task[];
	filters: TaskDashboardFilters;
	container: HTMLElement;
}

/**
 * Hierarchical task dashboard with indent, status chips, priority, hours.
 */
export class TableSubView implements SubView {
	constructor(private readonly props: TableSubViewProps) {}

	public render(): void {
		const { container, tasks, project, filters, app, plugin } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-table-subview");

		const filtered = filterTasks(tasks, filters);
		if (filtered.length === 0) {
			new EmptyState(container)
				.setTitle(tasks.length === 0 ? "No tasks yet" : "No matching tasks")
				.setBody(
					tasks.length === 0
						? "Add a task to plan delivery for this project."
						: "Clear search or change status / priority filters.",
				)
				.setAction("+ add task", () => {
					new TaskEditorModal(
						app,
						plugin,
						project.id,
						toWikiLink(project.file.basename),
					).open();
				});
			return;
		}

		const hoursPer = plugin.settings.hoursPerManday;
		const table = container.createEl("table", { cls: "pe-table pe-task-table pe-task-dashboard" });
		const thead = table.createEl("thead");
		const head = thead.createEl("tr");
		for (const label of [
			"Task",
			"Status",
			"Priority",
			"Assignee",
			"Estimate",
			"Remaining",
			"Dates",
			"",
		]) {
			head.createEl("th", { text: label });
		}
		const tbody = table.createEl("tbody");
		const depthById = buildDepthMap(filtered);
		const ordered = orderTree(filtered);

		for (const task of ordered) {
			const depth = depthById.get(task.id) ?? 0;
			const tr = tbody.createEl("tr", { cls: "pe-task-row pe-touch-target" });
			const titleTd = tr.createEl("td", { attr: { "data-label": "Task" } });
			titleTd.style.paddingLeft = `${8 + depth * 16}px`;
			const titleBtn = titleTd.createEl("button", {
				text: task.title || task.id,
				cls: "pe-link-button pe-touch-target",
				attr: { type: "button" },
			});
			if (task.isMilestone || task.isStageBoundary) {
				titleTd.createSpan({
					text: task.isStageBoundary ? " · stage boundary" : " · milestone",
					cls: "pe-help",
				});
			}
			titleBtn.addEventListener("click", () => {
				new TaskEditorModal(
					app,
					plugin,
					project.id,
					toWikiLink(project.file.basename),
					task,
					task.parentId,
				).open();
			});

			const statusTd = tr.createEl("td", { attr: { "data-label": "Status" } });
			statusTd.createSpan({
				text: task.status,
				cls: `pe-status-chip pe-status-chip--task pe-status--${task.status}`,
			});

			const priorityTd = tr.createEl("td", { attr: { "data-label": "Priority" } });
			priorityTd.createSpan({
				text: task.priority === "none" ? "—" : task.priority,
				cls: `pe-priority-chip pe-priority--${task.priority}`,
			});

			tr.createEl("td", {
				text: task.assignee ? wikiLinkTarget(task.assignee) : "—",
				attr: { "data-label": "Assignee" },
			});
			tr.createEl("td", {
				text: formatHoursAndGiornate(task.estimateHours, hoursPer),
				attr: { "data-label": "Estimate" },
			});
			tr.createEl("td", {
				text: formatHours(task.remainingHours),
				attr: { "data-label": "Remaining" },
			});
			tr.createEl("td", {
				text: `${task.startDate ?? "—"} → ${task.endDate ?? "—"}`,
				attr: { "data-label": "Dates" },
			});
			const actions = tr.createEl("td", { attr: { "data-label": "Actions" } });
			const sub = actions.createEl("button", {
				text: "+ subtask",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			sub.addEventListener("click", () => {
				new TaskEditorModal(
					app,
					plugin,
					project.id,
					toWikiLink(project.file.basename),
					undefined,
					task.id,
				).open();
			});
		}
	}

	public refresh(): void {
		this.render();
	}

	public destroy(): void {
		this.props.container.empty();
	}
}

function filterTasks(tasks: Task[], filters: TaskDashboardFilters): Task[] {
	const q = filters.text.trim().toLowerCase();
	return tasks.filter((task) => {
		if (filters.status !== "all" && task.status !== filters.status) {
			return false;
		}
		if (filters.priority !== "all" && task.priority !== filters.priority) {
			return false;
		}
		if (!q) {
			return true;
		}
		const hay = `${task.id} ${task.title} ${task.status} ${task.priority} ${task.assignee ?? ""}`.toLowerCase();
		return hay.includes(q);
	});
}

function buildDepthMap(tasks: Task[]): Map<TaskId, number> {
	const byId = new Map(tasks.map((task) => [task.id, task] as const));
	const depth = new Map<TaskId, number>();
	const visit = (id: TaskId, seen: Set<TaskId>): number => {
		if (depth.has(id)) {
			return depth.get(id)!;
		}
		if (seen.has(id)) {
			return 0;
		}
		seen.add(id);
		const task = byId.get(id);
		if (!task?.parentId || !byId.has(task.parentId)) {
			depth.set(id, 0);
			return 0;
		}
		const d = visit(task.parentId, seen) + 1;
		depth.set(id, d);
		return d;
	};
	for (const task of tasks) {
		visit(task.id, new Set());
	}
	return depth;
}

function orderTree(tasks: Task[]): Task[] {
	const byParent = new Map<TaskId | null, Task[]>();
	for (const task of tasks) {
		const key = task.parentId && tasks.some((t) => t.id === task.parentId) ? task.parentId : null;
		const list = byParent.get(key) ?? [];
		list.push(task);
		byParent.set(key, list);
	}
	for (const list of byParent.values()) {
		list.sort((a, b) => a.title.localeCompare(b.title));
	}
	const out: Task[] = [];
	const walk = (parent: TaskId | null): void => {
		for (const task of byParent.get(parent) ?? []) {
			out.push(task);
			walk(task.id);
		}
	};
	walk(null);
	return out;
}
