/**
 * @file projectRows.ts
 * @purpose Shared project-row loading for Dashboard, Overview, Workspace, and editors.
 * @dependencies models/types, services/projectFlags
 * @usedBy DashboardView, ProjectOverviewView, ProjectWorkspaceView, ProjectEditor, GlobalDashboardView
 *
 * // [EXTENSIBILITY]: Add new YAML → {@link ProjectRow} fields here so every
 * // surface receives a normalised projection (no `undefined` crashes).
 */

import type { App, TFile } from "obsidian";
import type {
	GovernanceModel,
	ItsmItem,
	ProjectTeamAssignment,
	ProjectsEngineSettings,
} from "../models/types";
import { isProjectArchived } from "../services/projectArchive";
import {
	normalizeProjectBudgetFlags,
	parseItsmItems,
	parseTeamAssignments,
} from "../services/projectFlags";

/**
 * Lightweight project projection from vault frontmatter.
 *
 * Loaders always populate flags, team roles, and `itsmItems` with safe defaults
 * so legacy notes missing those keys never throw at render time.
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
	/**
	 * Team assignments with optional per-project role.
	 * Prefer this over string-only lists when rendering role badges.
	 */
	team: ProjectTeamAssignment[];
	stakeholders: string[];
	commesse: string[];
	assignedDays: number;
	actualDays: number;
	/** Non-PM: label budget as Assigned (Days). @remarks YAML `is_non_pm` */
	isNonPM: boolean;
	/**
	 * Technical intervention: T&M / no budget input.
	 * @remarks YAML `is_technical_intervention`
	 */
	isTechnicalIntervention: boolean;
	/** ITSM associations. Empty array when YAML key is missing. */
	itsmItems: ItsmItem[];
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
	/**
	 * Last project update as ISO date or date-time for portfolio display.
	 *
	 * Prefer YAML `updated` (written on project create and frontmatter patches);
	 * fall back to the project note file mtime when that field is missing.
	 */
	updatedAt: string;
	/**
	 * Archived flag from YAML `archived` (missing → `false`).
	 * Active portfolio lists also treat notes under the archived-projects folder as archived.
	 */
	archived: boolean;
}

/**
 * Resolve the portfolio “Last Update” ISO value for a project note.
 *
 * @param frontmatterUpdated - YAML `updated` (ISO string) when present
 * @param mtimeMs - Obsidian `TFile.stat.mtime` fallback (epoch milliseconds)
 * @returns ISO date-time string, or `""` when neither source is usable
 */
export function resolveProjectLastUpdateIso(
	frontmatterUpdated: unknown,
	mtimeMs: number,
): string {
	if (typeof frontmatterUpdated === "string") {
		const trimmed = frontmatterUpdated.trim();
		if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
			return trimmed;
		}
	}
	if (Number.isFinite(mtimeMs) && mtimeMs > 0) {
		return new Date(mtimeMs).toISOString();
	}
	return "";
}

/**
 * Scan Markdown notes with `pe_type: project` into sorted {@link ProjectRow}s.
 *
 * Normalises legacy projects: missing `role`, `is_non_pm`,
 * `is_technical_intervention`, and `itsm_items` default safely.
 */
export function loadProjectRows(app: App): ProjectRow[] {
	const rows: ProjectRow[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.pe_type !== "project") {
			continue;
		}
		rows.push(projectRowFromFrontmatter(file, fm as Record<string, unknown>));
	}
	return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build one {@link ProjectRow} from cached frontmatter (shared migration path).
 */
export function projectRowFromFrontmatter(
	file: TFile,
	fm: Record<string, unknown>,
): ProjectRow {
	const flags = normalizeProjectBudgetFlags(fm);
	return {
		file,
		id: typeof fm.id === "string" ? fm.id : file.basename,
		name: typeof fm.name === "string" ? fm.name : file.basename,
		governance: fm.governance === "PRINCE2" ? "PRINCE2" : "Semplificato",
		status: typeof fm.status === "string" ? fm.status : "backlog",
		customer: typeof fm.customer === "string" ? fm.customer : "",
		projectType: typeof fm.project_type === "string" ? fm.project_type : "",
		technologies: asStringArray(fm.technologies),
		team: parseTeamAssignments(fm.team),
		stakeholders: asStringArray(fm.stakeholders),
		commesse: asStringArray(
			Array.isArray(fm.work_orders) && fm.work_orders.length
				? fm.work_orders
				: fm.commesse,
		),
		assignedDays: typeof fm.assigned_days === "number" ? fm.assigned_days : 0,
		actualDays: typeof fm.actual_days === "number" ? fm.actual_days : 0,
		isNonPM: flags.isNonPM,
		isTechnicalIntervention: flags.isTechnicalIntervention,
		itsmItems: parseItsmItems(fm.itsm_items),
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
		updatedAt: resolveProjectLastUpdateIso(fm.updated, file.stat?.mtime ?? 0),
		archived: fm.archived === true,
	};
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

/**
 * Active (non-archived) projects for portfolio / Global Dashboard lists.
 */
export function loadActiveProjectRows(
	app: App,
	settings: ProjectsEngineSettings,
): ProjectRow[] {
	return loadProjectRows(app).filter(
		(row) =>
			!isProjectArchived(
				{ archived: row.archived, filePath: row.file.path },
				settings,
			),
	);
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}
