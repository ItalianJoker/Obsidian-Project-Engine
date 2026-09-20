/**
 * Date/time display parsing and formatting (settings-shaped ↔ ISO storage).
 */
import { describe, expect, it } from "vitest";
import {
	calendarDatePart,
	effectiveDue,
	formatDisplayDate,
	formatDisplayDateTime,
	formatDisplayTime,
	isExpiredDateTime,
	isOverdue,
	joinDateTime,
	parseDisplayDate,
	parseDisplayTime,
	splitDateTime,
} from "../src/services/dateFormat";

describe("split / join / calendar", () => {
	it("splits ISO date and optional time", () => {
		expect(splitDateTime("2026-09-17T14:30")).toEqual({
			date: "2026-09-17",
			time: "14:30",
		});
		expect(splitDateTime("")).toEqual({ date: "", time: "" });
		expect(splitDateTime(null)).toEqual({ date: "", time: "" });
	});

	it("joins date + time; empty date → null", () => {
		expect(joinDateTime("2026-09-17", "9:05")).toBe("2026-09-17T09:05");
		expect(joinDateTime("2026-09-17", "")).toBe("2026-09-17");
		expect(joinDateTime("", "10:00")).toBeNull();
	});

	it("calendarDatePart rejects invalid days", () => {
		expect(calendarDatePart("2026-02-31")).toBeNull();
		expect(calendarDatePart("2026-09-17T12:00")).toBe("2026-09-17");
	});
});

describe("parseDisplayDate / Time", () => {
	it("parses DD/MM/YYYY and ISO", () => {
		expect(parseDisplayDate("17/09/2026")).toBe("2026-09-17");
		expect(parseDisplayDate("2026-09-17")).toBe("2026-09-17");
		expect(parseDisplayDate("09/17/2026", "MM/DD/YYYY")).toBe("2026-09-17");
		expect(parseDisplayDate("32/01/2026")).toBeNull();
		expect(parseDisplayDate("")).toBeNull();
	});

	it("parses 24h and 12h times", () => {
		expect(parseDisplayTime("14:05")).toBe("14:05");
		expect(parseDisplayTime("2:30 PM")).toBe("14:30");
		expect(parseDisplayTime("12:00 AM")).toBe("00:00");
		expect(parseDisplayTime("25:00")).toBeNull();
		expect(parseDisplayTime("")).toBe("");
	});
});

describe("format + overdue", () => {
	it("formats dates per settings", () => {
		expect(formatDisplayDate("2026-09-17")).toBe("17/09/2026");
		expect(formatDisplayDate("2026-09-17", "MM/DD/YYYY")).toBe("09/17/2026");
		expect(formatDisplayDate(null)).toBe("—");
		expect(formatDisplayDateTime("2026-09-17T14:30", "DD/MM/YYYY", "24h")).toBe(
			"17/09/2026 14:30",
		);
		expect(formatDisplayTime("14:30", "12h")).toBe("2:30 PM");
	});

	it("isOverdue compares UTC calendar days", () => {
		const today = new Date(Date.UTC(2026, 8, 17));
		expect(isOverdue("2026-09-16", today)).toBe(true);
		expect(isOverdue("2026-09-17", today)).toBe(false);
		expect(isOverdue(null, today)).toBe(false);
	});

	it("isExpiredDateTime handles date-only and date-time", () => {
		const utcToday = new Date(Date.UTC(2026, 8, 17, 12, 0, 0));
		expect(isExpiredDateTime("2026-09-16", utcToday)).toBe(true);
		expect(isExpiredDateTime("2026-09-17", utcToday)).toBe(false);
		expect(isExpiredDateTime(null, utcToday)).toBe(false);
		expect(isExpiredDateTime("", utcToday)).toBe(false);

		const localNoon = new Date(2026, 8, 17, 12, 0, 0);
		expect(isExpiredDateTime("2026-09-17T09:00", localNoon)).toBe(true);
		expect(isExpiredDateTime("2026-09-17T15:00", localNoon)).toBe(false);
	});

	it("effectiveDue prefers due over endDate", () => {
		expect(effectiveDue({ due: "2026-01-01", endDate: "2026-02-01" })).toBe(
			"2026-01-01",
		);
		expect(effectiveDue({ endDate: "2026-02-01" })).toBe("2026-02-01");
		expect(effectiveDue({})).toBeNull();
	});
});
