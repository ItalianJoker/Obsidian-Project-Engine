/**
 * Project header title formatting and Settings field normalisation.
 */
import { describe, expect, it } from "vitest";
import {
	DEFAULT_PROJECT_HEADER_FIELDS,
	type ProjectHeaderFields,
} from "../src/models/types";
import {
	formatProjectHeaderTitle,
	normalizeProjectHeaderFields,
	PROJECT_HEADER_SEPARATOR,
} from "../src/services/projectHeaderTitle";

const sample = {
	id: "PRJ-2026-001",
	name: "Alpha Rollout",
	customer: "[[Acme Corp|Acme]]",
	projectType: "[[Transformation]]",
	technologies: ["[[Kubernetes|K8s]]", "[[TypeScript]]"],
};

describe("normalizeProjectHeaderFields", () => {
	it("returns defaults and forces name true when raw is missing", () => {
		expect(normalizeProjectHeaderFields(undefined)).toEqual({
			...DEFAULT_PROJECT_HEADER_FIELDS,
			name: true,
		});
		expect(normalizeProjectHeaderFields(null)).toEqual(DEFAULT_PROJECT_HEADER_FIELDS);
		expect(normalizeProjectHeaderFields({ name: false }).name).toBe(true);
	});

	it("preserves explicit optional toggles", () => {
		const raw: Partial<ProjectHeaderFields> = {
			customer: false,
			id: false,
			projectType: true,
			technology: true,
			name: false,
		};
		expect(normalizeProjectHeaderFields(raw)).toEqual({
			customer: false,
			id: false,
			name: true,
			projectType: true,
			technology: true,
		});
	});
});

describe("formatProjectHeaderTitle", () => {
	it("defaults to Customer - ID - Name", () => {
		expect(formatProjectHeaderTitle(sample, DEFAULT_PROJECT_HEADER_FIELDS)).toBe(
			["Acme", "PRJ-2026-001", "Alpha Rollout"].join(PROJECT_HEADER_SEPARATOR),
		);
	});

	it("skips disabled and blank segments", () => {
		expect(
			formatProjectHeaderTitle(
				{ id: "", name: "Solo", customer: "" },
				{ customer: true, id: true, name: true, projectType: false, technology: false },
			),
		).toBe("Solo");
	});

	it("always includes name even when toggle says false", () => {
		expect(
			formatProjectHeaderTitle(sample, {
				customer: false,
				id: false,
				name: false,
				projectType: false,
				technology: false,
			}),
		).toBe("Alpha Rollout");
	});

	it("appends optional type and technologies", () => {
		expect(
			formatProjectHeaderTitle(sample, {
				customer: true,
				id: true,
				name: true,
				projectType: true,
				technology: true,
			}),
		).toBe(
			["Acme", "PRJ-2026-001", "Alpha Rollout", "Transformation", "K8s, TypeScript"].join(
				PROJECT_HEADER_SEPARATOR,
			),
		);
	});

	it("falls back to Project when name is blank", () => {
		expect(
			formatProjectHeaderTitle(
				{ id: "PRJ-1", name: "  ", customer: "[[X]]" },
				DEFAULT_PROJECT_HEADER_FIELDS,
			),
		).toBe(["X", "PRJ-1", "Project"].join(PROJECT_HEADER_SEPARATOR));
	});
});
