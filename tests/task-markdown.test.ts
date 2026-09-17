/**
 * Task Markdown includes Graph Links + Obsidian tags via buildMarkdownNote.
 */
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "../src/services/frontmatter";
import { blankTaskDraft, buildTaskMarkdown } from "../src/services/taskIo";

describe("buildTaskMarkdown", () => {
	it("writes pe tags, project_id, and ## Links for Graph View", () => {
		const draft = blankTaskDraft({
			id: "PRJ-2026-001#1",
			projectId: "PRJ-2026-001",
			projectLink: "[[PRJ - 2026 - 001 Demo]]",
			parentId: null,
			filePath: "Projects/Demo/Tasks/PRJ-2026-001#1 Ship tags.md",
			status: "backlog",
		});
		draft.title = "Ship tags";
		draft.assignee = "[[Jane]]";
		const { data, body } = splitFrontmatter(buildTaskMarkdown(draft, 8));
		expect(data.pe_type).toBe("task");
		expect(data.project).toBe("[[PRJ - 2026 - 001 Demo]]");
		expect(data.tags).toEqual(
			expect.arrayContaining(["projects-engine", "task", "pe/prj-2026-001"]),
		);
		expect(body).toContain("## Links");
		expect(body).toContain("- Project: [[PRJ - 2026 - 001 Demo]]");
		expect(body).toContain("- Assignee: [[Jane]]");
		expect(body).not.toMatch(/^Project: \[\[/m);
	});
});
