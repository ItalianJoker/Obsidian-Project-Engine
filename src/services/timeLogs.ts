/**
 * Manday math for estimate vs actual vs remaining.
 *
 * Remaining mandays = estimate − (sum of time-log hours / hoursPerManday).
 * Never returns negative remaining without clamping so UIs can show overruns
 * separately via {@link computeMandayRollup}.overrun.
 */

import type { TimeLog } from "../models/types";

/**
 * Aggregated effort figures for a task (or rolled-up subtree).
 */
export interface MandayRollup {
	/** Planned effort in mandays. */
	estimateMandays: number;
	/** Logged effort converted to mandays. */
	actualMandays: number;
	/** Max(0, estimate − actual). */
	remainingMandays: number;
	/** Hours logged beyond the estimate (0 when under budget). */
	overrunMandays: number;
	/** Raw hours from time logs. */
	totalHours: number;
}

/**
 * Sum time-log hours and convert to mandays using the plugin setting.
 *
 * @param estimateMandays - Planned effort.
 * @param timeLogs - Rows with `duration` in hours.
 * @param hoursPerManday - Hours that constitute one manday (default 8).
 */
export function computeMandayRollup(
	estimateMandays: number,
	timeLogs: readonly TimeLog[],
	hoursPerManday: number,
): MandayRollup {
	const hours = hoursPerManday > 0 ? hoursPerManday : 8;
	const totalHours = timeLogs.reduce((sum, row) => {
		const duration = Number(row.duration);
		return sum + (Number.isFinite(duration) ? duration : 0);
	}, 0);
	const actualMandays = totalHours / hours;
	const delta = estimateMandays - actualMandays;
	return {
		estimateMandays,
		actualMandays,
		remainingMandays: delta > 0 ? delta : 0,
		overrunMandays: delta < 0 ? -delta : 0,
		totalHours,
	};
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
