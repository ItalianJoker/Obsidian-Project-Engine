/**
 * @file projectFlags.ts
 * @purpose Budget-mode labels, ITSM parse/serialise, and safe progress math for projects.
 * @dependencies models/types (ItsmItem, ProjectTeamAssignment)
 * @usedBy projectRows, ProjectEditor, ProjectCreationModal, DashboardView, ProjectOverviewView
 */

import type { ItsmItem, ItsmItemType, ProjectTeamAssignment } from "../models/types";
import { wikiLinkTarget } from "../models/types";

/** YAML / UI type strings for ITSM associations. */
const ITSM_TYPES: readonly ItsmItemType[] = ["Ticket", "Change", "Problem"];

/**
 * Project fields that drive budget labelling and visibility.
 */
export interface ProjectBudgetFlags {
	/** When true, “Budget (Days)” becomes “Assigned (Days)” in UI. */
	isNonPM: boolean;
	/**
	 * When true, hide/disable days input and show Time & Materials (No Budget).
	 * Overrides Non PM for input visibility.
	 */
	isTechnicalIntervention: boolean;
}

/**
 * Normalise legacy / missing boolean flags from YAML frontmatter.
 *
 * Missing keys default to `false` so older notes never throw on read.
 */
export function normalizeProjectBudgetFlags(frontmatter: {
	is_non_pm?: unknown;
	is_technical_intervention?: unknown;
	isNonPM?: unknown;
	isTechnicalIntervention?: unknown;
}): ProjectBudgetFlags {
	return {
		isNonPM: readBool(frontmatter.is_non_pm ?? frontmatter.isNonPM),
		isTechnicalIntervention: readBool(
			frontmatter.is_technical_intervention ?? frontmatter.isTechnicalIntervention,
		),
	};
}

/**
 * Label for the days field / column given budget mode flags.
 *
 * - Technical intervention → still uses “Assigned (Days)” in forms when shown,
 *   but portfolio surfaces prefer {@link formatProjectBudgetDisplay}.
 * - Non PM → “Assigned (Days)”
 * - Default → “Budget (Days)”
 */
export function budgetDaysFieldLabel(flags: ProjectBudgetFlags, required = false): string {
	const base = flags.isNonPM || flags.isTechnicalIntervention ? "Assigned (Days)" : "Budget (Days)";
	return required ? `${base} *` : base;
}

/**
 * Short column / metric label (no “Days” suffix).
 */
export function budgetMetricLabel(flags: ProjectBudgetFlags): string {
	if (flags.isTechnicalIntervention) {
		return "Effort";
	}
	return flags.isNonPM ? "Assigned" : "Budget";
}

/**
 * Portfolio / card display for project budget cells.
 *
 * Technical intervention always shows the fixed T&M copy (no division by zero).
 */
export function formatProjectBudgetDisplay(
	flags: ProjectBudgetFlags,
	assignedDaysFormatted: string,
): string {
	if (flags.isTechnicalIntervention) {
		return "Time & Materials (No Budget)";
	}
	return assignedDaysFormatted;
}

/**
 * Whether the days number input should be shown/enabled in create/edit forms.
 * Technical intervention overrides Non PM and hides the control.
 */
export function showBudgetDaysInput(flags: ProjectBudgetFlags): boolean {
	return !flags.isTechnicalIntervention;
}

/**
 * Safe percent of budget consumed (`actual / assigned`).
 * Returns `0` when technical intervention, assigned ≤ 0, or non-finite inputs.
 */
export function safeBudgetProgressPercent(
	actualDays: number,
	assignedDays: number,
	flags: ProjectBudgetFlags,
): number {
	if (flags.isTechnicalIntervention) {
		return 0;
	}
	if (!Number.isFinite(actualDays) || !Number.isFinite(assignedDays) || assignedDays <= 0) {
		return 0;
	}
	return Math.min(100, Math.round((actualDays / assignedDays) * 100));
}

/**
 * Parse YAML `team` into assignments with safe default `role: ""`.
 *
 * Accepts legacy string wikilink lists and `{ member, role }` objects.
 */
export function parseTeamAssignments(value: unknown): ProjectTeamAssignment[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const out: ProjectTeamAssignment[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.trim()) {
			out.push({ member: item.trim(), role: undefined });
			continue;
		}
		if (item && typeof item === "object" && !Array.isArray(item)) {
			const row = item as { member?: unknown; role?: unknown };
			const member = typeof row.member === "string" ? row.member.trim() : "";
			if (!member) continue;
			const role =
				typeof row.role === "string" && row.role.trim() ? row.role.trim() : undefined;
			out.push({ member, role });
		}
	}
	return out;
}

/**
 * Display name (wikilink target) for a team assignment.
 */
export function teamMemberDisplayName(assignment: ProjectTeamAssignment): string {
	return wikiLinkTarget(assignment.member);
}

/**
 * Parse YAML `itsm_items` into a safe array (never `undefined` at runtime).
 */
export function parseItsmItems(value: unknown): ItsmItem[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const out: ItsmItem[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const row = item as Record<string, unknown>;
		const id = typeof row.id === "string" ? row.id.trim() : "";
		const type = normalizeItsmType(row.type);
		const title = typeof row.title === "string" ? row.title.trim() : "";
		const description =
			typeof row.description === "string"
				? row.description.trim()
				: typeof row.short_description === "string"
					? row.short_description.trim()
					: "";
		if (!id && !title) continue;
		out.push({
			id: id || title,
			type,
			title: title || id,
			description,
		});
	}
	return out;
}

/**
 * Serialise ITSM items for YAML (`itsm_items`).
 */
export function serialiseItsmItems(items: ItsmItem[]): Array<Record<string, string>> {
	return items.map((item) => ({
		id: item.id,
		type: item.type,
		title: item.title,
		description: item.description,
	}));
}

/**
 * Allocate a local ITSM id when the user leaves ID blank (`ITSM-1`, …).
 */
export function nextItsmId(existing: readonly ItsmItem[]): string {
	let max = 0;
	for (const item of existing) {
		const match = /^ITSM-(\d+)$/i.exec(item.id.trim());
		if (match) {
			const n = Number.parseInt(match[1]!, 10);
			if (Number.isFinite(n) && n > max) max = n;
		}
	}
	return `ITSM-${max + 1}`;
}

function normalizeItsmType(value: unknown): ItsmItemType {
	if (typeof value === "string") {
		const trimmed = value.trim();
		for (const type of ITSM_TYPES) {
			if (type.toLowerCase() === trimmed.toLowerCase()) {
				return type;
			}
		}
	}
	return "Ticket";
}

function readBool(value: unknown): boolean {
	return value === true || value === "true" || value === 1 || value === "1";
}
