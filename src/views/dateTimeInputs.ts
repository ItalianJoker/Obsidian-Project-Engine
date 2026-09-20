/**
 * Task-editor date / time controls: native calendar + clock pickers synced with
 * Settings-format text fields (default DD/MM/YYYY + 24h). YAML stays ISO.
 *
 * Dashboard/Table inline cells use explicit Lucide calendar/clock buttons that
 * open the native picker (`showPicker` / click fallback) — Chromium’s
 * `::-webkit-calendar-picker-indicator` is unreliable under Obsidian themes.
 */

import { setIcon } from "obsidian";
import type { DateDisplayFormat, TimeDisplayFormat } from "../models/types";
import {
	dateFormatPlaceholder,
	formatDisplayDate,
	formatDisplayTime,
	joinDateTime,
	parseDisplayDate,
	parseDisplayTime,
	splitDateTime,
	timeFormatPlaceholder,
} from "../services/dateFormat";

export interface DateTimeFieldOptions {
	/** Field label shown above the controls. */
	label: string;
	/** Current YAML value (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`), or null. */
	value: string | null;
	dateFormat: DateDisplayFormat;
	timeFormat: TimeDisplayFormat;
	/** When true, show optional time text + native time picker. */
	includeTime: boolean;
	/** Called with the composed ISO string (or null when date cleared). */
	onChange: (value: string | null) => void;
	/** Optional help line under the label. */
	help?: string;
}

/**
 * Options for {@link mountInlineDateTime} — compact table-cell date/time editors.
 */
export interface InlineDateTimeOptions {
	/** Accessible name for the control group (e.g. `"Due date"`). */
	ariaLabel: string;
	/** Current YAML value (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`), or null. */
	value: string | null;
	dateFormat: DateDisplayFormat;
	timeFormat: TimeDisplayFormat;
	/** Fired with the composed ISO string (or null when cleared). */
	onChange: (value: string | null) => void;
}

/**
 * Mount a labelled date field with a native calendar picker and a Settings-format
 * text input. When {@link DateTimeFieldOptions.includeTime} is true, also mounts
 * an optional time text field + native time picker.
 *
 * Native `<input type="date|time">` provide the calendar/clock UI; text fields
 * round-trip through {@link parseDisplayDate} / {@link parseDisplayTime} so the
 * active Settings formats remain typeable.
 */
export function mountDateTimeField(parent: HTMLElement, options: DateTimeFieldOptions): void {
	const wrap = parent.createDiv({ cls: "pe-field pe-datetime-field" });
	wrap.createEl("label", { text: options.label, cls: "pe-label" });
	if (options.help) {
		wrap.createEl("p", { cls: "pe-help", text: options.help });
	}
	mountDateTimeControls(wrap, {
		ariaLabel: options.label,
		value: options.value,
		dateFormat: options.dateFormat,
		timeFormat: options.timeFormat,
		includeTime: options.includeTime,
		onChange: options.onChange,
		compactLucidePickers: false,
	});
}

/**
 * Mount compact date + optional time pickers suitable for task table cells.
 *
 * Same Settings-aware text + native calendar/clock pairing as
 * {@link mountDateTimeField}, without the outer field label / help chrome.
 * YAML stays ISO; display follows plugin date/time formats.
 *
 * Inline cells use Lucide calendar/clock buttons that open the hidden native
 * inputs — visible glyphs that work under dark Obsidian themes.
 *
 * @param parent — Table cell (or wrapper) that receives the controls.
 * @param options — Value, formats, and change handler.
 */
export function mountInlineDateTime(
	parent: HTMLElement,
	options: InlineDateTimeOptions,
): void {
	const wrap = parent.createDiv({ cls: "pe-inline-datetime" });
	mountDateTimeControls(wrap, {
		ariaLabel: options.ariaLabel,
		value: options.value,
		dateFormat: options.dateFormat,
		timeFormat: options.timeFormat,
		includeTime: true,
		onChange: options.onChange,
		compactLucidePickers: true,
	});
}

interface DateTimeControlsOptions {
	ariaLabel: string;
	value: string | null;
	dateFormat: DateDisplayFormat;
	timeFormat: TimeDisplayFormat;
	includeTime: boolean;
	onChange: (value: string | null) => void;
	/**
	 * When true (Dashboard/Table), hide native date/time chrome and mount Lucide
	 * calendar/clock buttons that open the native picker.
	 */
	compactLucidePickers: boolean;
}

/**
 * Open the browser/OS date or time picker for `input`.
 *
 * Prefers `HTMLInputElement.showPicker()` (Chromium/Electron). Falls back to
 * focus + click when `showPicker` is missing or throws (e.g. policy).
 *
 * Exported for unit tests.
 */
export function openNativePicker(input: HTMLInputElement): void {
	const withPicker = input as HTMLInputElement & { showPicker?: () => void };
	if (typeof withPicker.showPicker === "function") {
		try {
			withPicker.showPicker();
			return;
		} catch {
			// NotAllowedError or unsupported — fall through to click.
		}
	}
	input.focus();
	input.click();
}

/**
 * Shared control chrome for labelled fields and compact inline table editors.
 */
function mountDateTimeControls(
	parent: HTMLElement,
	options: DateTimeControlsOptions,
): void {
	const { ariaLabel, dateFormat, timeFormat, includeTime, onChange, compactLucidePickers } =
		options;
	const controls = parent.createDiv({ cls: "pe-datetime-controls" });
	const parts = splitDateTime(options.value);

	const dateCombo = controls.createDiv({ cls: "pe-picker-combo pe-date-combo" });
	const dateText = dateCombo.createEl("input", {
		cls: "pe-input pe-touch-target pe-date-text",
		attr: {
			type: "text",
			placeholder: dateFormatPlaceholder(dateFormat),
			spellcheck: "false",
			"aria-label": `${ariaLabel} date`,
		},
	});
	dateText.value = parts.date ? formatDisplayDate(parts.date, dateFormat) : "";

	const nativeDate = dateCombo.createEl("input", {
		cls: compactLucidePickers
			? "pe-input pe-touch-target pe-native-date pe-native-picker-hidden"
			: "pe-input pe-touch-target pe-native-date",
		attr: {
			type: "date",
			"aria-label": `${ariaLabel} calendar`,
			title: "Open calendar",
			tabindex: compactLucidePickers ? "-1" : "0",
		},
	});
	nativeDate.value = parts.date;

	if (compactLucidePickers) {
		mountLucidePickerButton(dateCombo, {
			icon: "calendar",
			title: "Open calendar",
			ariaLabel: `${ariaLabel} calendar`,
			input: nativeDate,
		});
	}

	let timeText: HTMLInputElement | null = null;
	let nativeTime: HTMLInputElement | null = null;

	if (includeTime) {
		const timeCombo = controls.createDiv({ cls: "pe-picker-combo pe-time-combo" });
		timeText = timeCombo.createEl("input", {
			cls: "pe-input pe-touch-target pe-time-text",
			attr: {
				type: "text",
				placeholder: timeFormatPlaceholder(timeFormat),
				spellcheck: "false",
				"aria-label": `${ariaLabel} time (optional)`,
			},
		});
		timeText.value = parts.time ? formatDisplayTime(parts.time, timeFormat) : "";

		nativeTime = timeCombo.createEl("input", {
			cls: compactLucidePickers
				? "pe-input pe-touch-target pe-native-time pe-native-picker-hidden"
				: "pe-input pe-touch-target pe-native-time",
			attr: {
				type: "time",
				"aria-label": `${ariaLabel} time picker (optional)`,
				title: "Open time picker",
				tabindex: compactLucidePickers ? "-1" : "0",
			},
		});
		nativeTime.value = parts.time;

		if (compactLucidePickers) {
			mountLucidePickerButton(timeCombo, {
				icon: "clock",
				title: "Open time picker",
				ariaLabel: `${ariaLabel} time picker (optional)`,
				input: nativeTime,
			});
		}
	}

	const syncFromControls = (source: "text" | "native"): void => {
		let isoDate = "";
		if (source === "native") {
			isoDate = nativeDate.value.trim();
		} else {
			const raw = dateText.value.trim();
			if (!raw) {
				isoDate = "";
			} else {
				const parsed = parseDisplayDate(raw, dateFormat);
				if (!parsed) {
					return;
				}
				isoDate = parsed;
			}
		}

		let isoTime = "";
		if (includeTime && timeText && nativeTime) {
			if (source === "native") {
				isoTime = nativeTime.value.trim();
			} else {
				const raw = timeText.value.trim();
				if (raw) {
					const parsed = parseDisplayTime(raw, timeFormat);
					if (parsed === null) {
						return;
					}
					isoTime = parsed;
				}
			}
		}

		if (!isoDate) {
			dateText.value = "";
			nativeDate.value = "";
			if (timeText && nativeTime) {
				timeText.value = "";
				nativeTime.value = "";
			}
			onChange(null);
			return;
		}

		dateText.value = formatDisplayDate(isoDate, dateFormat);
		nativeDate.value = isoDate;
		if (timeText && nativeTime) {
			if (isoTime) {
				timeText.value = formatDisplayTime(isoTime, timeFormat);
				nativeTime.value = isoTime;
			} else {
				timeText.value = "";
				nativeTime.value = "";
			}
		}
		onChange(joinDateTime(isoDate, isoTime));
	};

	dateText.addEventListener("change", () => syncFromControls("text"));
	dateText.addEventListener("blur", () => syncFromControls("text"));
	nativeDate.addEventListener("change", () => syncFromControls("native"));
	nativeDate.addEventListener("input", () => syncFromControls("native"));

	if (timeText && nativeTime) {
		timeText.addEventListener("change", () => syncFromControls("text"));
		timeText.addEventListener("blur", () => syncFromControls("text"));
		nativeTime.addEventListener("change", () => syncFromControls("native"));
		nativeTime.addEventListener("input", () => syncFromControls("native"));
	}
}

interface LucidePickerButtonOptions {
	icon: string;
	title: string;
	ariaLabel: string;
	input: HTMLInputElement;
}

/**
 * Compact Lucide affordance that opens the paired native date/time input.
 */
function mountLucidePickerButton(
	parent: HTMLElement,
	options: LucidePickerButtonOptions,
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		cls: "pe-picker-icon-btn",
		attr: {
			type: "button",
			title: options.title,
			"aria-label": options.ariaLabel,
		},
	});
	setIcon(btn, options.icon);
	btn.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		openNativePicker(options.input);
	});
	return btn;
}
