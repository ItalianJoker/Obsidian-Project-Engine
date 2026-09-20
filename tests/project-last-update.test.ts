/**
 * Portfolio “Last Update” resolution (YAML `updated` vs project-note mtime).
 */
import { describe, expect, it } from "vitest";
import { formatDisplayDate } from "../src/services/dateFormat";
import { resolveProjectLastUpdateIso } from "../src/views/projectRows";

describe("resolveProjectLastUpdateIso", () => {
	it("prefers valid YAML updated over mtime", () => {
		const mtime = Date.UTC(2020, 0, 1);
		expect(resolveProjectLastUpdateIso("2026-09-18T10:30:00.000Z", mtime)).toBe(
			"2026-09-18T10:30:00.000Z",
		);
		expect(resolveProjectLastUpdateIso("2026-09-18", mtime)).toBe("2026-09-18");
	});

	it("falls back to project note mtime when updated is missing or invalid", () => {
		const mtime = Date.UTC(2026, 8, 20, 12, 0, 0);
		expect(resolveProjectLastUpdateIso(undefined, mtime)).toBe(new Date(mtime).toISOString());
		expect(resolveProjectLastUpdateIso("", mtime)).toBe(new Date(mtime).toISOString());
		expect(resolveProjectLastUpdateIso("not-a-date", mtime)).toBe(
			new Date(mtime).toISOString(),
		);
	});

	it("returns empty string when neither source is usable", () => {
		expect(resolveProjectLastUpdateIso(null, 0)).toBe("");
		expect(resolveProjectLastUpdateIso(undefined, Number.NaN)).toBe("");
	});

	it("formats for Settings dateFormat (default DD/MM/YYYY)", () => {
		const iso = resolveProjectLastUpdateIso("2026-09-18T15:00:00.000Z", 0);
		expect(formatDisplayDate(iso)).toBe("18/09/2026");
		expect(formatDisplayDate(iso, "YYYY-MM-DD")).toBe("2026-09-18");
	});
});
