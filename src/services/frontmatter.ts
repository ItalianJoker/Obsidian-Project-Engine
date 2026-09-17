/**
 * Frontmatter serialisation helpers.
 *
 * Uses Obsidian's `stringifyYaml` / `parseYaml` (browser-safe) rather than
 * Node `js-yaml` or `fs`. Wikilinks are stored as quoted YAML strings so
 * Graph View and the link indexer keep resolving `[[Note]]` targets.
 *
 * Every note with a `pe_type` also receives Obsidian `tags` (plugin + type,
 * and optional project / kind extras) so Properties, Tags view, Bases, Graph
 * filters, and search work without third-party plugins.
 */

import { parseYaml, stringifyYaml } from "obsidian";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Canonical plugin tag present on every Projects Engine note.
 *
 * @remarks YAML `tags` — Obsidian-native; not a proprietary index.
 */
export const PE_PLUGIN_TAG = "projects-engine";

/**
 * Split a Markdown document into YAML frontmatter and body.
 */
export function splitFrontmatter(markdown: string): { yaml: string; body: string; data: Record<string, unknown> } {
	const match = FRONTMATTER_RE.exec(markdown);
	if (!match) {
		return { yaml: "", body: markdown, data: {} };
	}
	const yaml = match[1] ?? "";
	const body = markdown.slice(match[0].length);
	const parsed = parseYaml(yaml);
	const data =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	return { yaml, body, data };
}

/**
 * Normalise one Obsidian tag token (strip leading `#`, collapse spaces).
 */
export function normalisePeTag(raw: string): string {
	return raw.trim().replace(/^#/, "").replace(/\s+/g, "-");
}

function readExistingTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is string => typeof item === "string")
			.map(normalisePeTag)
			.filter((item) => item.length > 0);
	}
	if (typeof value === "string" && value.trim()) {
		return value
			.split(/[\s,]+/)
			.map(normalisePeTag)
			.filter((item) => item.length > 0);
	}
	return [];
}

function projectIdForTags(data: Record<string, unknown>): string | null {
	if (typeof data.project_id === "string" && data.project_id.trim()) {
		return data.project_id.trim();
	}
	if (data.pe_type === "project" && typeof data.id === "string" && data.id.trim()) {
		return data.id.trim();
	}
	return null;
}

/**
 * Build the standard Obsidian `tags` list for a Projects Engine note.
 *
 * Always includes {@link PE_PLUGIN_TAG} and the `pe_type`. When a project id
 * is known, also adds nested `pe/<id>` for Graph / Bases filters. Optional
 * extras cover register/document kinds. Existing tags are preserved.
 */
export function peNoteTags(args: {
	peType: string;
	projectId?: string | null;
	extras?: readonly string[];
	existing?: unknown;
}): string[] {
	const seen = new Set<string>();
	const push = (raw: string): void => {
		const token = normalisePeTag(raw);
		if (token) {
			seen.add(token);
		}
	};
	for (const tag of readExistingTags(args.existing)) {
		push(tag);
	}
	push(PE_PLUGIN_TAG);
	push(args.peType);
	const projectId = args.projectId?.trim();
	if (projectId) {
		push(`pe/${normalisePeTag(projectId.toLowerCase())}`);
	}
	for (const extra of args.extras ?? []) {
		push(extra);
	}
	return [...seen];
}

/**
 * Ensure `tags` on any frontmatter that declares `pe_type`.
 *
 * Idempotent: safe on every {@link buildMarkdownNote} write (create + patch).
 */
export function ensurePeFrontmatterTags(
	data: Record<string, unknown>,
): Record<string, unknown> {
	const peType = typeof data.pe_type === "string" ? data.pe_type.trim() : "";
	if (!peType) {
		return data;
	}
	const extras: string[] = [];
	if (typeof data.register_kind === "string" && data.register_kind.trim()) {
		extras.push(data.register_kind.trim());
	}
	if (typeof data.document_kind === "string" && data.document_kind.trim()) {
		extras.push(data.document_kind.trim());
	}
	return {
		...data,
		tags: peNoteTags({
			peType,
			projectId: projectIdForTags(data),
			extras,
			existing: data.tags,
		}),
	};
}

/**
 * Build a Markdown document from a JSON-compatible frontmatter object and body.
 *
 * @param data - Keys should already be snake_case YAML names.
 * @param body - Markdown after the closing fence.
 * @remarks When `pe_type` is set, {@link ensurePeFrontmatterTags} injects Obsidian `tags`.
 */
export function buildMarkdownNote(data: Record<string, unknown>, body: string): string {
	const enriched = ensurePeFrontmatterTags(data);
	const yaml = stringifyYaml(enriched).trimEnd();
	const trimmedBody = body.replace(/^\s+/, "");
	return `---\n${yaml}\n---\n\n${trimmedBody}`;
}

/**
 * Wikilink list rendered in the note body so Graph View always clusters
 * entities even on Obsidian versions that do not index YAML links.
 */
export function buildGraphLinksSection(links: { label: string; wikiLink: string }[]): string {
	if (links.length === 0) {
		return "";
	}
	const lines = ["## Links", ""];
	for (const item of links) {
		lines.push(`- ${item.label}: ${item.wikiLink}`);
	}
	lines.push("");
	return lines.join("\n");
}
