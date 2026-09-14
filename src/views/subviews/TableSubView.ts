/**
 * Nested task table SubView for a single project workspace.
 */

import type { App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import type { Task, TaskId } from "../../models/types";
import { toWikiLink } from "../../models/types";
import type { ProjectRow } from "../projectRows";
import type { SubView } from "../SubView";
import { TaskEditorModal } from "../TaskEditorModal";
import { EmptyState } from "../../ui/EmptyState";

/**
 * Props for {@link TableSubView}.
 */
export interface TableSubViewProps {
	app: App;
	plugin: ProjectsEnginePlugin;
	project: ProjectRow;
	tasks: Task[];
	filterText: string;
	container: HTMLElement;
}

/**
 * Hierarchical task list with indent, status, dates, and remaining mandays.
 */
export class TableSubView implements SubView {
	constructor(private readonly props: TableSubViewProps) {}

	public render(): void {
		const { container, tasks, project, filterText, app, plugin } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-table-subview");

		const filtered = filterTasks(tasks, filterText);
		if (filtered.length === 0) {
			new EmptyState(container)
				.setTitle(tasks.length === 0 ? "No tasks yet" : "No matching tasks")
				.setBody(
					tasks.length === 0
						? "Add a task to plan delivery for this project."
						: "Clear the search or change filters.",
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

		const table = container.createEl("table", { cls: "pe-table pe-task-table" });
		const thead = table.createEl("thead");
		const head = thead.createEl("tr");
		for (const label of ["Task", "Status", "Start", "End", "Remaining", ""]) {
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
			tr.createEl("td", { text: task.status, attr: { "data-label": "Status" } });
			tr.createEl("td", {
				text: task.startDate ?? "—",
				attr: { "data-label": "Start" },
			});
			tr.createEl("td", { text: task.endDate ?? "—", attr: { "data-label": "End" } });
			tr.createEl("td", {
				text: `${task.remainingMandays.toFixed(1)} md`,
				attr: { "data-label": "Remaining" },
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

function filterTasks(tasks: Task[], text: string): Task[] {
	const q = text.trim().toLowerCase();
	if (!q) {
		return tasks;
	}
	return tasks.filter((task) => {
		const hay = `${task.id} ${task.title} ${task.status}`.toLowerCase();
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
