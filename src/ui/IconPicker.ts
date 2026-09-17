/**
 * Visual Lucide / Obsidian icon picker for project forms.
 *
 * Primary UX is a clickable icon grid (via {@link setIcon} / {@link getIconIds}).
 * A search field filters the grid and lets power users type an exact icon id.
 * The selected value remains the same string icon id stored in project frontmatter.
 */

import { getIconIds, setIcon } from "obsidian";
import { DEFAULT_PROJECT_ICON } from "../models/types";

/** How many icon cells to render per batch (keeps the grid snappy). */
const ICON_BATCH_SIZE = 96;

/**
 * Curated project-friendly icons shown first when the filter is empty.
 * Only ids that exist in the live Obsidian registry are kept at mount time.
 */
const SUGGESTED_ICON_IDS: readonly string[] = [
	"clipboard-list",
	"briefcase",
	"folder",
	"folder-open",
	"rocket",
	"target",
	"flag",
	"star",
	"bookmark",
	"layers",
	"layout-dashboard",
	"kanban",
	"columns",
	"git-fork",
	"table",
	"calendar",
	"check-circle",
	"circle-dot",
	"hammer",
	"wrench",
	"settings",
	"users",
	"user",
	"building",
	"building-2",
	"globe",
	"link",
	"file-text",
	"files",
	"package",
	"boxes",
	"cpu",
	"database",
	"server",
	"cloud",
	"shield",
	"lock",
	"key",
	"zap",
	"flame",
	"heart",
	"sparkles",
	"lightbulb",
	"map",
	"compass",
	"milestone",
	"trophy",
	"award",
	"badge-check",
	"list-checks",
	"list-todo",
	"pen-line",
	"pencil",
	"palette",
	"image",
	"camera",
	"music",
	"code",
	"terminal",
	"bug",
	"bot",
	"mail",
	"phone",
	"message-square",
	"messages-square",
	"bell",
	"alarm-clock",
	"clock",
	"timer",
	"hourglass",
	"trending-up",
	"bar-chart-2",
	"pie-chart",
	"activity",
	"workflow",
	"network",
	"share-2",
	"external-link",
	"home",
	"map-pin",
	"car",
	"plane",
	"ship",
	"bike",
	"leaf",
	"trees",
	"sun",
	"moon",
	"coffee",
	"utensils",
	"gift",
	"shopping-cart",
	"credit-card",
	"wallet",
	"coins",
	"gem",
	"diamond",
];

/**
 * Options for {@link mountIconPicker}.
 */
export interface IconPickerOptions {
	/**
	 * Currently selected Lucide / Obsidian icon id
	 * (example: `clipboard-list`).
	 */
	value: string;
	/**
	 * Invoked whenever the selection changes.
	 * Always receives a non-empty icon id suitable for YAML `icon`.
	 */
	onChange: (iconId: string) => void;
	/** Field label above the picker. Defaults to `"Icon"`. */
	label?: string;
	/** Optional help line under the label. */
	help?: string;
}

/**
 * Mount a labelled visual icon picker into `parent`.
 *
 * Layout:
 * 1. Label (+ optional help)
 * 2. Preview glyph of the current selection
 * 3. Search / filter input (also accepts an exact id on Enter)
 * 4. Scrollable icon grid — click a cell to select
 *
 * @param parent - Container that receives the picker DOM.
 * @param options - Initial value, change handler, and labels.
 * @returns Controllers for tests / advanced hosts (optional).
 */
export function mountIconPicker(
	parent: HTMLElement,
	options: IconPickerOptions,
): { setValue: (iconId: string) => void } {
	const label = options.label ?? "Icon";
	let current = normaliseIconId(options.value) || DEFAULT_PROJECT_ICON;

	const wrap = parent.createDiv({ cls: "pe-field pe-icon-picker" });
	wrap.createEl("label", { text: label, cls: "pe-label" });
	if (options.help) {
		wrap.createEl("p", { cls: "pe-help", text: options.help });
	}

	const header = wrap.createDiv({ cls: "pe-icon-picker-header" });
	const preview = header.createDiv({
		cls: "pe-icon-picker-preview pe-touch-target",
		attr: { role: "img", "aria-label": `Selected icon: ${current}` },
	});
	applyIconSafe(preview, current);

	const search = header.createEl("input", {
		cls: "pe-input pe-touch-target pe-icon-picker-search",
		attr: {
			type: "search",
			spellcheck: "false",
			placeholder: "Search icons or type an id…",
			"aria-label": "Filter icons",
			autocomplete: "off",
		},
	});

	const meta = wrap.createDiv({ cls: "pe-icon-picker-meta" });
	const idLabel = meta.createSpan({ cls: "pe-icon-picker-id" });
	const countLabel = meta.createSpan({ cls: "pe-icon-picker-count" });

	const grid = wrap.createDiv({
		cls: "pe-icon-picker-grid",
		attr: { role: "listbox", "aria-label": "Available icons" },
	});

	const registry = listRegisteredIconIds();
	const registrySet = new Set(registry);
	const suggested = SUGGESTED_ICON_IDS.filter((id) => registrySet.has(id));

	let visibleLimit = ICON_BATCH_SIZE;
	let matches: string[] = [];

	const emit = (iconId: string): void => {
		const next = normaliseIconId(iconId) || DEFAULT_PROJECT_ICON;
		if (next === current) return;
		current = next;
		applyIconSafe(preview, current);
		preview.setAttr("aria-label", `Selected icon: ${current}`);
		idLabel.setText(current);
		options.onChange(current);
		highlightSelection();
	};

	const updateMeta = (): void => {
		idLabel.setText(current);
		const shown = Math.min(visibleLimit, matches.length);
		const noun = matches.length === 1 ? "icon" : "icons";
		countLabel.setText(
			shown < matches.length
				? `${shown} / ${matches.length} ${noun}`
				: `${matches.length} ${noun}`,
		);
	};

	const highlightSelection = (): void => {
		for (const btn of Array.from(grid.querySelectorAll<HTMLButtonElement>(".pe-icon-picker-cell"))) {
			const selected = btn.dataset.iconId === current;
			btn.toggleClass("pe-icon-picker-cell--selected", selected);
			btn.setAttr("aria-selected", selected ? "true" : "false");
		}
	};

	const renderGrid = (): void => {
		grid.empty();
		const slice = matches.slice(0, visibleLimit);
		for (const iconId of slice) {
			const btn = grid.createEl("button", {
				cls: "pe-icon-picker-cell pe-touch-target",
				attr: {
					type: "button",
					role: "option",
					title: iconId,
					"aria-label": iconId,
					"data-icon-id": iconId,
				},
			});
			btn.dataset.iconId = iconId;
			applyIconSafe(btn, iconId);
			btn.addEventListener("click", () => {
				emit(iconId);
				// Keep the typed filter so users can refine further; clear only
				// when they picked from an empty (browse) query.
				if (!search.value.trim()) {
					search.value = "";
				}
			});
		}

		if (visibleLimit < matches.length) {
			const more = grid.createEl("button", {
				cls: "pe-icon-picker-more pe-secondary pe-touch-target",
				text: "Show more",
				attr: { type: "button" },
			});
			more.addEventListener("click", () => {
				visibleLimit = Math.min(visibleLimit + ICON_BATCH_SIZE, matches.length);
				renderGrid();
				updateMeta();
			});
		}

		highlightSelection();
		updateMeta();
	};

	const refreshMatches = (): void => {
		const query = search.value.trim();
		matches = filterIconIds(registry, query, suggested);
		visibleLimit = ICON_BATCH_SIZE;
		renderGrid();
	};

	search.addEventListener("input", () => {
		refreshMatches();
	});

	search.addEventListener("keydown", (evt) => {
		if (evt.key !== "Enter") return;
		evt.preventDefault();
		const typed = normaliseIconId(search.value);
		if (!typed) return;
		if (registrySet.has(typed)) {
			emit(typed);
			return;
		}
		// Accept unknown ids so power users can store custom / future icon names.
		emit(typed);
	});

	refreshMatches();

	return {
		setValue: (iconId: string) => {
			current = normaliseIconId(iconId) || DEFAULT_PROJECT_ICON;
			applyIconSafe(preview, current);
			preview.setAttr("aria-label", `Selected icon: ${current}`);
			highlightSelection();
			updateMeta();
		},
	};
}

/**
 * Trim and lowercase an icon id for stable comparison / storage.
 *
 * @param raw - User or frontmatter value.
 * @returns Normalised id, or empty string when blank.
 */
export function normaliseIconId(raw: string): string {
	return raw.trim().toLowerCase();
}

/**
 * Filter registered icon ids by a free-text query.
 *
 * With an empty query, returns suggested icons first (preserving order),
 * then the remaining registry alphabetically (excluding duplicates).
 * With a non-empty query, returns all matching ids alphabetically.
 *
 * @param registry - Full list from {@link getIconIds} (or a test fixture).
 * @param query - Substring filter (case-insensitive).
 * @param suggested - Preferred ids to surface when browsing.
 */
export function filterIconIds(
	registry: readonly string[],
	query: string,
	suggested: readonly string[] = SUGGESTED_ICON_IDS,
): string[] {
	const q = normaliseIconId(query);
	const registrySet = new Set(registry);
	if (!q) {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const id of suggested) {
			if (!registrySet.has(id) || seen.has(id)) continue;
			seen.add(id);
			out.push(id);
		}
		const rest = registry
			.filter((id) => !seen.has(id))
			.slice()
			.sort((a, b) => a.localeCompare(b, "en"));
		return out.concat(rest);
	}
	return registry
		.filter((id) => id.toLowerCase().includes(q))
		.slice()
		.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Read the live Obsidian icon registry, sorted for stable browsing.
 * Falls back to the curated suggestion list when the API is unavailable
 * (for example under unit-test stubs).
 */
function listRegisteredIconIds(): string[] {
	try {
		const ids = getIconIds();
		if (Array.isArray(ids) && ids.length > 0) {
			return ids
				.map((id) => String(id))
				.filter(Boolean)
				.sort((a, b) => a.localeCompare(b, "en"));
		}
	} catch {
		/* outside Obsidian */
	}
	return SUGGESTED_ICON_IDS.slice();
}

/**
 * Apply {@link setIcon} without throwing when the id is unknown.
 */
function applyIconSafe(el: HTMLElement, iconId: string): void {
	el.empty();
	try {
		setIcon(el, iconId);
	} catch {
		el.setText("◇");
	}
	// setIcon no-ops for unknown ids — leave a simple fallback glyph.
	if (!el.querySelector("svg")) {
		el.setText("◇");
	}
}
