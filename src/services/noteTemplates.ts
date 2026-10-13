/**
 * @file noteTemplates.ts
 * @purpose List Markdown templates and apply `{{project}}` / `{{title}}` / `{{date}}` placeholders.
 * @dependencies obsidian normalizePath, vaultIo
 * @usedBy CreateProjectDocumentModal, settings (Templates folder)
 */

import { normalizePath, TFile, type App, type Vault } from "obsidian";

/** Placeholders replaced when applying a note template. */
export interface NoteTemplateContext {
	/** Project display name. */
	project: string;
	/** New note title. */
	title: string;
	/** Calendar date as YYYY-MM-DD. */
	date: string;
}

/**
 * Normalise the Settings “Templates folder” path (vault-relative).
 */
export function normalizeTemplatesFolder(folder: string): string {
	const cleaned = (folder || "Templates")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalizePath(cleaned || "Templates");
}

/**
 * List `.md` basenames (without extension) under the templates folder.
 * Skips nested folders to avoid redundant vault scans on large vaults.
 */
export function listNoteTemplateBasenames(app: App, templatesFolder: string): string[] {
	const root = normalizeTemplatesFolder(templatesFolder);
	const prefix = `${root}/`;
	const names: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const path = file.path.replace(/\\/g, "/");
		if (!path.startsWith(prefix)) continue;
		const relative = path.slice(prefix.length);
		if (relative.includes("/")) continue;
		names.push(file.basename);
	}
	return names.sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve a template note under the templates folder.
 */
export function resolveNoteTemplateFile(
	vault: Vault,
	templatesFolder: string,
	basename: string,
): TFile | null {
	const root = normalizeTemplatesFolder(templatesFolder);
	const path = normalizePath(`${root}/${basename}.md`);
	const file = vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

/**
 * Replace `{{project}}`, `{{title}}`, and `{{date}}` in template body text.
 */
export function applyNoteTemplatePlaceholders(
	source: string,
	ctx: NoteTemplateContext,
): string {
	return source
		.replaceAll("{{project}}", ctx.project)
		.replaceAll("{{title}}", ctx.title)
		.replaceAll("{{date}}", ctx.date);
}

/**
 * Today as YYYY-MM-DD (local calendar).
 */
export function todayIsoDate(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
