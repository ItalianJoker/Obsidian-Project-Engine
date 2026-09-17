/**
 * Debounce trailing-edge behaviour (cancel on unload).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/engine/debounce";

describe("debounce", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("coalesces rapid calls and uses the latest args", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 250);
		debounced("a");
		debounced("b");
		debounced("c");
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(249);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("c");
	});

	it("cancel prevents a pending invocation", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 100);
		debounced();
		debounced.cancel();
		vi.advanceTimersByTime(200);
		expect(fn).not.toHaveBeenCalled();
	});
});
