/**
 * Project ID pattern interpolation and unique allocation.
 */
import { describe, expect, it } from "vitest";
import { formatProjectId, nextAvailableProjectId } from "../src/services/projectId";

describe("formatProjectId", () => {
	const now = new Date(Date.UTC(2026, 8, 17));

	it("interpolates YYYY / YY / MM / DD / # runs", () => {
		expect(formatProjectId("PRJ-YYYY-###", 1, now)).toBe("PRJ-2026-001");
		expect(formatProjectId("P-YY-MM-DD-##", 12, now)).toBe("P-26-09-17-12");
	});

	it("floors negative counters to zero-padded width", () => {
		expect(formatProjectId("X-###", -3, now)).toBe("X-000");
	});
});

describe("nextAvailableProjectId", () => {
	const now = new Date(Date.UTC(2026, 0, 1));

	it("skips taken ids and advances the counter", () => {
		const taken = new Set(["PRJ-2026-001", "PRJ-2026-002"]);
		const result = nextAvailableProjectId(
			"PRJ-YYYY-###",
			1,
			(id) => taken.has(id),
			now,
		);
		expect(result.id).toBe("PRJ-2026-003");
		expect(result.nextCounter).toBe(4);
	});

	it("throws after maxAttempts", () => {
		expect(() =>
			nextAvailableProjectId("PRJ-###", 1, () => true, now, 3),
		).toThrow(/Unable to allocate/);
	});
});
