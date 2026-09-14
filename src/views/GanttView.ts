/**
 * Gantt entry helpers — timeline lives inside {@link ProjectWorkspaceView} as a SubView.
 *
 * The former standalone Gantt ItemView was removed so Table / Gantt / Board share
 * one workspace leaf (obsidian-pm information architecture).
 */

import { Notice, TFile } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { loadProjectRows } from "./projectRows";

/** @deprecated Standalone Gantt leaf removed; workspace hosts the chart. */
export const GANTT_VIEW_TYPE = "projects-engine-workspace";

/**
 * Open the delivery workspace in Gantt mode for the active project note,
 * or the first project in the vault if the active file is not a project.
 */
export async function activateGanttView(plugin: ProjectsEnginePlugin): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	const rows = loadProjectRows(plugin.app);
	let path: string | null = null;

	if (file instanceof TFile) {
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.pe_type === "project") {
			path = file.path;
		} else if (typeof fm?.project_id === "string" || typeof fm?.projectId === "string") {
			const id = (fm.project_id ?? fm.projectId) as string;
			path = rows.find((row) => row.id === id)?.file.path ?? null;
		} else if (fm?.pe_type === "task" && typeof fm.id === "string") {
			const projectId = typeof fm.project_id === "string" ? fm.project_id : null;
			path = projectId ? rows.find((row) => row.id === projectId)?.file.path ?? null : null;
		}
	}

	if (!path && rows.length > 0) {
		path = rows[0]!.file.path;
	}

	if (!path) {
		new Notice("Create a project first, then open Gantt from its workspace.");
		await plugin.router.openDashboard();
		return;
	}

	await plugin.router.openWorkspace(path, undefined, "gantt");
}

/**
 * Placeholder class removed — use {@link ProjectWorkspaceView} with mode `gantt`.
 * Exported only to avoid broken deep imports during migration.
 */
export class GanttView {
	constructor() {
		throw new Error(
			"Standalone GanttView was replaced by ProjectWorkspaceView SubViews. Use activateGanttView().",
		);
	}
}
