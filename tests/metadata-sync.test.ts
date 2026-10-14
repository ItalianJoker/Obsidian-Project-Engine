/**
 * Metadata sync normalisation (tags / pe_type / project ownership).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/models/types";
import { PE_PLUGIN_TAG, splitFrontmatter } from "../src/services/frontmatter";
import {
	configuredPluginFolders,
	inferPeTypeForProjectTreeNote,
	inferPeTypeFromPath,
	metadataSyncNotice,
	normaliseNoteMetadataContent,
	resolveProjectOwnership,
	type ProjectOwnership,
} from "../src/services/metadataSync";

const ownership: ProjectOwnership = {
	folderPath: "Projects/PRJ - Demo",
	noteBasename: "PRJ - Demo",
	projectId: "PRJ-2026-001",
	projectWikiLink: "[[PRJ - Demo]]",
};

describe("metadataSync", () => {
	it("lists configured folders including archive", () => {
		const folders = configuredPluginFolders(DEFAULT_SETTINGS);
		expect(folders).toContain("Projects");
		expect(folders).toContain("Projects_Archived");
		expect(folders).toContain("Templates");
	});

	it("infers pe_type from catalogue and project note paths", () => {
		expect(
			inferPeTypeFromPath(
				"Projects/Entities/Customers/Acme.md",
				DEFAULT_SETTINGS,
			),
		).toBe("customer");
		expect(
			inferPeTypeFromPath(
				"Projects/PRJ - Demo/PRJ - Demo.md",
				DEFAULT_SETTINGS,
			),
		).toBe("project");
		// Nested docs are NOT inferred by path alone (need ownership).
		expect(
			inferPeTypeFromPath(
				"Projects/PRJ - Demo/Documents/Moved.md",
				DEFAULT_SETTINGS,
			),
		).toBeNull();
		expect(inferPeTypeFromPath("Random/Note.md", DEFAULT_SETTINGS)).toBeNull();
	});

	it("infers pe_type for nested notes under a project tree", () => {
		expect(
			inferPeTypeForProjectTreeNote(
				"Projects/PRJ - Demo/PRJ - Demo.md",
				ownership,
				DEFAULT_SETTINGS,
			),
		).toBe("project");
		expect(
			inferPeTypeForProjectTreeNote(
				"Projects/PRJ - Demo/Tasks/Ship.md",
				ownership,
				DEFAULT_SETTINGS,
			),
		).toBe("task");
		expect(
			inferPeTypeForProjectTreeNote(
				"Projects/PRJ - Demo/Documents/Nested/Deep/Moved.md",
				ownership,
				DEFAULT_SETTINGS,
			),
		).toBe("project-document");
		expect(
			inferPeTypeForProjectTreeNote(
				"Projects/PRJ - Demo/Initiation/Brief.md",
				ownership,
				DEFAULT_SETTINGS,
			),
		).toBe("project-document");
	});

	it("resolves ownership by longest project folder prefix", () => {
		const index: ProjectOwnership[] = [
			ownership,
			{
				folderPath: "Projects/Other",
				noteBasename: "Other",
				projectId: "OTHER",
				projectWikiLink: "[[Other]]",
			},
		].sort((a, b) => b.folderPath.length - a.folderPath.length);

		expect(
			resolveProjectOwnership(
				"Projects/PRJ - Demo/Documents/Nested/Moved.md",
				index,
				DEFAULT_SETTINGS,
			)?.projectId,
		).toBe("PRJ-2026-001");
		expect(
			resolveProjectOwnership(
				"Projects/Entities/Customers/Acme.md",
				index,
				DEFAULT_SETTINGS,
			),
		).toBeNull();
	});

	it("normalises a manually moved nested note into a project-document", () => {
		const raw = `# Moved note\n\nSome body.\n`;
		const first = normaliseNoteMetadataContent(
			raw,
			"Projects/PRJ - Demo/Documents/Nested/Moved.md",
			DEFAULT_SETTINGS,
			ownership,
		);
		expect(first.changed).toBe(true);
		const { data, body } = splitFrontmatter(first.next);
		expect(data.pe_type).toBe("project-document");
		expect(data.project).toBe("[[PRJ - Demo]]");
		expect(data.project_id).toBe("PRJ-2026-001");
		expect(data.name).toBe("Moved");
		expect(data.tags).toEqual(
			expect.arrayContaining([
				PE_PLUGIN_TAG,
				"project-document",
				"pe/prj-2026-001",
			]),
		);
		expect(body).toContain("## Links");
		expect(body).toContain("[[PRJ - Demo]]");
		expect(body).toContain("Some body.");

		const second = normaliseNoteMetadataContent(
			first.next,
			"Projects/PRJ - Demo/Documents/Nested/Moved.md",
			DEFAULT_SETTINGS,
			ownership,
		);
		expect(second.changed).toBe(false);
	});

	it("preserves existing frontmatter keys while filling gaps", () => {
		const raw = `---
title: Keep me
custom_flag: true
---

# Keep me
`;
		const result = normaliseNoteMetadataContent(
			raw,
			"Projects/PRJ - Demo/Docs/Keep.md",
			DEFAULT_SETTINGS,
			ownership,
		);
		const { data } = splitFrontmatter(result.next);
		expect(data.title).toBe("Keep me");
		expect(data.custom_flag).toBe(true);
		expect(data.pe_type).toBe("project-document");
		expect(data.project).toBe("[[PRJ - Demo]]");
	});

	it("normalises nested Tasks notes as tasks with project binding", () => {
		const raw = `# Ship it\n`;
		const result = normaliseNoteMetadataContent(
			raw,
			"Projects/PRJ - Demo/Tasks/Ship it.md",
			DEFAULT_SETTINGS,
			ownership,
		);
		const { data } = splitFrontmatter(result.next);
		expect(data.pe_type).toBe("task");
		expect(data.project).toBe("[[PRJ - Demo]]");
		expect(data.project_id).toBe("PRJ-2026-001");
		expect(data.title).toBe("Ship it");
		expect(data.tags).toEqual(
			expect.arrayContaining([PE_PLUGIN_TAG, "task", "pe/prj-2026-001"]),
		);
	});

	it("injects pe tags when missing and is idempotent on second pass", () => {
		const raw = `---
pe_type: task
id: PRJ-1#T-1
title: Hello
project: "[[Demo]]"
project_id: PRJ-1
---

# Hello
`;
		const first = normaliseNoteMetadataContent(
			raw,
			"Projects/Demo/Tasks/Hello.md",
			DEFAULT_SETTINGS,
		);
		expect(first.changed).toBe(true);
		const { data } = splitFrontmatter(first.next);
		expect(data.tags).toEqual(
			expect.arrayContaining([PE_PLUGIN_TAG, "task", "pe/prj-1"]),
		);

		const second = normaliseNoteMetadataContent(
			first.next,
			"Projects/Demo/Tasks/Hello.md",
			DEFAULT_SETTINGS,
		);
		expect(second.changed).toBe(false);
	});

	it("builds the completion notice with updated count", () => {
		expect(metadataSyncNotice({ checked: 12, updated: 3, skipped: 9 })).toBe(
			"Metadata synchronization complete: 12 files checked (3 updated)",
		);
	});
});
