/**
 * PRINCE2 operational register entry helpers (pure Markdown + id allocation).
 */
import { describe, expect, it } from "vitest";
import {
	OPERATIONAL_REGISTERS,
	REGISTER_ENTRY_PE_TYPE,
	asOperationalKind,
	buildOperationalRegisterIndexMarkdown,
	buildRegisterEntryMarkdown,
	countRegisterEntries,
	isOpenRegisterStatus,
	isOperationalRegisterKind,
	type RegisterEntryRow,
} from "../src/services/registerIo";
import { splitFrontmatter } from "../src/services/frontmatter";

describe("registerIo", () => {
	it("recognises the three operational register kinds", () => {
		expect(isOperationalRegisterKind("risk-register")).toBe(true);
		expect(isOperationalRegisterKind("issue-change-log")).toBe(true);
		expect(isOperationalRegisterKind("quality-register")).toBe(true);
		expect(isOperationalRegisterKind("business-case")).toBe(false);
		expect(OPERATIONAL_REGISTERS).toHaveLength(3);
	});

	it("builds lean index notes without stub table rows", () => {
		const md = buildOperationalRegisterIndexMarkdown(
			"risk-register",
			"Risk Register",
			"[[PRJ-001 Demo]]",
			"Demo",
		);
		expect(md).toContain('pe_type: "prince2-register"');
		expect(md).toContain('register_kind: "risk-register"');
		expect(md).toContain("## Links");
		expect(md).toContain("[[PRJ-001 Demo]]");
		expect(md).not.toMatch(/\| R-01 \|/);
		expect(md).not.toContain("| --- |");
	});

	it("builds Graph-linked risk entry frontmatter", () => {
		const md = buildRegisterEntryMarkdown({
			kind: "risk-register",
			id: "R-001",
			title: "Vendor delay",
			projectLink: "[[PRJ-001 Demo]]",
			date: "2026-09-17",
		});
		const { data, body } = splitFrontmatter(md);
		expect(data.pe_type).toBe(REGISTER_ENTRY_PE_TYPE);
		expect(data.register_kind).toBe("risk-register");
		expect(data.id).toBe("R-001");
		expect(data.status).toBe("open");
		expect(data.severity).toBe("medium");
		expect(data.date).toBe("2026-09-17");
		expect(data.project).toBe("[[PRJ-001 Demo]]");
		expect(body).toContain("# R-001 — Vendor delay");
		expect(body).toContain("## Links");
		expect(body).toContain("- Project: [[PRJ-001 Demo]]");
	});

	it("builds issue and quality entry defaults", () => {
		const issue = splitFrontmatter(
			buildRegisterEntryMarkdown({
				kind: "issue-change-log",
				id: "I-002",
				title: "Scope change",
				projectLink: "[[P]]",
				date: "2026-01-02",
			}),
		).data;
		expect(issue.type).toBe("issue");
		expect(issue.priority).toBe("medium");
		expect(issue.raised_on).toBe("2026-01-02");

		const quality = splitFrontmatter(
			buildRegisterEntryMarkdown({
				kind: "quality-register",
				id: "Q-003",
				title: "API review",
				projectLink: "[[P]]",
				date: "2026-01-03",
			}),
		).data;
		expect(quality.result).toBe("pending");
		expect(quality.product).toBe("API review");
		expect(quality.planned_date).toBe("2026-01-03");
	});

	it("counts open entries for widget badges", () => {
		const rows: RegisterEntryRow[] = [
			row("R-001", "risk-register", "open"),
			row("R-002", "risk-register", "closed"),
			row("I-001", "issue-change-log", "in-review"),
			row("Q-001", "quality-register", "pending"),
			row("Q-002", "quality-register", "pass"),
		];
		expect(countRegisterEntries(rows)).toEqual({ total: 5, open: 3 });
		expect(isOpenRegisterStatus("rejected", "issue-change-log")).toBe(false);
		expect(isOpenRegisterStatus("fail", "quality-register")).toBe(true);
		expect(isOpenRegisterStatus("", "risk-register")).toBe(true);
		expect(isOpenRegisterStatus("closed", "risk-register")).toBe(false);
	});

	it("narrows formal register kinds to operational ones", () => {
		expect(asOperationalKind("risk-register")).toBe("risk-register");
		expect(asOperationalKind("work-package")).toBeNull();
		expect(asOperationalKind("business-case")).toBeNull();
	});
});

function row(
	id: string,
	kind: RegisterEntryRow["kind"],
	status: string,
): RegisterEntryRow {
	return {
		id,
		title: id,
		kind,
		filePath: `${id}.md`,
		file: {} as RegisterEntryRow["file"],
		status,
		severityOrPriority: "",
		owner: "",
		date: null,
		mtime: 0,
	};
}
