/**
 * Vitest config for Projects Engine pure-module regression tests.
 *
 * Obsidian is stubbed so engine/services can load without the real API.
 * UI / ItemView modules are out of scope for this suite.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		globals: false,
	},
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "tests/mocks/obsidian.ts"),
		},
	},
});
