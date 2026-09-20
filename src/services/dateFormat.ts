/**
 * Date / time display and input helpers.
 *
 * Storage stays ISO in YAML (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`).
 * Settings control how dates appear and how users type them in editors.
 * Defaults: `DD/MM/YYYY` calendar layout with a 24-hour clock.
 */

import type { DateDisplayFormat, IsoDate, TimeDisplayFormat } from "../models/types";
import { parseIsoDate } from "../engine/Scheduler";

/**
 * Split a stored date-time into calendar date and optional `HH:mm` (24h).
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
 * Extract the calendar-day portion (`YYYY-MM-DD`) from a date or date-time string.
 * Used by the scheduler / Gantt so optional wall-clock times do not break day math.
 */
export function calendarDatePart(value: string | null | undefined): IsoDate | null {
	if (!value?.trim()) {
		return null;
	}
	const { date } = splitDateTime(value);
	return isValidYmd(date) ? date : null;
}

/**
 * Compose a YAML date-time from an ISO calendar date and optional `HH:mm` (24h).
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

/** Placeholder text matching the active date format (e.g. `DD/MM/YYYY`). */
export function dateFormatPlaceholder(format: DateDisplayFormat): string {
	return format;
}

/** Placeholder text matching the active time format. */
export function timeFormatPlaceholder(timeFormat: TimeDisplayFormat): string {
	return timeFormat === "12h" ? "h:mm AM/PM" : "HH:mm";
}

/**
 * Parse a settings-shaped calendar date into ISO `YYYY-MM-DD`.
 * Also accepts raw ISO. Returns `null` when empty or invalid.
 */
export function parseDisplayDate(
	text: string | null | undefined,
	format: DateDisplayFormat = "DD/MM/YYYY",
): IsoDate | null {
	const raw = text?.trim() ?? "";
	if (!raw) {
		return null;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		return isValidYmd(raw) ? raw : null;
	}
	const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
	if (slash) {
		const a = Number.parseInt(slash[1]!, 10);
		const b = Number.parseInt(slash[2]!, 10);
		const y = slash[3]!;
		let month: number;
		let day: number;
		if (format === "MM/DD/YYYY") {
			month = a;
			day = b;
		} else {
			// DD/MM/YYYY (default) and YYYY-MM-DD fallback when slash-separated
			day = a;
			month = b;
		}
		const iso = `${y}-${pad2(month)}-${pad2(day)}`;
		return isValidYmd(iso) ? iso : null;
	}
	const ymdSlash = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(raw);
	if (ymdSlash) {
		const iso = `${ymdSlash[1]}-${pad2(Number.parseInt(ymdSlash[2]!, 10))}-${pad2(Number.parseInt(ymdSlash[3]!, 10))}`;
		return isValidYmd(iso) ? iso : null;
	}
	return null;
}

/**
 * Parse a settings-shaped time into 24h `HH:mm`.
 * Accepts `HH:mm`, `H:mm`, and 12h forms (`2:30 PM`). Empty → `""`.
 * Invalid → `null`.
 */
export function parseDisplayTime(
	text: string | null | undefined,
	timeFormat: TimeDisplayFormat = "24h",
): string | null {
	const raw = text?.trim() ?? "";
	if (!raw) {
		return "";
	}
	const twelve = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(raw);
	if (twelve) {
		let hours = Number.parseInt(twelve[1]!, 10);
		const minutes = Number.parseInt(twelve[2]!, 10);
		const period = twelve[3]!.toUpperCase();
		if (hours < 1 || hours > 12 || minutes > 59) {
			return null;
		}
		if (period === "AM") {
			hours = hours === 12 ? 0 : hours;
		} else {
			hours = hours === 12 ? 12 : hours + 12;
		}
		return `${pad2(hours)}:${pad2(minutes)}`;
	}
	const twentyFour = /^(\d{1,2}):(\d{2})$/.exec(raw);
	if (twentyFour) {
		const hours = Number.parseInt(twentyFour[1]!, 10);
		const minutes = Number.parseInt(twentyFour[2]!, 10);
		if (hours > 23 || minutes > 59) {
			return null;
		}
		// When Settings are 12h, bare HH:mm is still accepted (typed or pasted).
		void timeFormat;
		return `${pad2(hours)}:${pad2(minutes)}`;
	}
	return null;
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
	return `${datePart} ${formatDisplayTime(time, timeFormat)}`;
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
			label += ` ${formatDisplayTime(time, timeFormat).replace(" ", "")}`;
		}
		return label;
	} catch {
		return formatDisplayDateTime(iso, format, timeFormat);
	}
}

/**
 * Format a Date (or ISO datetime / `HH:mm`) time-of-day per settings.
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
 * True when a due/scheduled value is in the past (incomplete-task highlight).
 *
 * - Date-only (`YYYY-MM-DD`): same rule as {@link isOverdue} (UTC calendar day
 *   strictly before today).
 * - Date-time (`YYYY-MM-DDTHH:mm`): wall-clock local datetime is before `now`.
 */
export function isExpiredDateTime(
	iso: string | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!iso?.trim()) {
		return false;
	}
	try {
		const { date, time } = splitDateTime(iso);
		if (!date || !isValidYmd(date)) {
			return false;
		}
		if (time) {
			const [y, m, d] = date.split("-").map((part) => Number.parseInt(part, 10));
			const [hh, mm] = time.split(":").map((part) => Number.parseInt(part, 10));
			const target = new Date(y!, (m ?? 1) - 1, d!, hh ?? 0, mm ?? 0, 0, 0);
			return target.getTime() < now.getTime();
		}
		return isOverdue(date, now);
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

function pad2(n: number): string {
	return n.toString().padStart(2, "0");
}

/** Calendar validity check for an ISO `YYYY-MM-DD` string. */
function isValidYmd(iso: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) {
		return false;
	}
	const y = Number.parseInt(match[1]!, 10);
	const m = Number.parseInt(match[2]!, 10);
	const d = Number.parseInt(match[3]!, 10);
	if (m < 1 || m > 12 || d < 1 || d > 31) {
		return false;
	}
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
