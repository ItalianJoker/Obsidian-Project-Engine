/**
 * Shared project-row loading for Dashboard, Overview, and Workspace.
 */

import type { App, TFile } from "obsidian";
import type { GovernanceModel } from "../models/types";

/**
 * Lightweight project projection from vault frontmatter.
 */
export interface ProjectRow {
	file: TFile;
	id: string;
	name: string;
	governance: GovernanceModel;
	status: string;
	customer: string;
	projectType: string;
	technologies: string[];
	team: string[];
	stakeholders: string[];
	commesse: string[];
	assignedDays: number;
	actualDays: number;
	projectUrl: string;
	teamsChannelUrl: string;
	/** Lucide icon id (YAML `icon`). */
	icon: string;
	/** Accent colour hex (YAML `color`). */
	color: string;
	/** Optional parent project id (YAML `parent_project`). */
	parentProjectId: string | null;
	/**
	 * Optional assigned task-list template wikilink (YAML `task_list_template`).
	 * Empty string when unset.
	 */
	taskListTemplate: string;
}

/**
 * Scan Markdown notes with `pe_type: project` into sorted {@link ProjectRow}s.
 */
export function loadProjectRows(app: App): ProjectRow[] {
	const rows: ProjectRow[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.pe_type !== "project") {
			continue;
		}
		rows.push({
			file,
			id: typeof fm.id === "string" ? fm.id : file.basename,
			name: typeof fm.name === "string" ? fm.name : file.basename,
			governance: fm.governance === "PRINCE2" ? "PRINCE2" : "Semplificato",
			status: typeof fm.status === "string" ? fm.status : "backlog",
			customer: typeof fm.customer === "string" ? fm.customer : "",
			projectType: typeof fm.project_type === "string" ? fm.project_type : "",
			technologies: asStringArray(fm.technologies),
			team: asTeamNames(fm.team),
			stakeholders: asStringArray(fm.stakeholders),
			commesse: asStringArray(fm.work_orders?.length ? fm.work_orders : fm.commesse),
			assignedDays: typeof fm.assigned_days === "number" ? fm.assigned_days : 0,
			actualDays: typeof fm.actual_days === "number" ? fm.actual_days : 0,
			projectUrl: typeof fm.project_url === "string" ? fm.project_url : "",
			teamsChannelUrl: typeof fm.teams_channel_url === "string" ? fm.teams_channel_url : "",
			icon: typeof fm.icon === "string" ? fm.icon : "",
			color: typeof fm.color === "string" ? fm.color : "",
			parentProjectId:
				typeof fm.parent_project === "string" && fm.parent_project.trim()
					? fm.parent_project.trim()
					: null,
			taskListTemplate:
				typeof fm.task_list_template === "string" ? fm.task_list_template : "",
		});
	}
	return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Find a project row by id or file path.
 */
export function findProjectRow(
	rows: ProjectRow[],
	idOrPath: string,
): ProjectRow | undefined {
	return rows.find((row) => row.id === idOrPath || row.file.path === idOrPath);
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

/**
 * Team YAML may be a list of wikilinks or `{ member, role }` objects.
 */
function asTeamNames(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const names: string[] = [];
	for (const item of value) {
		if (typeof item === "string") {
			names.push(item);
		} else if (item && typeof item === "object" && !Array.isArray(item)) {
			const member = (item as { member?: unknown }).member;
			if (typeof member === "string") {
				names.push(member);
			}
		}
	}
	return names;
}
