/**
 * Metadata sync normalisation (tags / pe_type) without vault I/O.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/models/types";
import { PE_PLUGIN_TAG, splitFrontmatter } from "../src/services/frontmatter";
import {
	configuredPluginFolders,
	inferPeTypeFromPath,
	metadataSyncNotice,
	normaliseNoteMetadataContent,
} from "../src/services/metadataSync";

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
		expect(
			inferPeTypeFromPath("Random/Note.md", DEFAULT_SETTINGS),
		).toBeNull();
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

	it("builds the completion notice", () => {
		expect(metadataSyncNotice({ checked: 12, updated: 3, skipped: 9 })).toBe(
			"Metadata synchronization complete: 12 files checked",
		);
	});
});
