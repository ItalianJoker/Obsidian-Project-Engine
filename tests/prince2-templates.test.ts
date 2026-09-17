/**
 * PRINCE2 lean document / register template builders.
 */
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "../src/services/frontmatter";
import {
	PRINCE2_DOCUMENT_PE_TYPE,
	PRINCE2_REGISTERS,
	buildPidMarkdown,
	buildProjectBriefMarkdown,
	buildRegisterMarkdown,
	buildStageBoundariesGuideMarkdown,
	buildWorkPackageTemplateMarkdown,
	prince2ScaffoldRelativePaths,
} from "../src/services/prince2Templates";

describe("prince2Templates", () => {
	it("lists the nine scaffolded template paths", () => {
		expect(prince2ScaffoldRelativePaths()).toEqual([
			"Registers/Business Case.md",
			"Registers/Risk Register.md",
			"Registers/Issue & Change Log.md",
			"Registers/Quality Register.md",
			"Registers/Work Packages.md",
			"Registers/Work Package Template.md",
			"Initiation/Project Brief.md",
			"Initiation/Project Initiation Documentation.md",
			"Initiation/Stage Boundaries.md",
		]);
		expect(PRINCE2_REGISTERS).toHaveLength(5);
	});

	it("builds Business Case with usable sections and Graph links", () => {
		const md = buildRegisterMarkdown(
			"business-case",
			"Business Case",
			"[[PRJ Demo]]",
			"Demo",
		);
		const { data, body } = splitFrontmatter(md);
		expect(data.pe_type).toBe("prince2-register");
		expect(data.status).toBe("draft");
		expect(body).toContain("## Summary");
		expect(body).toContain("## Links");
		expect(body).toContain("[[PRJ Demo]]");
	});

	it("builds Initiation Project Brief and PID", () => {
		const brief = splitFrontmatter(
			buildProjectBriefMarkdown("[[P]]", "Name"),
		);
		expect(brief.data.pe_type).toBe(PRINCE2_DOCUMENT_PE_TYPE);
		expect(brief.data.document_kind).toBe("project-brief");
		expect(brief.body).toContain("## Objectives");

		const pid = splitFrontmatter(buildPidMarkdown("[[P]]", "Name"));
		expect(pid.data.document_kind).toBe("pid");
		expect(pid.body).toContain("[[Risk Register]]");
		expect(pid.body).toContain("[[Quality Register]]");
	});

	it("builds Stage Boundaries guide without creating stage spam", () => {
		const md = buildStageBoundariesGuideMarkdown("[[P]]", "Name");
		expect(md).toContain("Add stage");
		expect(md).toContain("is_stage_boundary");
		expect(md).not.toContain("pe_type: prince2-stage");
	});

	it("builds Work Package Template starter", () => {
		const { data, body } = splitFrontmatter(
			buildWorkPackageTemplateMarkdown("[[P]]", "Name"),
		);
		expect(data.pe_type).toBe("work-package");
		expect(data.id).toBe("WP-TEMPLATE");
		expect(body).toContain("## Acceptance criteria");
		expect(body).toContain("[[Work Packages]]");
	});
});
