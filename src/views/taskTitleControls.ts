/**
 * Shared task title + edit affordances for lists and cards.
 *
 * Pattern (project Overview parity):
 * - **Title click** → read-only {@link openTaskDetail} (never the Markdown editor)
 * - **Pencil** before the title → {@link openTaskEditor} (modal / task-edit leaf)
 *
 * Used by Table / Dashboard task list, Board, Eisenhower, and Gantt so every
 * clickable task name behaves the same way.
 */

import { setIcon } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { Task } from "../models/types";
import { toWikiLink } from "../models/types";
import type { ProjectRow } from "./projectRows";
import { openTaskDetail } from "./TaskDetailModal";
import { openTaskEditor } from "./TaskEditor";

/**
 * Options for {@link mountTaskTitleControls}.
 */
export interface TaskTitleControlsOptions {
	/** Plugin instance (settings, router, refresh). */
	plugin: ProjectsEnginePlugin;
	/** Containing project (id + note basename for wikilinks). */
	project: ProjectRow;
	/** Task to view or edit. */
	task: Task;
	/**
	 * Extra CSS class(es) on the title control (button or link-styled span).
	 * Defaults to `pe-task-title`.
	 */
	titleClass?: string;
	/**
	 * When true, render the title as a `<button type="button">` (table rows).
	 * When false, use a `<span role="button">` (kanban / matrix cards).
	 */
	titleAsButton?: boolean;
	/** Optional callback after the editor is opened (rarely needed). */
	onEdit?: () => void;
	/** Optional callback after the detail modal is opened. */
	onView?: () => void;
}

/**
 * Result of {@link mountTaskTitleControls}.
 */
export interface TaskTitleControlsResult {
	/** Wrapper holding pencil + title. */
	row: HTMLElement;
	/** Pencil edit control. */
	editBtn: HTMLButtonElement;
	/** Clickable title control. */
	titleEl: HTMLElement;
}

/**
 * Mount a compact row: `[pencil] [task title]`.
 *
 * @param parent — Container that receives the controls (tree cell, card head, …).
 * @param options — Task, project, and display options.
 * @returns References to the mounted elements for further styling if needed.
 *
 * @remarks
 * - Does **not** open the Obsidian Markdown leaf.
 * - Stops click propagation on the pencil so parent card DnD / row handlers
 *   do not treat the edit click as a title view or drag start.
 */
export function mountTaskTitleControls(
	parent: HTMLElement,
	options: TaskTitleControlsOptions,
): TaskTitleControlsResult {
	const {
		plugin,
		project,
		task,
		titleClass = "pe-task-title pe-link-button pe-touch-target",
		titleAsButton = true,
		onEdit,
		onView,
	} = options;

	const row = parent.createDiv({ cls: "pe-task-title-row" });
	const name = task.title.trim() || task.id;

	const editBtn = row.createEl("button", {
		cls: "pe-task-edit-icon pe-touch-target",
		attr: {
			type: "button",
			title: "Edit task",
			"aria-label": `Edit ${name}`,
		},
	});
	setIcon(editBtn, "pencil");
	editBtn.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		void openTaskEditor(plugin, {
			projectId: project.id,
			projectLink: toWikiLink(project.file.basename),
			existing: task,
			parentId: task.parentId,
		});
		onEdit?.();
	});

	const titleEl = titleAsButton
		? row.createEl("button", {
				text: name,
				cls: titleClass,
				attr: {
					type: "button",
					title: "View task details",
					"aria-label": `View ${name}`,
				},
			})
		: row.createEl("span", {
				text: name,
				cls: titleClass,
				attr: {
					role: "button",
					tabindex: "0",
					title: "View task details",
					"aria-label": `View ${name}`,
				},
			});

	const openDetail = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		openTaskDetail(plugin, {
			project,
			task,
		});
		onView?.();
	};

	titleEl.addEventListener("click", openDetail);
	titleEl.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			openDetail(event);
		}
	});

	return { row, editBtn, titleEl };
}
