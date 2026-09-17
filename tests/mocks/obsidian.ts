/**
 * Minimal Obsidian API stub for unit tests.
 * Only the symbols imported by pure-ish services need to exist.
 */

export class TFile {
	path = "";
	basename = "";
	extension = "md";
}

export class TFolder {
	path = "";
	children: unknown[] = [];
}

export type App = Record<string, unknown>;
export type Vault = Record<string, unknown>;
export type ObsidianProtocolData = Record<string, string>;

export class Notice {
	constructor(public message: string) {}
}

export class AbstractInputSuggest<T> {
	constructor(
		public app: App,
		public inputEl: unknown,
	) {}
	protected getSuggestions(_query: string): T[] {
		return [];
	}
	renderSuggestion(_value: T, _el: HTMLElement): void {}
	selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
}

/**
 * Naive YAML round-trip sufficient for frontmatter helper tests.
 * Supports flat scalars plus simple string arrays (block `- item` form).
 */
export function parseYaml(yaml: string): unknown {
	const result: Record<string, unknown> = {};
	const lines = yaml.split(/\r?\n/);
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trimEnd());
		if (!match) continue;
		const key = match[1]!;
		const raw = match[2]!;
		if (raw === "" || raw === "[]") {
			const items: string[] = [];
			while (i + 1 < lines.length) {
				const next = lines[i + 1] ?? "";
				const item = /^\s*-\s+(.*)$/.exec(next);
				if (!item) break;
				i += 1;
				items.push(unquote(item[1]!.trim()));
			}
			result[key] = items;
			continue;
		}
		if (raw === "true") result[key] = true;
		else if (raw === "false") result[key] = false;
		else if (raw === "null" || raw === "~") result[key] = null;
		else if (/^-?\d+(\.\d+)?$/.test(raw)) result[key] = Number(raw);
		else result[key] = unquote(raw);
	}
	return result;
}

function unquote(raw: string): string {
	if (
		(raw.startsWith('"') && raw.endsWith('"')) ||
		(raw.startsWith("'") && raw.endsWith("'"))
	) {
		return raw.slice(1, -1);
	}
	return raw;
}

function formatYamlValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "null";
	}
	if (typeof value === "boolean" || typeof value === "number") {
		return String(value);
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return "[]";
		}
		if (value.every((item) => typeof item === "string")) {
			return `\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}`;
		}
		return JSON.stringify(value);
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return JSON.stringify(String(value));
}

export function stringifyYaml(data: Record<string, unknown>): string {
	return Object.entries(data)
		.map(([key, value]) => {
			const formatted = formatYamlValue(value);
			if (formatted.startsWith("\n")) {
				return `${key}:${formatted}`;
			}
			return `${key}: ${formatted}`;
		})
		.join("\n");
}

/** Stub Lucide registry for modules that call {@link getIconIds}. */
export function getIconIds(): string[] {
	return ["clipboard-list", "folder", "rocket", "briefcase", "home"];
}

/** No-op icon injector for node tests. */
export function setIcon(_parent: HTMLElement, _iconId: string): void {}

export function getIcon(_iconId: string): null {
	return null;
}
