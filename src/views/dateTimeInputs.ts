/**
 * Task-editor date / time controls: native calendar + clock pickers synced with
 * Settings-format text fields (default DD/MM/YYYY + 24h). YAML stays ISO.
 */

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
 * Mount a labelled date field with a native calendar picker and a Settings-format
 * text input. When {@link DateTimeFieldOptions.includeTime} is true, also mounts
 * an optional time text field + native time picker.
 *
 * Native `<input type="date|time">` provide the calendar/clock UI; text fields
 * round-trip through {@link parseDisplayDate} / {@link parseDisplayTime} so the
 * active Settings formats remain typeable.
 */
export function mountDateTimeField(parent: HTMLElement, options: DateTimeFieldOptions): void {
	const { label, dateFormat, timeFormat, includeTime, onChange } = options;
	const wrap = parent.createDiv({ cls: "pe-field pe-datetime-field" });
	wrap.createEl("label", { text: label, cls: "pe-label" });
	if (options.help) {
		wrap.createEl("p", { cls: "pe-help", text: options.help });
	}

	const controls = wrap.createDiv({ cls: "pe-datetime-controls" });
	const parts = splitDateTime(options.value);

	const dateCombo = controls.createDiv({ cls: "pe-picker-combo pe-date-combo" });
	const dateText = dateCombo.createEl("input", {
		cls: "pe-input pe-touch-target pe-date-text",
		attr: {
			type: "text",
			placeholder: dateFormatPlaceholder(dateFormat),
			spellcheck: "false",
			"aria-label": `${label} date`,
		},
	});
	dateText.value = parts.date ? formatDisplayDate(parts.date, dateFormat) : "";

	const nativeDate = dateCombo.createEl("input", {
		cls: "pe-input pe-touch-target pe-native-date",
		attr: {
			type: "date",
			"aria-label": `${label} calendar`,
			title: "Open calendar",
		},
	});
	nativeDate.value = parts.date;

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
				"aria-label": `${label} time (optional)`,
			},
		});
		timeText.value = parts.time ? formatDisplayTime(parts.time, timeFormat) : "";

		nativeTime = timeCombo.createEl("input", {
			cls: "pe-input pe-touch-target pe-native-time",
			attr: {
				type: "time",
				"aria-label": `${label} time picker (optional)`,
				title: "Open time picker",
			},
		});
		nativeTime.value = parts.time;
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
