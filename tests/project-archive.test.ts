/**
 * Archive / unarchive destination uniqueness and archived-path detection.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/models/types";
import {
	archivedProjectsFolderPath,
	isProjectArchived,
	projectsFolderPath,
	uniqueArchiveDestination,
	uniqueFolderDestination,
} from "../src/services/projectArchive";
import { normalizeVaultFolder, pathUnderFolder } from "../src/services/folderPaths";

describe("folderPaths", () => {
	it("normalises vault folders", () => {
		expect(normalizeVaultFolder("  Projects\\Foo/  ", "Projects")).toBe("Projects/Foo");
		expect(normalizeVaultFolder("", "Projects_Archived")).toBe("Projects_Archived");
		expect(pathUnderFolder("Projects_Archived/A/B.md", "Projects_Archived")).toBe(true);
		expect(pathUnderFolder("Projects/A.md", "Projects_Archived")).toBe(false);
	});
});

describe("projectArchive helpers", () => {
	it("resolves default folder settings", () => {
		expect(projectsFolderPath(DEFAULT_SETTINGS)).toBe("Projects");
		expect(archivedProjectsFolderPath(DEFAULT_SETTINGS)).toBe("Projects_Archived");
	});

	it("treats YAML flag or archive path as archived", () => {
		const settings = { ...DEFAULT_SETTINGS };
		expect(
			isProjectArchived(
				{ archived: true, filePath: "Projects/X/X.md" },
				settings,
			),
		).toBe(true);
		expect(
			isProjectArchived(
				{ archived: false, filePath: "Projects_Archived/X/X.md" },
				settings,
			),
		).toBe(true);
		expect(
			isProjectArchived(
				{ archived: false, filePath: "Projects/X/X.md" },
				settings,
			),
		).toBe(false);
	});

	it("avoids destination collisions", () => {
		const occupied = new Set(["Projects_Archived/Demo", "Projects_Archived/Demo (2)"]);
		const vault = {
			getAbstractFileByPath: (path: string) => (occupied.has(path) ? {} : null),
		};
		expect(uniqueArchiveDestination(vault, "Projects_Archived", "Demo")).toBe(
			"Projects_Archived/Demo (3)",
		);
		expect(uniqueArchiveDestination(vault, "Projects_Archived", "Fresh")).toBe(
			"Projects_Archived/Fresh",
		);
	});

	it("picks a free unarchive destination under Projects", () => {
		const occupied = new Set(["Projects/Demo", "Projects/Demo (2)"]);
		const vault = {
			getAbstractFileByPath: (path: string) => (occupied.has(path) ? {} : null),
		};
		expect(uniqueFolderDestination(vault, "Projects", "Demo")).toBe("Projects/Demo (3)");
		expect(uniqueFolderDestination(vault, "Projects", "Fresh")).toBe("Projects/Fresh");
	});
});
