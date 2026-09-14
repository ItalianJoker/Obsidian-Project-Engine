/**
 * Frontmatter serialisation helpers.
 *
 * Uses Obsidian's `stringifyYaml` / `parseYaml` (browser-safe) rather than
 * Node `js-yaml` or `fs`. Wikilinks are stored as quoted YAML strings so
 * Graph View and the link indexer keep resolving `[[Note]]` targets.
 */

import { parseYaml, stringifyYaml } from "obsidian";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

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
 * Build a Markdown document from a JSON-compatible frontmatter object and body.
 *
 * @param data - Keys should already be snake_case YAML names.
 * @param body - Markdown after the closing fence.
 */
export function buildMarkdownNote(data: Record<string, unknown>, body: string): string {
	const yaml = stringifyYaml(data).trimEnd();
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
