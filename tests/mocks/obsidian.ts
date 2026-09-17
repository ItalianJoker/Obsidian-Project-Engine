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
 * Not a full YAML parser — only covers flat string/number/boolean maps used in tests.
 */
export function parseYaml(yaml: string): unknown {
	const result: Record<string, unknown> = {};
	for (const line of yaml.split(/\r?\n/)) {
		const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
		if (!match) continue;
		const key = match[1]!;
		const raw = match[2]!;
		if (raw === "true") result[key] = true;
		else if (raw === "false") result[key] = false;
		else if (/^-?\d+(\.\d+)?$/.test(raw)) result[key] = Number(raw);
		else if (
			(raw.startsWith('"') && raw.endsWith('"')) ||
			(raw.startsWith("'") && raw.endsWith("'"))
		) {
			result[key] = raw.slice(1, -1);
		} else {
			result[key] = raw;
		}
	}
	return result;
}

export function stringifyYaml(data: Record<string, unknown>): string {
	return Object.entries(data)
		.map(([key, value]) => {
			if (typeof value === "string") {
				return `${key}: "${value}"`;
			}
			return `${key}: ${String(value)}`;
		})
		.join("\n");
}
