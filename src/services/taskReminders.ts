/**
 * @file taskReminders.ts
 * @purpose Poll for upcoming scheduled tasks and show Obsidian Notice reminders.
 * @dependencies dateFormat, isCompletedTaskStatus, project archive helpers
 * @usedBy main.ts (registerInterval)
 *
 * Fires at most once per (task id + scheduled value). Date-only `scheduled`
 * values are skipped (minutes-before needs a wall-clock time).
 */

import { Notice, type App } from "obsidian";
import {
	isCompletedTaskStatus,
	type ProjectsEngineSettings,
	wikiLinkTarget,
} from "../models/types";
import { splitDateTime } from "./dateFormat";
import { isProjectArchived } from "./projectArchive";

/** Poll period for reminder checks (ms). Cleared via Plugin.registerInterval. */
export const REMINDER_POLL_INTERVAL_MS = 45_000;

/** Cap persisted fired keys so data.json stays small. */
export const REMINDER_FIRED_KEYS_MAX = 400;

/** Do not fire reminders more than this long after the scheduled instant. */
export const REMINDER_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Stable dedupe key for one task + one scheduled occurrence.
 */
export function reminderDedupeKey(taskId: string, scheduled: string): string {
	return `${taskId.trim()}::${scheduled.trim()}`;
}

/**
 * Parse YAML `scheduled` (`YYYY-MM-DDTHH:mm`) into local epoch ms.
 * Returns `null` when missing, date-only, or invalid.
 */
export function parseScheduledLocalMs(scheduled: string | null | undefined): number | null {
	if (!scheduled?.trim()) {
		return null;
	}
	const { date, time } = splitDateTime(scheduled);
	if (!date || !time) {
		return null;
	}
	const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const hm = /^(\d{2}):(\d{2})$/.exec(time);
	if (!ymd || !hm) {
		return null;
	}
	const y = Number.parseInt(ymd[1]!, 10);
	const m = Number.parseInt(ymd[2]!, 10);
	const d = Number.parseInt(ymd[3]!, 10);
	const hh = Number.parseInt(hm[1]!, 10);
	const mm = Number.parseInt(hm[2]!, 10);
	if (
		!Number.isFinite(y) ||
		!Number.isFinite(m) ||
		!Number.isFinite(d) ||
		!Number.isFinite(hh) ||
		!Number.isFinite(mm)
	) {
		return null;
	}
	const target = new Date(y, m - 1, d, hh, mm, 0, 0);
	const ms = target.getTime();
	return Number.isFinite(ms) ? ms : null;
}

/**
 * Normalise Settings “minutes before” to a non-negative finite integer.
 */
export function normaliseReminderMinutesBefore(value: unknown, fallback = 15): number {
	const n =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number.parseInt(value, 10)
				: Number.NaN;
	if (!Number.isFinite(n) || n < 0) {
		return fallback;
	}
	return Math.min(Math.floor(n), 10_080);
}

/**
 * Whether a reminder should fire for this scheduled instant.
 */
export function shouldFireReminder(args: {
	nowMs: number;
	scheduledMs: number;
	minutesBefore: number;
	alreadyFired: boolean;
}): boolean {
	if (args.alreadyFired) {
		return false;
	}
	if (!Number.isFinite(args.scheduledMs) || !Number.isFinite(args.nowMs)) {
		return false;
	}
	const leadMs = Math.max(0, args.minutesBefore) * 60 * 1000;
	const fireAt = args.scheduledMs - leadMs;
	if (args.nowMs < fireAt) {
		return false;
	}
	if (args.nowMs > args.scheduledMs + REMINDER_STALE_AFTER_MS) {
		return false;
	}
	return true;
}

/**
 * English Notice body for a task reminder.
 */
export function formatReminderNotice(args: {
	title: string;
	projectName?: string;
}): string {
	const title = args.title.trim() || "Untitled task";
	const project = args.projectName?.trim();
	if (project) {
		return `Reminder: “${title}” (${project})`;
	}
	return `Reminder: “${title}”`;
}

/**
 * One candidate scanned from MetadataCache (no vault.read).
 */
export interface ReminderTaskCandidate {
	id: string;
	title: string;
	status: string;
	scheduled: string;
	projectId: string;
	projectLink: string;
}

/**
 * Collect task frontmatter candidates for reminder evaluation.
 */
export function collectReminderCandidates(app: App): ReminderTaskCandidate[] {
	const out: ReminderTaskCandidate[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.pe_type !== "task") {
			continue;
		}
		const scheduled = typeof fm.scheduled === "string" ? fm.scheduled.trim() : "";
		if (!scheduled) {
			continue;
		}
		const id =
			typeof fm.id === "string" && fm.id.trim()
				? fm.id.trim()
				: file.basename;
		const title =
			typeof fm.title === "string" && fm.title.trim()
				? fm.title.trim()
				: file.basename;
		const status = typeof fm.status === "string" ? fm.status : "";
		const projectId =
			typeof fm.project_id === "string" ? fm.project_id.trim() : "";
		const projectLink = typeof fm.project === "string" ? fm.project : "";
		out.push({ id, title, status, scheduled, projectId, projectLink });
	}
	return out;
}

/**
 * Prune fired keys that no longer match any live scheduled occurrence,
 * and cap the list length.
 */
export function pruneReminderFiredKeys(
	keys: readonly string[],
	liveKeys: ReadonlySet<string>,
	max = REMINDER_FIRED_KEYS_MAX,
): string[] {
	const kept = keys.filter((key) => liveKeys.has(key));
	if (kept.length <= max) {
		return kept;
	}
	return kept.slice(kept.length - max);
}

/**
 * Evaluate candidates and return notices to show + keys to mark fired.
 */
export function planTaskReminders(args: {
	candidates: readonly ReminderTaskCandidate[];
	minutesBefore: number;
	firedKeys: ReadonlySet<string>;
	nowMs: number;
	/** Active (non-archived) project id → display name. */
	activeProjectNames: ReadonlyMap<string, string>;
	/** All known project ids (including archived) for archive skip. */
	archivedProjectIds: ReadonlySet<string>;
}): { notices: string[]; newKeys: string[] } {
	const notices: string[] = [];
	const newKeys: string[] = [];
	const minutesBefore = normaliseReminderMinutesBefore(args.minutesBefore);

	for (const task of args.candidates) {
		if (isCompletedTaskStatus(task.status)) {
			continue;
		}
		if (task.projectId && args.archivedProjectIds.has(task.projectId)) {
			continue;
		}
		const scheduledMs = parseScheduledLocalMs(task.scheduled);
		if (scheduledMs == null) {
			continue;
		}
		const key = reminderDedupeKey(task.id, task.scheduled);
		if (
			!shouldFireReminder({
				nowMs: args.nowMs,
				scheduledMs,
				minutesBefore,
				alreadyFired: args.firedKeys.has(key) || newKeys.includes(key),
			})
		) {
			continue;
		}
		const projectName =
			(task.projectId && args.activeProjectNames.get(task.projectId)) ||
			wikiLinkTarget(task.projectLink) ||
			undefined;
		notices.push(formatReminderNotice({ title: task.title, projectName }));
		newKeys.push(key);
	}

	return { notices, newKeys };
}

/**
 * Index project notes from MetadataCache for reminder project filters.
 */
export function collectProjectReminderIndex(
	app: App,
	settings: ProjectsEngineSettings,
): {
	activeProjectNames: Map<string, string>;
	archivedProjectIds: Set<string>;
} {
	const activeProjectNames = new Map<string, string>();
	const archivedProjectIds = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || fm.pe_type !== "project") {
			continue;
		}
		const id =
			typeof fm.id === "string" && fm.id.trim() ? fm.id.trim() : file.basename;
		const name =
			typeof fm.name === "string" && fm.name.trim()
				? fm.name.trim()
				: file.basename;
		const archived = isProjectArchived(
			{ archived: fm.archived === true, filePath: file.path },
			settings,
		);
		if (archived) {
			archivedProjectIds.add(id);
		} else {
			activeProjectNames.set(id, name);
		}
	}
	return { activeProjectNames, archivedProjectIds };
}

/**
 * Run one reminder poll: scan cache, show Notices, update fired keys on settings.
 *
 * @returns Number of notices shown.
 */
export async function runTaskReminderTick(args: {
	app: App;
	settings: ProjectsEngineSettings;
	persist: () => Promise<void>;
	now?: Date;
}): Promise<number> {
	const nowMs = (args.now ?? new Date()).getTime();
	const minutesBefore = normaliseReminderMinutesBefore(
		args.settings.reminderMinutesBefore,
	);
	const fired = new Set(args.settings.reminderFiredKeys ?? []);
	const { activeProjectNames, archivedProjectIds } = collectProjectReminderIndex(
		args.app,
		args.settings,
	);

	const candidates = collectReminderCandidates(args.app);
	const { notices, newKeys } = planTaskReminders({
		candidates,
		minutesBefore,
		firedKeys: fired,
		nowMs,
		activeProjectNames,
		archivedProjectIds,
	});

	if (newKeys.length === 0) {
		return 0;
	}

	for (const key of newKeys) {
		fired.add(key);
	}
	const liveKeys = new Set(
		candidates.map((task) => reminderDedupeKey(task.id, task.scheduled)),
	);
	for (const key of newKeys) {
		liveKeys.add(key);
	}
	args.settings.reminderFiredKeys = pruneReminderFiredKeys([...fired], liveKeys);
	await args.persist();

	for (const text of notices) {
		new Notice(text, 10_000);
	}
	return notices.length;
}
