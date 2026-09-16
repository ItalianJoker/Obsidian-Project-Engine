/**
 * Date / time display helpers (ISO stored in YAML; formatted for English UI).
 *
 * Task `due` / `scheduled` store `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`.
 * Defaults: Italian calendar layout `DD/MM/YYYY` with 24-hour clock.
 */

import type { DateDisplayFormat, IsoDate, TimeDisplayFormat } from "../models/types";
import { parseIsoDate } from "../engine/Scheduler";

/**
 * Split a stored date-time into calendar date and optional `HH:mm`.
 */
export function splitDateTime(value: string | null | undefined): {
	date: string;
	time: string;
} {
	if (!value?.trim()) {
		return { date: "", time: "" };
	}
	const trimmed = value.trim();
	const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(trimmed);
	if (!match) {
		return { date: trimmed.slice(0, 10), time: "" };
	}
	const time = match[2] != null && match[3] != null ? `${match[2]}:${match[3]}` : "";
	return { date: match[1]!, time };
}

/**
 * Compose YAML value from date input + optional time (`HH:mm`).
 */
export function joinDateTime(date: string, time: string): string | null {
	const d = date.trim();
	if (!d) {
		return null;
	}
	const t = time.trim();
	if (!t) {
		return d;
	}
	const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
	if (!hm) {
		return d;
	}
	const hh = hm[1]!.padStart(2, "0");
	const mm = hm[2]!;
	return `${d}T${hh}:${mm}`;
}

/**
 * Format an ISO date or date-time for display (respects date + time settings).
 */
export function formatDisplayDateTime(
	value: string | null | undefined,
	dateFormat: DateDisplayFormat = "DD/MM/YYYY",
	timeFormat: TimeDisplayFormat = "24h",
): string {
	if (!value) {
		return "—";
	}
	const { date, time } = splitDateTime(value);
	const datePart = formatDisplayDate(date, dateFormat);
	if (!time) {
		return datePart;
	}
	const [hh, mm] = time.split(":");
	const hours = Number.parseInt(hh ?? "0", 10);
	const minutes = (mm ?? "00").padStart(2, "0");
	if (timeFormat === "12h") {
		const period = hours >= 12 ? "PM" : "AM";
		const h12 = hours % 12 || 12;
		return `${datePart} ${h12}:${minutes} ${period}`;
	}
	return `${datePart} ${hours.toString().padStart(2, "0")}:${minutes}`;
}

/**
 * Format an ISO date (`YYYY-MM-DD`) for display.
 */
export function formatDisplayDate(
	iso: IsoDate | null | undefined,
	format: DateDisplayFormat = "DD/MM/YYYY",
): string {
	if (!iso) {
		return "—";
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
	if (!match) {
		return iso;
	}
	const [, y, m, d] = match;
	switch (format) {
		case "MM/DD/YYYY":
			return `${m}/${d}/${y}`;
		case "YYYY-MM-DD":
			return `${y}-${m}-${d}`;
		case "DD/MM/YYYY":
		default:
			return `${d}/${m}/${y}`;
	}
}

/**
 * Compact due pill label (example: `16 May` or `May 16, 14:00`).
 */
export function formatDuePill(
	iso: string | null | undefined,
	format: DateDisplayFormat = "DD/MM/YYYY",
	timeFormat: TimeDisplayFormat = "24h",
): string {
	if (!iso) {
		return "";
	}
	const { date, time } = splitDateTime(iso);
	try {
		const parsed = parseIsoDate(date);
		const day = parsed.getUTCDate();
		const month = parsed.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
		const year = String(parsed.getUTCFullYear()).slice(-2);
		let label: string;
		if (format === "MM/DD/YYYY") {
			label = `${month} ${day}, ${year}`;
		} else if (format === "YYYY-MM-DD") {
			label = date;
		} else {
			label = `${day} ${month}, ${year}`;
		}
		if (time) {
			const [hh, mm] = time.split(":");
			const hours = Number.parseInt(hh ?? "0", 10);
			const minutes = (mm ?? "00").padStart(2, "0");
			if (timeFormat === "12h") {
				const period = hours >= 12 ? "PM" : "AM";
				const h12 = hours % 12 || 12;
				label += ` ${h12}:${minutes}${period}`;
			} else {
				label += ` ${hours.toString().padStart(2, "0")}:${minutes}`;
			}
		}
		return label;
	} catch {
		return formatDisplayDateTime(iso, format, timeFormat);
	}
}

/**
 * Format a Date (or ISO datetime) time-of-day per settings.
 */
export function formatDisplayTime(
	value: Date | string,
	timeFormat: TimeDisplayFormat = "24h",
): string {
	if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value.trim())) {
		const [hh, mm] = value.trim().split(":");
		const hours = Number.parseInt(hh ?? "0", 10);
		const minutes = (mm ?? "00").padStart(2, "0");
		if (timeFormat === "12h") {
			const period = hours >= 12 ? "PM" : "AM";
			const h12 = hours % 12 || 12;
			return `${h12}:${minutes} ${period}`;
		}
		return `${hours.toString().padStart(2, "0")}:${minutes}`;
	}
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	const hours = date.getHours();
	const minutes = date.getMinutes().toString().padStart(2, "0");
	if (timeFormat === "12h") {
		const period = hours >= 12 ? "PM" : "AM";
		const h12 = hours % 12 || 12;
		return `${h12}:${minutes} ${period}`;
	}
	return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

/**
 * True when the due date is before today (UTC calendar day).
 */
export function isOverdue(iso: string | null | undefined, today: Date = new Date()): boolean {
	if (!iso) {
		return false;
	}
	try {
		const due = parseIsoDate(iso.slice(0, 10));
		const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
		return due.getTime() < start;
	} catch {
		return false;
	}
}

/**
 * Effective due value for UI: prefer `due`, else legacy `end_date`.
 */
export function effectiveDue(task: { due?: string | null; endDate?: string | null }): string | null {
	return task.due ?? task.endDate ?? null;
}
