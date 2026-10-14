/**
 * Budget flags, ITSM parse, and safe progress helpers.
 */
import { describe, expect, it } from "vitest";
import {
	applyNoteTemplatePlaceholders,
	normalizeTemplatesFolder,
} from "../src/services/noteTemplates";
import {
	budgetDaysFieldLabel,
	DEFAULT_PM_CREATE_ROLE,
	defaultPmCreateRole,
	formatProjectBudgetDisplay,
	normalizeProjectBudgetFlags,
	parseItsmItems,
	parseTeamAssignments,
	safeBudgetProgressPercent,
	seedDefaultPmTeam,
	showBudgetDaysInput,
	syncDefaultPmTeamRole,
} from "../src/services/projectFlags";

describe("normalizeProjectBudgetFlags", () => {
	it("defaults missing keys to false", () => {
		expect(normalizeProjectBudgetFlags({})).toEqual({
			isNonPM: false,
			isTechnicalIntervention: false,
		});
	});

	it("reads snake_case YAML booleans", () => {
		expect(
			normalizeProjectBudgetFlags({
				is_non_pm: true,
				is_technical_intervention: true,
			}),
		).toEqual({ isNonPM: true, isTechnicalIntervention: true });
	});
});

describe("budget labels", () => {
	it("uses Assigned (Days) for Non PM", () => {
		expect(
			budgetDaysFieldLabel({ isNonPM: true, isTechnicalIntervention: false }, true),
		).toBe("Assigned (Days) *");
	});

	it("hides days input for technical intervention", () => {
		expect(
			showBudgetDaysInput({ isNonPM: true, isTechnicalIntervention: true }),
		).toBe(false);
		expect(
			formatProjectBudgetDisplay(
				{ isNonPM: false, isTechnicalIntervention: true },
				"5 d · 40 h",
			),
		).toBe("Time & Materials (No Budget)");
	});

	it("guards division by zero", () => {
		expect(
			safeBudgetProgressPercent(3, 0, {
				isNonPM: false,
				isTechnicalIntervention: false,
			}),
		).toBe(0);
		expect(
			safeBudgetProgressPercent(3, 10, {
				isNonPM: false,
				isTechnicalIntervention: true,
			}),
		).toBe(0);
		expect(
			safeBudgetProgressPercent(5, 10, {
				isNonPM: false,
				isTechnicalIntervention: false,
			}),
		).toBe(50);
	});
});

describe("parseTeamAssignments / parseItsmItems", () => {
	it("keeps roles from object team rows and defaults string lists", () => {
		expect(parseTeamAssignments(["[[Ada]]", { member: "[[Bob]]", role: "PM" }])).toEqual([
			{ member: "[[Ada]]", role: undefined },
			{ member: "[[Bob]]", role: "PM" },
		]);
	});

	it("parses itsm_items safely", () => {
		expect(parseItsmItems(undefined)).toEqual([]);
		expect(
			parseItsmItems([{ id: "CHG-1", type: "change", title: "Cutover", description: "x" }]),
		).toEqual([
			{ id: "CHG-1", type: "Change", title: "Cutover", description: "x" },
		]);
	});
});

describe("defaultPmCreateRole / seedDefaultPmTeam / syncDefaultPmTeamRole", () => {
	it("uses PM when Non PM is unchecked and Settings role when checked", () => {
		expect(defaultPmCreateRole(false, "Contributor")).toBe(DEFAULT_PM_CREATE_ROLE);
		expect(defaultPmCreateRole(true, "Contributor")).toBe("Contributor");
		expect(defaultPmCreateRole(true, "  Lead  ")).toBe("Lead");
		expect(defaultPmCreateRole(true, "")).toBe("");
	});

	it("returns existing unchanged when Default PM is unset", () => {
		expect(seedDefaultPmTeam([], "")).toEqual([]);
		expect(seedDefaultPmTeam([{ name: "Ada", role: "Dev" }], "  ")).toEqual([
			{ name: "Ada", role: "Dev" },
		]);
	});

	it("prepends Default PM with role PM by default", () => {
		expect(seedDefaultPmTeam([], "[[Luca]]")).toEqual([{ name: "Luca", role: "PM" }]);
		expect(seedDefaultPmTeam([{ name: "Ada", role: "Dev" }], "Luca")).toEqual([
			{ name: "Luca", role: "PM" },
			{ name: "Ada", role: "Dev" },
		]);
	});

	it("accepts a custom seed role (Non PM create path)", () => {
		expect(seedDefaultPmTeam([], "Luca", "Contributor")).toEqual([
			{ name: "Luca", role: "Contributor" },
		]);
	});

	it("does not duplicate or overwrite an existing member on seed", () => {
		expect(seedDefaultPmTeam([{ name: "Luca", role: "Lead" }], "Luca")).toEqual([
			{ name: "Luca", role: "Lead" },
		]);
	});

	it("syncs only the Default PM member role on Non PM toggle", () => {
		const team = [
			{ name: "Luca", role: "PM" },
			{ name: "Ada", role: "Dev" },
		];
		expect(syncDefaultPmTeamRole(team, "[[Luca]]", "Contributor")).toEqual([
			{ name: "Luca", role: "Contributor" },
			{ name: "Ada", role: "Dev" },
		]);
		expect(syncDefaultPmTeamRole(team, "Luca", "PM")).toEqual([
			{ name: "Luca", role: "PM" },
			{ name: "Ada", role: "Dev" },
		]);
		expect(syncDefaultPmTeamRole(team, "", "Contributor")).toEqual(team);
		expect(syncDefaultPmTeamRole(team, "Missing", "Contributor")).toEqual(team);
	});
});

describe("note templates", () => {
	it("normalises Templates folder and replaces placeholders", () => {
		expect(normalizeTemplatesFolder(" /Templates/ ")).toBe("Templates");
		expect(
			applyNoteTemplatePlaceholders("P={{project}} T={{title}} D={{date}}", {
				project: "Alpha",
				title: "Brief",
				date: "2026-10-13",
			}),
		).toBe("P=Alpha T=Brief D=2026-10-13");
	});
});
