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
 * Supports flat scalars, string arrays, and simple object arrays (block form).
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
			const items: unknown[] = [];
			while (i + 1 < lines.length) {
				const next = lines[i + 1] ?? "";
				const itemMatch = /^(\s*)-\s+(.*)$/.exec(next);
				if (!itemMatch) break;
				i += 1;
				const indent = itemMatch[1]!.length;
				const rest = itemMatch[2]!.trim();
				// Object list item: `- title: Foo` then nested `key: value` lines
				const objKey = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(rest);
				if (objKey) {
					const obj: Record<string, unknown> = {
						[objKey[1]!]: coerceScalar(objKey[2]!.trim()),
					};
					while (i + 1 < lines.length) {
						const nested = lines[i + 1] ?? "";
						const nestedMatch = /^(\s+)([A-Za-z0-9_]+):\s*(.*)$/.exec(nested);
						if (!nestedMatch || nestedMatch[1]!.length <= indent) break;
						// Nested list under this object (e.g. children:)
						if (nestedMatch[3]!.trim() === "") {
							i += 1;
							const childIndent = nestedMatch[1]!.length;
							const children: unknown[] = [];
							while (i + 1 < lines.length) {
								const childLine = lines[i + 1] ?? "";
								const childItem = /^(\s*)-\s+(.*)$/.exec(childLine);
								if (!childItem || childItem[1]!.length <= childIndent) break;
								i += 1;
								const cRest = childItem[2]!.trim();
								const cKey = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(cRest);
								if (cKey) {
									const childObj: Record<string, unknown> = {
										[cKey[1]!]: coerceScalar(cKey[2]!.trim()),
									};
									while (i + 1 < lines.length) {
										const more = lines[i + 1] ?? "";
										const moreMatch = /^(\s+)([A-Za-z0-9_]+):\s*(.*)$/.exec(more);
										if (!moreMatch || moreMatch[1]!.length <= childItem[1]!.length) {
											break;
										}
										i += 1;
										childObj[moreMatch[2]!] = coerceScalar(moreMatch[3]!.trim());
									}
									children.push(childObj);
								} else {
									children.push(unquote(cRest));
								}
							}
							obj[nestedMatch[2]!] = children;
						} else {
							i += 1;
							obj[nestedMatch[2]!] = coerceScalar(nestedMatch[3]!.trim());
						}
					}
					items.push(obj);
				} else {
					items.push(unquote(rest));
				}
			}
			result[key] = items;
			continue;
		}
		result[key] = coerceScalar(raw);
	}
	return result;
}

function coerceScalar(raw: string): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (raw === "null" || raw === "~") return null;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
	return unquote(raw);
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

function formatYamlValue(value: unknown, indent = 0): string {
	const pad = "  ".repeat(indent);
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
			return `\n${value.map((item) => `${pad}  - ${JSON.stringify(item)}`).join("\n")}`;
		}
		if (value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
			const blocks = value.map((item) => {
				const obj = item as Record<string, unknown>;
				const entries = Object.entries(obj);
				if (entries.length === 0) {
					return `${pad}  - {}`;
				}
				const [firstKey, firstVal] = entries[0]!;
				const head = `${pad}  - ${firstKey}: ${formatInlineOrBlock(firstVal, indent + 2)}`;
				const rest = entries.slice(1).map(([k, v]) => {
					const formatted = formatInlineOrBlock(v, indent + 2);
					if (formatted.startsWith("\n")) {
						return `${pad}    ${k}:${formatted}`;
					}
					return `${pad}    ${k}: ${formatted}`;
				});
				return [head, ...rest].join("\n");
			});
			return `\n${blocks.join("\n")}`;
		}
		return JSON.stringify(value);
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return JSON.stringify(String(value));
}

function formatInlineOrBlock(value: unknown, indent: number): string {
	if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
		return formatYamlValue(value, indent);
	}
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		return formatYamlValue(value, indent);
	}
	return formatYamlValue(value, indent);
}

export function stringifyYaml(data: Record<string, unknown>): string {
	return Object.entries(data)
		.map(([key, value]) => {
			const formatted = formatYamlValue(value, 0);
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
