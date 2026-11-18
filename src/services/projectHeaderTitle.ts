/**
 * @file projectHeaderTitle.ts
 * @purpose Shared project header title formatting from Settings field toggles.
 * @dependencies models/types (ProjectHeaderFields, wikiLinkLabel)
 * @usedBy ProjectChrome, ProjectOverviewView, ProjectWorkspaceView, ProjectEditView, settings
 *
 * // [EXTENSIBILITY]: Add optional header segments here and in
 * // {@link ProjectHeaderFields} / Settings toggles together.
 */

import {
	DEFAULT_PROJECT_HEADER_FIELDS,
	wikiLinkLabel,
	type ProjectHeaderFields,
} from "../models/types";

/**
 * Minimal project projection needed to build a header title.
 * Compatible with {@link import("../views/projectRows").ProjectRow}.
 */
export interface ProjectHeaderSource {
	id: string;
	name: string;
	customer?: string;
	projectType?: string;
	technologies?: readonly string[];
}

/** Joiner between enabled, non-empty header segments. */
export const PROJECT_HEADER_SEPARATOR = " - ";

/**
 * Normalise persisted / partial header-field toggles.
 * Always forces {@link ProjectHeaderFields.name} to `true`.
 */
export function normalizeProjectHeaderFields(
	raw: Partial<ProjectHeaderFields> | null | undefined,
): ProjectHeaderFields {
	const base = DEFAULT_PROJECT_HEADER_FIELDS;
	return {
		customer: typeof raw?.customer === "boolean" ? raw.customer : base.customer,
		id: typeof raw?.id === "boolean" ? raw.id : base.id,
		name: true,
		projectType:
			typeof raw?.projectType === "boolean" ? raw.projectType : base.projectType,
		technology:
			typeof raw?.technology === "boolean" ? raw.technology : base.technology,
	};
}

/**
 * Format a project header / leaf title from Settings toggles.
 *
 * Order: Customer → Project ID → Project Name → Project Type → Technology.
 * Disabled or blank segments are skipped. Name is always included (falls back
 * to `"Project"` when empty).
 *
 * @example
 * formatProjectHeaderTitle(
 *   { id: "PRJ-2026-001", name: "Alpha", customer: "[[Acme]]" },
 *   { customer: true, id: true, name: true, projectType: false, technology: false },
 * ) → `"Acme - PRJ-2026-001 - Alpha"`
 */
export function formatProjectHeaderTitle(
	project: ProjectHeaderSource,
	fields: ProjectHeaderFields | Partial<ProjectHeaderFields> | null | undefined,
): string {
	const toggles = normalizeProjectHeaderFields(fields);
	const parts: string[] = [];

	if (toggles.customer) {
		const customer = displayLink(project.customer);
		if (customer) parts.push(customer);
	}
	if (toggles.id) {
		const id = (project.id ?? "").trim();
		if (id) parts.push(id);
	}
	// Name is always required.
	const name = (project.name ?? "").trim() || "Project";
	parts.push(name);

	if (toggles.projectType) {
		const projectType = displayLink(project.projectType);
		if (projectType) parts.push(projectType);
	}
	if (toggles.technology) {
		const tech = formatTechnologies(project.technologies);
		if (tech) parts.push(tech);
	}

	return parts.join(PROJECT_HEADER_SEPARATOR);
}

function displayLink(value: string | undefined | null): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	return wikiLinkLabel(trimmed);
}

function formatTechnologies(values: readonly string[] | undefined): string {
	if (!values || values.length === 0) return "";
	const labels = values
		.map((item) => displayLink(item))
		.filter((label) => label.length > 0);
	return labels.join(", ");
}
