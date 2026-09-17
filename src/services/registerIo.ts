/**
 * PRINCE2 operational register entries as Entity-as-a-Note Markdown.
 *
 * Risk, Issue & Change, and Quality entries live as individual notes under the
 * project’s Registers folder (alongside the lean register index notes). Each
 * entry carries YAML frontmatter (`status`, `owner` / `raised_by`, `date`,
 * severity or priority) plus a body `## Links` section so Graph View clusters
 * them with the project.
 *
 * Writes use {@link writeNoteAtomic} → `vault.process`. No stub spam: entries
 * are created on quick-add (or first use), never as empty scaffold rows.
 */

import { TFile, TFolder, type App, type Vault } from "obsidian";
import type {
	IsoDate,
	Prince2RegisterKind,
	WikiLink,
} from "../models/types";
import { toWikiLink } from "../models/types";
import { formatIsoDate } from "../engine/Scheduler";
import { buildGraphLinksSection, buildMarkdownNote } from "./frontmatter";
import { containingProjectFolder } from "./projectPaths";
import {
	ensureFolder,
	joinVaultPath,
	noteExists,
	sanitiseNoteBasename,
	writeNoteAtomic,
} from "./vaultIo";

/** Frontmatter `pe_type` for a single register row note. */
export const REGISTER_ENTRY_PE_TYPE = "prince2-register-entry";

/**
 * Operational PRINCE2 registers that support entry notes + Overview widgets.
 * Business Case and Work Packages remain index-only templates.
 */
export type OperationalRegisterKind =
	| "risk-register"
	| "issue-change-log"
	| "quality-register";

/** Ordered operational registers with English titles and ID prefixes. */
export const OPERATIONAL_REGISTERS: {
	kind: OperationalRegisterKind;
	title: string;
	idPrefix: "R" | "I" | "Q";
	entryNoun: string;
}[] = [
	{
		kind: "risk-register",
		title: "Risk Register",
		idPrefix: "R",
		entryNoun: "risk",
	},
	{
		kind: "issue-change-log",
		title: "Issue & Change Log",
		idPrefix: "I",
		entryNoun: "issue",
	},
	{
		kind: "quality-register",
		title: "Quality Register",
		idPrefix: "Q",
		entryNoun: "quality item",
	},
];

/**
 * Lightweight projection of a register entry note for Overview widgets.
 */
export interface RegisterEntryRow {
	/** Entry id (`R-001`, `I-002`, `Q-003`). */
	id: string;
	/** Display title (`name` frontmatter or basename). */
	title: string;
	kind: OperationalRegisterKind;
	/** Vault path to the entry `.md`. */
	filePath: string;
	file: TFile;
	status: string;
	/** Severity (risk) or priority (issue); empty for quality. */
	severityOrPriority: string;
	owner: string;
	/** Calendar date used for “recent” ordering (`date` / `raised_on` / `planned_date`). */
	date: IsoDate | null;
	/** File mtime fallback for sorting. */
	mtime: number;
}

/**
 * True when `kind` is one of the three operational registers.
 */
export function isOperationalRegisterKind(
	kind: string,
): kind is OperationalRegisterKind {
	return (
		kind === "risk-register" ||
		kind === "issue-change-log" ||
		kind === "quality-register"
	);
}

/**
 * Resolve metadata for an operational register kind.
 *
 * @throws When the kind is not operational.
 */
export function operationalRegisterMeta(kind: OperationalRegisterKind): (typeof OPERATIONAL_REGISTERS)[number] {
	const meta = OPERATIONAL_REGISTERS.find((item) => item.kind === kind);
	if (!meta) {
		throw new Error(`Unknown operational register kind: ${kind}`);
	}
	return meta;
}

/**
 * Vault-relative Registers folder for a project note.
 */
export function projectRegistersFolder(
	projectFilePath: string,
	registersFolderName = "Registers",
): string | null {
	const projectFolder = containingProjectFolder(projectFilePath);
	if (!projectFolder) {
		return null;
	}
	const name = sanitiseNoteBasename(registersFolderName.trim() || "Registers") || "Registers";
	return joinVaultPath(projectFolder, name);
}

/**
 * Path to the lean register index note (e.g. `…/Registers/Risk Register.md`).
 */
export function registerIndexPath(
	registersFolder: string,
	kind: OperationalRegisterKind,
): string {
	const title = operationalRegisterMeta(kind).title;
	return joinVaultPath(registersFolder, `${title}.md`);
}

/**
 * Allocate the next entry id for a kind (`R-001`, `I-002`, …).
 *
 * Scans existing entry notes under the Registers folder (any depth).
 */
export function nextRegisterEntryId(
	app: App,
	registersFolder: string,
	kind: OperationalRegisterKind,
): string {
	const prefix = operationalRegisterMeta(kind).idPrefix;
	const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
	let max = 0;
	for (const row of listRegisterEntries(app, registersFolder, kind)) {
		const match = re.exec(row.id.trim());
		if (match) {
			const n = Number(match[1]);
			if (Number.isFinite(n) && n > max) {
				max = n;
			}
		}
	}
	return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Build Markdown for a new operational register entry note.
 */
export function buildRegisterEntryMarkdown(args: {
	kind: OperationalRegisterKind;
	id: string;
	title: string;
	projectLink: WikiLink;
	date?: IsoDate;
}): string {
	const today = args.date ?? formatIsoDate(new Date());
	const title = args.title.trim() || args.id;
	const links = buildGraphLinksSection([
		{ label: "Project", wikiLink: args.projectLink },
	]);

	switch (args.kind) {
		case "risk-register": {
			const data: Record<string, unknown> = {
				pe_type: REGISTER_ENTRY_PE_TYPE,
				register_kind: args.kind,
				id: args.id,
				name: title,
				project: args.projectLink,
				status: "open",
				owner: "",
				date: today,
				probability: "medium",
				impact: "medium",
				severity: "medium",
				proximity: null,
				response: "",
			};
			const body = [
				`# ${args.id} — ${title}`,
				"",
				"## Description",
				"",
				"",
				"## Response",
				"",
				"",
				links,
			].join("\n");
			return buildMarkdownNote(data, body);
		}
		case "issue-change-log": {
			const data: Record<string, unknown> = {
				pe_type: REGISTER_ENTRY_PE_TYPE,
				register_kind: args.kind,
				id: args.id,
				name: title,
				project: args.projectLink,
				type: "issue",
				status: "open",
				priority: "medium",
				raised_by: "",
				raised_on: today,
				date: today,
				decision: "",
			};
			const body = [
				`# ${args.id} — ${title}`,
				"",
				"## Description",
				"",
				"",
				"## Decision",
				"",
				"",
				links,
			].join("\n");
			return buildMarkdownNote(data, body);
		}
		case "quality-register": {
			const data: Record<string, unknown> = {
				pe_type: REGISTER_ENTRY_PE_TYPE,
				register_kind: args.kind,
				id: args.id,
				name: title,
				project: args.projectLink,
				product: title,
				method: "",
				reviewer: "",
				status: "pending",
				result: "pending",
				planned_date: today,
				actual_date: null,
				date: today,
			};
			const body = [
				`# ${args.id} — ${title}`,
				"",
				"## Product / method",
				"",
				"",
				"## Review notes",
				"",
				"",
				links,
			].join("\n");
			return buildMarkdownNote(data, body);
		}
	}
}

/**
 * Create a new register entry note under the project Registers folder.
 *
 * Ensures the Registers folder and lean index note exist (first use), then
 * writes the entry via `vault.process`. Does not overwrite existing paths.
 *
 * @returns The created file and allocated id.
 */
export async function createRegisterEntry(args: {
	app: App;
	vault: Vault;
	projectFile: TFile;
	kind: OperationalRegisterKind;
	title: string;
	registersFolderName?: string;
}): Promise<{ file: TFile; id: string }> {
	const title = args.title.trim();
	if (!title) {
		throw new Error("Entry title is required");
	}

	const registersFolder = projectRegistersFolder(
		args.projectFile.path,
		args.registersFolderName ?? "Registers",
	);
	if (!registersFolder) {
		throw new Error("Project note is not inside a project folder");
	}

	await ensureFolder(args.vault, registersFolder);
	await ensureOperationalRegisterIndex({
		vault: args.vault,
		registersFolder,
		kind: args.kind,
		projectLink: toWikiLink(args.projectFile.basename),
		projectName: args.projectFile.basename,
	});

	const id = nextRegisterEntryId(args.app, registersFolder, args.kind);
	const basename = sanitiseNoteBasename(`${id} ${title}`) || id;
	const path = joinVaultPath(registersFolder, `${basename}.md`);
	if (noteExists(args.vault, path)) {
		throw new Error(`A note already exists at “${path}”`);
	}

	const markdown = buildRegisterEntryMarkdown({
		kind: args.kind,
		id,
		title,
		projectLink: toWikiLink(args.projectFile.basename),
	});
	const file = await writeNoteAtomic(args.vault, path, markdown);
	return { file, id };
}

/**
 * Ensure a single operational register index note exists (idempotent, lean).
 */
export async function ensureOperationalRegisterIndex(args: {
	vault: Vault;
	registersFolder: string;
	kind: OperationalRegisterKind;
	projectLink: WikiLink;
	projectName: string;
}): Promise<TFile | null> {
	const path = registerIndexPath(args.registersFolder, args.kind);
	const existing = args.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		return existing;
	}
	const meta = operationalRegisterMeta(args.kind);
	const markdown = buildOperationalRegisterIndexMarkdown(
		args.kind,
		meta.title,
		args.projectLink,
		args.projectName,
	);
	return writeNoteAtomic(args.vault, path, markdown);
}

/**
 * Lean index note body for an operational register (no stub table rows).
 */
export function buildOperationalRegisterIndexMarkdown(
	kind: OperationalRegisterKind,
	title: string,
	projectLink: WikiLink,
	projectName: string,
): string {
	const data: Record<string, unknown> = {
		pe_type: "prince2-register",
		register_kind: kind,
		name: title,
		project: projectLink,
	};
	const noun = operationalRegisterMeta(kind).entryNoun;
	const body = [
		`# ${title}`,
		"",
		`Project: ${projectLink} (${projectName})`,
		"",
		`Operational ${noun} entries are separate Markdown notes in this folder`,
		`(frontmatter \`pe_type: ${REGISTER_ENTRY_PE_TYPE}\`). Use the project`,
		"Dashboard **Registers** widgets to quick-add, or create a note with the",
		"fields below.",
		"",
		"## Fields",
		"",
		...indexFieldBullets(kind),
		"",
		buildGraphLinksSection([{ label: "Project", wikiLink: projectLink }]),
	].join("\n");
	return buildMarkdownNote(data, body);
}

function indexFieldBullets(kind: OperationalRegisterKind): string[] {
	switch (kind) {
		case "risk-register":
			return [
				"- `id`, `name`, `status` (open | closed)",
				"- `owner`, `date`, `probability`, `impact`, `severity`",
				"- `proximity`, `response`",
			];
		case "issue-change-log":
			return [
				"- `id`, `name`, `type` (issue | change-request | off-spec)",
				"- `status`, `priority`, `raised_by`, `raised_on`, `date`",
				"- `decision`",
			];
		case "quality-register":
			return [
				"- `id`, `name`, `product`, `method`, `reviewer`",
				"- `status` / `result` (pending | pass | fail)",
				"- `planned_date`, `actual_date`, `date`",
			];
	}
}

/**
 * List register entry notes under a Registers folder (recursive).
 *
 * Filters by `pe_type: prince2-register-entry` and optional `register_kind`.
 * Sorted newest-first by entry date, then mtime.
 */
export function listRegisterEntries(
	app: App,
	registersFolder: string,
	kind?: OperationalRegisterKind,
): RegisterEntryRow[] {
	const root = registersFolder.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!root) {
		return [];
	}
	const folder = app.vault.getAbstractFileByPath(root);
	if (!(folder instanceof TFolder)) {
		return [];
	}

	const rows: RegisterEntryRow[] = [];
	const stack: TFolder[] = [folder];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const child of current.children) {
			if (child instanceof TFolder) {
				stack.push(child);
				continue;
			}
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const row = parseRegisterEntryFile(app, child);
			if (!row) {
				continue;
			}
			if (kind && row.kind !== kind) {
				continue;
			}
			rows.push(row);
		}
	}

	return rows.sort((a, b) => {
		if (a.date && b.date && a.date !== b.date) {
			return a.date < b.date ? 1 : -1;
		}
		if (a.date && !b.date) return -1;
		if (!a.date && b.date) return 1;
		return b.mtime - a.mtime;
	});
}

/**
 * Parse one Markdown file into a {@link RegisterEntryRow}, or null if not an entry.
 */
export function parseRegisterEntryFile(app: App, file: TFile): RegisterEntryRow | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	if (!fm || fm.pe_type !== REGISTER_ENTRY_PE_TYPE) {
		return null;
	}
	const kindRaw = typeof fm.register_kind === "string" ? fm.register_kind : "";
	if (!isOperationalRegisterKind(kindRaw)) {
		return null;
	}
	const id =
		typeof fm.id === "string" && fm.id.trim()
			? fm.id.trim()
			: guessIdFromBasename(file.basename, kindRaw);
	const title =
		typeof fm.name === "string" && fm.name.trim()
			? fm.name.trim()
			: file.basename;
	const status = typeof fm.status === "string" ? fm.status : "";
	const severityOrPriority =
		kindRaw === "risk-register"
			? stringField(fm.severity) || stringField(fm.impact)
			: kindRaw === "issue-change-log"
				? stringField(fm.priority)
				: stringField(fm.result) || status;
	const owner =
		kindRaw === "issue-change-log"
			? stringField(fm.raised_by)
			: kindRaw === "quality-register"
				? stringField(fm.reviewer)
				: stringField(fm.owner);
	const date =
		isoField(fm.date) ??
		isoField(fm.raised_on) ??
		isoField(fm.planned_date) ??
		null;

	return {
		id,
		title,
		kind: kindRaw,
		filePath: file.path,
		file,
		status,
		severityOrPriority,
		owner,
		date,
		mtime: file.stat?.mtime ?? 0,
	};
}

/**
 * Count open vs total entries for widget badges.
 *
 * “Open” = status not in closed / rejected / pass (quality pass counts closed).
 */
export function countRegisterEntries(rows: RegisterEntryRow[]): {
	total: number;
	open: number;
} {
	let open = 0;
	for (const row of rows) {
		if (isOpenRegisterStatus(row.status, row.kind)) {
			open += 1;
		}
	}
	return { total: rows.length, open };
}

/**
 * Whether an entry still needs attention on the Dashboard widget.
 */
export function isOpenRegisterStatus(
	status: string,
	kind: OperationalRegisterKind,
): boolean {
	const normalised = status.trim().toLowerCase();
	if (!normalised) {
		return true;
	}
	if (kind === "quality-register") {
		return normalised === "pending" || normalised === "fail" || normalised === "open";
	}
	return (
		normalised === "open" ||
		normalised === "in-review" ||
		normalised === "in_review"
	);
}

/**
 * Type guard helper: formal register kinds that are also operational.
 */
export function asOperationalKind(
	kind: Prince2RegisterKind,
): OperationalRegisterKind | null {
	return isOperationalRegisterKind(kind) ? kind : null;
}

function stringField(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isoField(value: unknown): IsoDate | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim().slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function guessIdFromBasename(
	basename: string,
	kind: OperationalRegisterKind,
): string {
	const prefix = operationalRegisterMeta(kind).idPrefix;
	const match = new RegExp(`^(${prefix}-\\d+)`, "i").exec(basename);
	if (!match?.[1]) {
		return basename;
	}
	const digits = match[1].slice(prefix.length + 1);
	return `${prefix}-${digits}`;
}
