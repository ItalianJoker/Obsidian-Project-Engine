/**
 * Unit tests for icon-picker pure helpers (filter + normalisation).
 */

import { describe, expect, it } from "vitest";
import { filterIconIds, normaliseIconId } from "../src/ui/IconPicker";

describe("normaliseIconId", () => {
	it("trims and lowercases", () => {
		expect(normaliseIconId("  Rocket  ")).toBe("rocket");
	});

	it("returns empty for blank input", () => {
		expect(normaliseIconId("   ")).toBe("");
	});
});

describe("filterIconIds", () => {
	const registry = ["rocket", "folder", "clipboard-list", "zap", "home"];

	it("surfaces suggested icons first when query is empty", () => {
		const result = filterIconIds(registry, "", ["clipboard-list", "rocket", "missing"]);
		expect(result.slice(0, 2)).toEqual(["clipboard-list", "rocket"]);
		expect(result).toContain("folder");
		expect(result).not.toContain("missing");
		expect(result.length).toBe(registry.length);
	});

	it("filters alphabetically by substring", () => {
		expect(filterIconIds(registry, "o")).toEqual(["clipboard-list", "folder", "home", "rocket"]);
		expect(filterIconIds(registry, "zap")).toEqual(["zap"]);
	});

	it("is case-insensitive", () => {
		expect(filterIconIds(registry, "HOME")).toEqual(["home"]);
	});
});
