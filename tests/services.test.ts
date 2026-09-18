/**
 * URL validators and effort / path / fuzzy / wiki / URI pure helpers.
 */
import { describe, expect, it } from "vitest";
import {
	buildGraphLinksSection,
	buildMarkdownNote,
	peNoteTags,
	splitFrontmatter,
} from "../src/services/frontmatter";
import {
	governanceDisplayLabel,
	readProjectStages,
	SEMPLIFICATO_STATUSES,
} from "../src/services/governance";
import {
	buildProjectObsidianUri,
	parseProjectDeepLinkParams,
	PROJECTS_ENGINE_URI_ACTION,
} from "../src/services/obsidianUri";
import {
	containingProjectFolder,
	projectFolderBasename,
	projectFolderPath,
	projectNotePath,
	projectTasksFolder,
	sanitiseProjectPathSegment,
} from "../src/services/projectPaths";
import {
	computeEffortRollup,
	formatBudgetDaysAndHours,
	formatHours,
	formatHoursAndGiornate,
	giornateToHours,
	hoursToGiornate,
	normaliseHoursPerGiornata,
	parseTimeLogs,
	resolveEstimateHours,
	serialiseTimeLogs,
} from "../src/services/timeLogs";
import { isValidHttpUrl, isValidTeamsChannelUrl } from "../src/services/urls";
import { joinVaultPath, parentFolder, sanitiseNoteBasename } from "../src/services/vaultIo";
import { isWikiLink, toWikiLink, wikiLinkLabel, wikiLinkTarget, isUrgentFromPriority, priorityForUrgentState, resolveEisenhowerFlags } from "../src/models/types";
import { fuzzyScore } from "../src/views/suggest";

describe("urls", () => {
	it("validates http(s) and Teams deep links", () => {
		expect(isValidHttpUrl("https://example.com/x")).toBe(true);
		expect(isValidHttpUrl("ftp://example.com")).toBe(false);
		expect(isValidHttpUrl("not a url")).toBe(false);
		expect(
			isValidTeamsChannelUrl(
				"https://teams.microsoft.com/l/channel/19%3Aabc/General",
			),
		).toBe(true);
		expect(isValidTeamsChannelUrl("msteams://teams.microsoft.com/l/channel/x")).toBe(
			true,
		);
		expect(isValidTeamsChannelUrl("https://evil.com")).toBe(false);
		expect(isValidTeamsChannelUrl("")).toBe(false);
	});
});

describe("timeLogs / effort", () => {
	it("normalises hours-per-day and converts units", () => {
		expect(normaliseHoursPerGiornata(0)).toBe(8);
		expect(hoursToGiornate(16, 8)).toBe(2);
		expect(giornateToHours(2.5, 8)).toBe(20);
		expect(formatHours(1.5)).toBe("1.5 h");
		expect(formatHoursAndGiornate(16, 8)).toBe("16 h · 2 d");
		expect(formatBudgetDaysAndHours(5, 8)).toBe("5 d · 40 h");
	});

	it("rolls up logs and resolves legacy estimate_mandays", () => {
		const rollup = computeEffortRollup(
			8,
			[
				{ date: "2026-01-01", duration: 3, member: "[[A]]", note: "" },
				{ date: "2026-01-02", duration: 6, member: "[[A]]", note: "x" },
			],
			8,
		);
		expect(rollup.actualHours).toBe(9);
		expect(rollup.remainingHours).toBe(0);
		expect(rollup.overrunHours).toBe(1);
		expect(rollup.totalHours).toBe(9);

		expect(resolveEstimateHours({ estimate_hours: 4 }, 8)).toBe(4);
		expect(resolveEstimateHours({ estimate_mandays: 2 }, 8)).toBe(16);
		expect(parseTimeLogs([{ date: "2026-01-01", duration: "1.5", member: "M" }])).toEqual([
			{ date: "2026-01-01", duration: 1.5, member: "M", note: "" },
		]);
		expect(parseTimeLogs("nope")).toEqual([]);
		expect(
			serialiseTimeLogs([{ date: "2026-01-01", duration: 1, member: "M", note: "n" }]),
		).toEqual([{ date: "2026-01-01", duration: 1, member: "M", note: "n" }]);
	});
});

describe("paths", () => {
	it("joins, sanitises, and builds project containment paths", () => {
		expect(joinVaultPath("Projects", "A", "B.md")).toBe("Projects/A/B.md");
		expect(parentFolder("Projects/A/B.md")).toBe("Projects/A");
		expect(sanitiseNoteBasename('Bad:Name*')).toBe("Bad-Name-");
		expect(sanitiseProjectPathSegment("Cloud / Migration")).toBe("Cloud - Migration");
		expect(projectFolderBasename("PRJ-2026-001", "Cloud Migration")).toBe(
			"PRJ - 2026 - 001 - Cloud Migration",
		);
		expect(projectFolderPath("Projects", "PRJ-1", "Name")).toBe(
			"Projects/PRJ - 1 - Name",
		);
		expect(projectNotePath("Projects", "PRJ-1", "Name")).toBe(
			"Projects/PRJ - 1 - Name/PRJ - 1 - Name.md",
		);
		expect(projectTasksFolder("Projects/P", { scaffoldTasksFolder: "" })).toBe(
			"Projects/P/Tasks",
		);
		expect(containingProjectFolder("Projects/P/note.md")).toBe("Projects/P");
	});
});

describe("frontmatter helpers", () => {
	it("splits / builds notes and graph link sections", () => {
		const md = buildMarkdownNote({ pe_type: "project", id: "PRJ-1" }, "# Hello");
		expect(md.startsWith("---\n")).toBe(true);
		const split = splitFrontmatter(md);
		expect(split.data.pe_type).toBe("project");
		expect(split.body).toContain("# Hello");
		expect(buildGraphLinksSection([])).toBe("");
		expect(
			buildGraphLinksSection([{ label: "Customer", wikiLink: "[[Acme]]" }]),
		).toContain("- Customer: [[Acme]]");
	});

	it("injects Obsidian tags for every pe_type note", () => {
		const project = splitFrontmatter(
			buildMarkdownNote({ pe_type: "project", id: "PRJ-2026-001" }, "# P"),
		).data;
		expect(project.tags).toEqual(
			expect.arrayContaining(["projects-engine", "project", "pe/prj-2026-001"]),
		);

		const task = splitFrontmatter(
			buildMarkdownNote(
				{ pe_type: "task", id: "T-1", project_id: "PRJ-2026-001" },
				"# T",
			),
		).data;
		expect(task.tags).toEqual(
			expect.arrayContaining(["projects-engine", "task", "pe/prj-2026-001"]),
		);

		const register = splitFrontmatter(
			buildMarkdownNote(
				{
					pe_type: "prince2-register",
					register_kind: "risk-register",
					name: "Risk",
				},
				"# R",
			),
		).data;
		expect(register.tags).toEqual(
			expect.arrayContaining([
				"projects-engine",
				"prince2-register",
				"risk-register",
			]),
		);

		expect(peNoteTags({ peType: "customer", existing: ["#custom"] })).toEqual(
			expect.arrayContaining(["custom", "projects-engine", "customer"]),
		);
		expect(buildMarkdownNote({ name: "no-type" }, "# x")).not.toContain("tags:");
	});
});

describe("governance / wiki / fuzzy / URI", () => {
	it("labels governance and parses stages", () => {
		expect(governanceDisplayLabel("Semplificato")).toBe("Simplified");
		expect(governanceDisplayLabel("PRINCE2")).toBe("PRINCE2");
		expect(SEMPLIFICATO_STATUSES).toEqual([
			"backlog",
			"in-progress",
			"review",
			"done",
		]);
		const stages = readProjectStages({
			stages: [
				{ id: "STG-2", name: "Two", sequence: 2 },
				{ id: "STG-1", name: "One", sequence: 1 },
				{ id: "", sequence: 3 },
			],
		});
		expect(stages.map((s) => s.id)).toEqual(["STG-1", "STG-2"]);
	});

	it("normalises wikilinks", () => {
		expect(toWikiLink("Acme")).toBe("[[Acme]]");
		expect(toWikiLink("[[Acme]]")).toBe("[[Acme]]");
		expect(wikiLinkTarget("[[Acme|Client]]")).toBe("Acme");
		expect(wikiLinkLabel("[[Acme|Client]]")).toBe("Client");
		expect(isWikiLink("[[X]]")).toBe(true);
		expect(isWikiLink("X")).toBe(false);
	});

	it("scores fuzzy matches", () => {
		expect(fuzzyScore("", "Kubernetes")).toBe(0);
		expect(fuzzyScore("Kubernetes", "Kubernetes")).toBe(1000);
		expect(fuzzyScore("Kube", "Kubernetes")).toBeGreaterThan(
			fuzzyScore("xxx", "Kubernetes") ?? -1,
		);
		expect(fuzzyScore("k8s", "Kubernetes")).toBeNull();
		expect(fuzzyScore("kbs", "Kubernetes")).not.toBeNull();
	});

	it("builds and parses Obsidian deep-link params", () => {
		const url = buildProjectObsidianUri(
			"Work",
			{ id: "PRJ-1", file: { path: "Projects/PRJ-1 - A/PRJ-1 - A.md" } as never },
			{ view: "workspace", mode: "gantt" },
		);
		expect(url.startsWith(`obsidian://${PROJECTS_ENGINE_URI_ACTION}?`)).toBe(true);
		expect(url).toContain("id=PRJ-1");
		expect(url).toContain("mode=gantt");

		const parsed = parseProjectDeepLinkParams({
			id: "PRJ-1",
			view: "ws",
			mode: "kanban",
		});
		expect(parsed).toEqual({
			id: "PRJ-1",
			path: undefined,
			view: "workspace",
			mode: "kanban",
		});
	});

	it("derives Eisenhower Urgent from Priority; Important from YAML only", () => {
		expect(isUrgentFromPriority("urgent")).toBe(true);
		expect(isUrgentFromPriority("high")).toBe(true);
		expect(isUrgentFromPriority("medium")).toBe(false);
		expect(isUrgentFromPriority("low")).toBe(false);
		expect(isUrgentFromPriority("none")).toBe(false);

		expect(priorityForUrgentState("low", true)).toBe("high");
		expect(priorityForUrgentState("high", false)).toBe("medium");
		expect(priorityForUrgentState("urgent", true)).toBe("urgent");
		expect(priorityForUrgentState("medium", false)).toBe("medium");

		// Explicit Important + Priority-derived Urgent (legacy YAML urgent ignored).
		expect(
			resolveEisenhowerFlags({
				important: true,
				urgent: false,
				priority: "high",
			}),
		).toEqual({ important: true, urgent: true });
		expect(
			resolveEisenhowerFlags({
				important: null,
				urgent: true,
				priority: "none",
			}),
		).toEqual({ important: false, urgent: false });
		expect(
			resolveEisenhowerFlags({
				important: true,
				priority: "urgent",
			}),
		).toEqual({ important: true, urgent: true });
	});
});
