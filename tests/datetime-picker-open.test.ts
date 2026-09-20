/**
 * Unit tests for native date/time picker open helper used by Lucide buttons.
 */

import { describe, expect, it, vi } from "vitest";
import { openNativePicker } from "../src/views/dateTimeInputs";

describe("openNativePicker", () => {
	it("prefers showPicker when available", () => {
		const showPicker = vi.fn();
		const focus = vi.fn();
		const click = vi.fn();
		const input = { showPicker, focus, click } as unknown as HTMLInputElement;

		openNativePicker(input);

		expect(showPicker).toHaveBeenCalledTimes(1);
		expect(focus).not.toHaveBeenCalled();
		expect(click).not.toHaveBeenCalled();
	});

	it("falls back to focus + click when showPicker throws", () => {
		const showPicker = vi.fn(() => {
			throw new Error("NotAllowedError");
		});
		const focus = vi.fn();
		const click = vi.fn();
		const input = { showPicker, focus, click } as unknown as HTMLInputElement;

		openNativePicker(input);

		expect(showPicker).toHaveBeenCalledTimes(1);
		expect(focus).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
	});

	it("falls back to focus + click when showPicker is missing", () => {
		const focus = vi.fn();
		const click = vi.fn();
		const input = { focus, click } as unknown as HTMLInputElement;

		openNativePicker(input);

		expect(focus).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
	});
});
