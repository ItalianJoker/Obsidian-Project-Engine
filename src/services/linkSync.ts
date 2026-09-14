/**
 * Bidirectional wikilink maintenance.
 *
 * Stakeholder association is valid at project level, customer level, or both.
 * Graph View needs the link on *both* notes, so after creating a project we
 * atomically append wikilinks on the stakeholder (and optionally customer)
 * notes through `vault.process` — never `read` + `modify`.
 */

import { TFile, type Vault } from "obsidian";
import { toWikiLink, wikiLinkTarget, type WikiLink } from "../models/types";
import { buildMarkdownNote, splitFrontmatter } from "./frontmatter";

/**
 * Add `wikiLink` to a YAML list or scalar field and to the note body Links section.
 *
 * @param vault - Active vault.
 * @param file - Existing entity note.
 * @param yamlKey - Frontmatter key (`stakeholders`, `projects`, or `customer`).
 * @param wikiLink - Canonical `[[Note]]` to store.
 * @param bodyLabel - Label used in the `## Links` list (example: `"Project"`).
 * @param mode - `list` appends uniquely; `scalar` sets the field when empty (or always if overwrite).
 */
export async function appendEntityLink(
	vault: Vault,
	file: TFile,
	yamlKey: string,
	wikiLink: WikiLink,
	bodyLabel: string,
	mode: "list" | "scalar",
	overwriteScalar = false,
): Promise<void> {
	const link = toWikiLink(wikiLink);
	await vault.process(file, (current) => {
		const { data, body } = splitFrontmatter(current);
		if (mode === "list") {
			data[yamlKey] = appendUniqueWikiLinks(data[yamlKey], link);
		} else {
			const existing = typeof data[yamlKey] === "string" ? data[yamlKey].trim() : "";
			if (!existing || overwriteScalar) {
				data[yamlKey] = link;
			}
		}
		return buildMarkdownNote(data, ensureBodyLink(body, bodyLabel, link));
	});
}

/**
 * Parse a YAML value into a wikilink list and append `link` if the target is new.
 */
export function appendUniqueWikiLinks(raw: unknown, link: WikiLink): WikiLink[] {
	const list: WikiLink[] = [];
	if (typeof raw === "string" && raw.trim()) {
		list.push(toWikiLink(raw));
	} else if (Array.isArray(raw)) {
		for (const item of raw) {
			if (typeof item === "string" && item.trim()) {
				list.push(toWikiLink(item));
			}
		}
	}
	const target = wikiLinkTarget(link);
	if (!list.some((item) => wikiLinkTarget(item).toLowerCase() === target.toLowerCase())) {
		list.push(link);
	}
	return list;
}

/**
 * Ensure `- Label: [[Note]]` appears under `## Links` (creates the section if missing).
 */
export function ensureBodyLink(body: string, label: string, wikiLink: WikiLink): string {
	const line = `- ${label}: ${wikiLink}`;
	if (body.includes(line) || body.includes(wikiLink)) {
		return body;
	}
	const heading = /(^|\n)## Links[ \t]*\n/;
	if (heading.test(body)) {
		return body.replace(heading, (match) => `${match}\n${line}\n`);
	}
	const trimmed = body.replace(/\s+$/, "");
	return `${trimmed}\n\n## Links\n\n${line}\n`;
}
