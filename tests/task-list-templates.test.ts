/**
 * Task-list template parse / flatten / Markdown builders.
 */
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "../src/services/frontmatter";
import {
	buildTaskListTemplateMarkdown,
	countTemplateTasks,
	defaultStarterTemplateItems,
	flattenTemplateTasks,
	parseTaskListTemplateNote,
	parseTemplateTaskItems,
	rowsToTree,
	serialiseTemplateTaskItems,
	treeToRows,
} from "../src/services/taskListTemplates";
import { TFile } from "obsidian";

describe("taskListTemplates", () => {
	it("parses nested YAML tasks with status, priority, and hours", () => {
		const items = parseTemplateTaskItems([
			{
				title: "Kick-off",
				status: "backlog",
				priority: "medium",
				estimate_hours: 2,
				children: [{ title: "Agenda", estimate_hours: 1 }],
			},
			{ title: "Delivery" },
		]);
		expect(items).toHaveLength(2);
		expect(items[0]?.title).toBe("Kick-off");
		expect(items[0]?.priority).toBe("medium");
		expect(items[0]?.estimateHours).toBe(2);
		expect(items[0]?.children?.[0]?.title).toBe("Agenda");
		expect(countTemplateTasks(items)).toBe(3);
	});

	it("flattens hierarchy with parent indices for id wiring", () => {
		const flat = flattenTemplateTasks(defaultStarterTemplateItems());
		expect(flat.length).toBeGreaterThan(4);
		const roots = flat.filter((n) => n.parentIndex === null);
		expect(roots.length).toBe(4);
		const firstChild = flat.find((n) => n.parentIndex === 0);
		expect(firstChild?.item.title).toMatch(/Agenda|Stakeholder/);
	});

	it("builds template Markdown with pe_type, tags, and outline", () => {
		const md = buildTaskListTemplateMarkdown({
			name: "Assessment Starter",
			description: "Lean kickoff",
			tasks: [
				{
					title: "Kick-off",
					children: [{ title: "Agenda" }],
				},
			],
		});
		const { data, body } = splitFrontmatter(md);
		expect(data.pe_type).toBe("task-list-template");
		expect(data.name).toBe("Assessment Starter");
		expect(data.tags).toEqual(
			expect.arrayContaining(["projects-engine", "task-list-template"]),
		);
		expect(Array.isArray(data.tasks)).toBe(true);
		expect(body).toContain("## Task list");
		expect(body).toContain("- Kick-off");
		expect(body).toContain("- Agenda");
	});

	it("round-trips serialise → parse", () => {
		const original = defaultStarterTemplateItems();
		const raw = serialiseTemplateTaskItems(original);
		const again = parseTemplateTaskItems(raw);
		expect(countTemplateTasks(again)).toBe(countTemplateTasks(original));
		expect(again[0]?.title).toBe(original[0]?.title);
	});

	it("parseTaskListTemplateNote rejects non-template pe_type", () => {
		const file = { path: "x.md", basename: "x" } as TFile;
		expect(parseTaskListTemplateNote(file, "---\npe_type: task\n---\n")).toBeNull();
	});

	it("treeToRows / rowsToTree preserve indent hierarchy", () => {
		const tree = [
			{
				title: "Parent",
				children: [{ title: "Child A" }, { title: "Child B" }],
			},
			{ title: "Sibling" },
		];
		const rows = treeToRows(tree);
		expect(rows.map((r) => [r.title, r.depth])).toEqual([
			["Parent", 0],
			["Child A", 1],
			["Child B", 1],
			["Sibling", 0],
		]);
		const rebuilt = rowsToTree(rows);
		expect(rebuilt).toHaveLength(2);
		expect(rebuilt[0]?.children?.map((c) => c.title)).toEqual(["Child A", "Child B"]);
	});
});
