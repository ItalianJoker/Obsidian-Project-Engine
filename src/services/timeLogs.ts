/**
 * Effort math: task hours ↔ management giornate.
 *
 * §7 time model:
 * - Task estimates and time-log durations are in **hours** (fractions OK).
 * - Portfolio / project budget uses **giornate** (`assigned_days`).
 * - Conversion: **1 giornata = hoursPerManday hours** (default 8).
 */

import type { TimeLog } from "../models/types";

/**
 * Aggregated effort figures for a task (or rolled-up subtree).
 */
export interface EffortRollup {
	/** Planned effort in hours. */
	estimateHours: number;
	/** Logged hours from time logs. */
	actualHours: number;
	/** Max(0, estimateHours − actualHours). */
	remainingHours: number;
	/** Hours logged beyond the estimate (0 when under budget). */
	overrunHours: number;
	/** Planned effort in giornate (estimateHours / hoursPerGiornata). */
	estimateGiornate: number;
	/** Logged effort in giornate. */
	actualGiornate: number;
	/** Remaining giornate (clamped ≥ 0). */
	remainingGiornate: number;
	/** Overrun in giornate. */
	overrunGiornate: number;
	/** Alias of {@link EffortRollup.estimateGiornate} for legacy callers. */
	estimateMandays: number;
	/** Alias of {@link EffortRollup.actualGiornate}. */
	actualMandays: number;
	/** Alias of {@link EffortRollup.remainingGiornate}. */
	remainingMandays: number;
	/** Alias of {@link EffortRollup.overrunGiornate}. */
	overrunMandays: number;
	/** Alias of {@link EffortRollup.actualHours}. */
	totalHours: number;
}

/** @deprecated Prefer {@link EffortRollup}. */
export type MandayRollup = EffortRollup;

/**
 * Normalise hours-per-giornata (never ≤ 0).
 */
export function normaliseHoursPerGiornata(hoursPerManday: number): number {
	return hoursPerManday > 0 ? hoursPerManday : 8;
}

/**
 * Convert hours → giornate.
 */
export function hoursToGiornate(hours: number, hoursPerManday: number): number {
	const per = normaliseHoursPerGiornata(hoursPerManday);
	return hours / per;
}

/**
 * Convert giornate → hours.
 */
export function giornateToHours(giornate: number, hoursPerManday: number): number {
	return giornate * normaliseHoursPerGiornata(hoursPerManday);
}

/**
 * Compact display for hours (trim trailing zeros).
 */
export function formatHours(hours: number): string {
	if (!Number.isFinite(hours)) {
		return "0 h";
	}
	const rounded = Math.round(hours * 100) / 100;
	return `${trimNumber(rounded)} h`;
}

/**
 * Compact display for giornate.
 */
export function formatGiornate(giornate: number): string {
	if (!Number.isFinite(giornate)) {
		return "0 g";
	}
	const rounded = Math.round(giornate * 100) / 100;
	return `${trimNumber(rounded)} g`;
}

/**
 * Dual-unit chip text, e.g. `16 h · 2 g` (1 g = 8 h).
 */
export function formatHoursAndGiornate(hours: number, hoursPerManday: number): string {
	const g = hoursToGiornate(hours, hoursPerManday);
	return `${formatHours(hours)} · ${formatGiornate(g)}`;
}

/**
 * Sum time-log hours and compare to an estimate expressed in hours.
 *
 * @param estimateHours - Planned effort in hours.
 * @param timeLogs - Rows with `duration` in hours.
 * @param hoursPerManday - Hours per giornata (default 8).
 */
export function computeEffortRollup(
	estimateHours: number,
	timeLogs: readonly TimeLog[],
	hoursPerManday: number,
): EffortRollup {
	const per = normaliseHoursPerGiornata(hoursPerManday);
	const actualHours = timeLogs.reduce((sum, row) => {
		const duration = Number(row.duration);
		return sum + (Number.isFinite(duration) ? duration : 0);
	}, 0);
	const estimate = Number.isFinite(estimateHours) ? estimateHours : 0;
	const delta = estimate - actualHours;
	const remainingHours = delta > 0 ? delta : 0;
	const overrunHours = delta < 0 ? -delta : 0;
	const estimateGiornate = estimate / per;
	const actualGiornate = actualHours / per;
	const remainingGiornate = remainingHours / per;
	const overrunGiornate = overrunHours / per;
	return {
		estimateHours: estimate,
		actualHours,
		remainingHours,
		overrunHours,
		estimateGiornate,
		actualGiornate,
		remainingGiornate,
		overrunGiornate,
		estimateMandays: estimateGiornate,
		actualMandays: actualGiornate,
		remainingMandays: remainingGiornate,
		overrunMandays: overrunGiornate,
		totalHours: actualHours,
	};
}

/**
 * Legacy wrapper: estimate was stored in mandays; converts to hours then rolls up.
 *
 * @deprecated Prefer {@link computeEffortRollup} with hours.
 */
export function computeMandayRollup(
	estimateMandays: number,
	timeLogs: readonly TimeLog[],
	hoursPerManday: number,
): EffortRollup {
	return computeEffortRollup(
		giornateToHours(estimateMandays, hoursPerManday),
		timeLogs,
		hoursPerManday,
	);
}

/**
 * Resolve estimate hours from YAML that may carry `estimate_hours` and/or legacy
 * `estimate_mandays`.
 */
export function resolveEstimateHours(
	data: Record<string, unknown>,
	hoursPerManday: number,
): number {
	if (typeof data.estimate_hours === "number" && Number.isFinite(data.estimate_hours)) {
		return data.estimate_hours;
	}
	const asNumber = Number(data.estimate_hours);
	if (Number.isFinite(asNumber) && data.estimate_hours != null && data.estimate_hours !== "") {
		return asNumber;
	}
	const mandays =
		typeof data.estimate_mandays === "number"
			? data.estimate_mandays
			: Number(data.estimate_mandays) || 0;
	return giornateToHours(mandays, hoursPerManday);
}

/**
 * Normalise a raw YAML time-log array into typed {@link TimeLog} rows.
 */
export function parseTimeLogs(raw: unknown): TimeLog[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const rows: TimeLog[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			continue;
		}
		const row = item as Record<string, unknown>;
		const date = typeof row.date === "string" ? row.date.trim() : "";
		const duration = typeof row.duration === "number" ? row.duration : Number(row.duration);
		const member = typeof row.member === "string" ? row.member.trim() : "";
		const note = typeof row.note === "string" ? row.note : "";
		if (!date || !Number.isFinite(duration)) {
			continue;
		}
		rows.push({
			date,
			duration,
			member,
			note,
		});
	}
	return rows;
}

/**
 * Serialise time logs for YAML (snake-free keys matching the domain model).
 */
export function serialiseTimeLogs(logs: readonly TimeLog[]): Record<string, unknown>[] {
	return logs.map((log) => ({
		date: log.date,
		duration: log.duration,
		member: log.member,
		note: log.note,
	}));
}

function trimNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : String(value);
}
