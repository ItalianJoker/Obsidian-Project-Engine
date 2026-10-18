/**
 * User-facing Notice copy for known archive / path errors.
 */
import { describe, expect, it } from "vitest";
import { userFacingErrorMessage } from "../src/services/userFacingErrors";

describe("userFacingErrorMessage", () => {
	it("maps archive destination collisions", () => {
		expect(
			userFacingErrorMessage(
				new Error("Archive destination already exists: Projects_Archived/X.md"),
			),
		).toMatch(/already exists in the archive/i);
	});

	it("maps unarchive destination collisions", () => {
		expect(
			userFacingErrorMessage(
				new Error("Unarchive destination already exists: Projects/X"),
			),
		).toMatch(/already exists under Projects/i);
	});

	it("keeps project-id-in-use text", () => {
		expect(
			userFacingErrorMessage(new Error('Project ID “PRJ-1” is already in use')),
		).toContain("already in use");
	});

	it("falls back for empty messages", () => {
		expect(userFacingErrorMessage(new Error("   "), "Fallback")).toBe("Fallback");
	});

	it("passes through unknown messages", () => {
		expect(userFacingErrorMessage(new Error("Weird vault I/O"))).toBe("Weird vault I/O");
	});
});
