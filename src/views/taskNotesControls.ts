/**
 * In-place task notes preview toggle for Table / Board / Eisenhower / Gantt.
 *
 * Shows a compact icon only when {@link Task.notes} is non-empty; expands a
 * short preview under the task line without opening the editor or detail modal.
 */

import { setIcon } from "obsidian";
import type { Task } from "../models/types";

/**
 * Mount a notes preview toggle next to task title controls.
 *
 * @param parent — Container that receives the toggle + expandable panel.
 * @param task — Task whose optional `notes` are previewed.
 * @returns The toggle button, or `null` when there are no notes.
 */
export function mountTaskNotesToggle(
	parent: HTMLElement,
	task: Task,
): HTMLButtonElement | null {
	const text = (task.notes ?? "").trim();
	if (!text) {
		return null;
	}

	const wrap = parent.createDiv({ cls: "pe-task-notes-wrap" });
	const btn = wrap.createEl("button", {
		cls: "pe-task-notes-toggle pe-touch-target",
		attr: {
			type: "button",
			title: "Show notes",
			"aria-label": `Show notes for ${task.title.trim() || task.id}`,
			"aria-expanded": "false",
		},
	});
	setIcon(btn, "file-text");

	const panel = wrap.createDiv({ cls: "pe-task-notes-preview" });
	panel.hidden = true;
	panel.createEl("p", { text, cls: "pe-task-notes-preview-body" });

	btn.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		const open = panel.hidden;
		panel.hidden = !open;
		btn.setAttr("aria-expanded", String(open));
		btn.setAttr("title", open ? "Hide notes" : "Show notes");
		btn.toggleClass("is-open", open);
	});

	return btn;
}

/**
 * True when the task has user-visible descriptive notes.
 */
export function taskHasNotes(task: Task): boolean {
	return Boolean((task.notes ?? "").trim());
}
