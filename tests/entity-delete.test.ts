/**
 * Entity note delete — notice helper smoke test.
 */
import { describe, expect, it } from "vitest";
import { notifyEntityDeleted } from "../src/services/entityDelete";

describe("entityDelete", () => {
	it("emits English trash / permanent notices without throwing", () => {
		expect(() => notifyEntityDeleted("Customer", "Acme", true)).not.toThrow();
		expect(() => notifyEntityDeleted("Technology", "React", false)).not.toThrow();
	});
});
