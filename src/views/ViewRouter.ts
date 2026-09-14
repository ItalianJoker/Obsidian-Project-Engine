/**
 * Central navigation between Projects Engine ItemViews.
 *
 * Information-architecture pattern adapted from
 * [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) `PMViewRouter`
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 *
 * Pass an existing `leaf` to navigate in-place (Overview → Workspace → Edit);
 * omit it to open a new tab (Dashboard entry, ribbon).
 */

import { type TFile, type WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { DASHBOARD_VIEW_TYPE } from "./DashboardView";
import { OVERVIEW_VIEW_TYPE } from "./ProjectOverviewView";
import { WORKSPACE_VIEW_TYPE, type WorkspaceViewMode } from "./ProjectWorkspaceView";

/**
 * How a project link from the Dashboard lands.
 * Mirrors obsidian-pm `projectSurface`.
 */
export type ProjectSurface = "overview" | "workspace";

/**
 * Router owned by the plugin; views never call `setViewState` for cross-view hops.
 */
export class ViewRouter {
	constructor(private readonly plugin: ProjectsEnginePlugin) {}

	/**
	 * Open a view type with optional state, optionally replacing `leaf`.
	 */
	private async open(
		type: string,
		state: Record<string, unknown>,
		leaf?: WorkspaceLeaf,
	): Promise<void> {
		const ws = this.plugin.app.workspace;
		const target = leaf ?? ws.getLeaf("tab");
		await target.setViewState({ type, state, active: true });
		ws.revealLeaf(target);
	}

	/** Ribbon / command entry: project list. */
	public async openDashboard(): Promise<void> {
		const { workspace } = this.plugin.app;
		for (const existing of workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			workspace.revealLeaf(existing);
			return;
		}
		await this.open(DASHBOARD_VIEW_TYPE, {});
	}

	/**
	 * Project home (governance summary, entities, CTAs).
	 */
	public async openOverview(path: string, leaf?: WorkspaceLeaf): Promise<void> {
		await this.open(OVERVIEW_VIEW_TYPE, { filePath: path }, leaf);
	}

	/**
	 * Delivery workspace hosting Table / Gantt / Kanban SubViews.
	 */
	public async openWorkspace(
		path: string,
		leaf?: WorkspaceLeaf,
		mode?: WorkspaceViewMode,
	): Promise<void> {
		await this.open(
			WORKSPACE_VIEW_TYPE,
			{ filePath: path, mode: mode ?? this.plugin.settings.defaultView },
			leaf,
		);
	}

	/**
	 * Dashboard row click landing — respects {@link ProjectsEngineSettings.projectSurface}.
	 */
	public async openProjectLink(path: string, leaf?: WorkspaceLeaf): Promise<void> {
		if (this.plugin.settings.projectSurface === "workspace") {
			await this.openWorkspace(path, leaf);
		} else {
			await this.openOverview(path, leaf);
		}
	}

	/**
	 * Open by {@link TFile} using the surface setting.
	 */
	public async openProject(file: TFile, leaf?: WorkspaceLeaf): Promise<void> {
		await this.openProjectLink(file.path, leaf);
	}
}
