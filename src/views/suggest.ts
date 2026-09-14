/**
 * Fuzzy autocomplete bound to a text input via Obsidian's AbstractInputSuggest.
 * Touch-friendly: suggestions are large rows; selecting fills the input.
 */

import { AbstractInputSuggest, type App } from "obsidian";
import type { IndexedEntity } from "../engine/Indexer";

/**
 * Score a candidate against a query. Higher is better; `null` means no match.
 *
 * Prefers prefix and substring matches, then subsequence matches so a query
 * like `k8s` can still hit `Kubernetes` if the letters appear in order.
 */
export function fuzzyScore(query: string, text: string): number | null {
	const q = query.trim().toLowerCase();
	const t = text.toLowerCase();
	if (q.length === 0) {
		return 0;
	}
	if (t === q) {
		return 1000;
	}
	const index = t.indexOf(q);
	if (index === 0) {
		return 800 - t.length;
	}
	if (index > 0) {
		return 500 - index;
	}
	let qi = 0;
	let score = 0;
	for (let i = 0; i < t.length && qi < q.length; i += 1) {
		if (t[i] === q[qi]) {
			score += 2;
			qi += 1;
		}
	}
	return qi === q.length ? score : null;
}

/**
 * Suggestion payload: an existing entity note, or "create new" from the query.
 */
export type EntitySuggestion =
	| { kind: "file"; entity: IndexedEntity }
	| { kind: "create"; name: string };

/**
 * Fuzzy suggester over Entity-as-a-Note files of one type.
 */
export class EntitySuggest extends AbstractInputSuggest<EntitySuggestion> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly getItems: () => IndexedEntity[],
		private readonly onChoose: (suggestion: EntitySuggestion) => void,
		private readonly allowCreate = true,
	) {
		super(app, inputEl);
	}

	/**
	 * Filter catalogue notes and optionally append a "Create" row.
	 */
	protected override getSuggestions(query: string): EntitySuggestion[] {
		const items = this.getItems();
		const ranked: EntitySuggestion[] = items
			.map((entity) => ({ entity, score: fuzzyScore(query, entity.name) }))
			.filter((row): row is { entity: IndexedEntity; score: number } => row.score !== null)
			.sort((a, b) => b.score - a.score)
			.slice(0, 25)
			.map((row) => ({ kind: "file" as const, entity: row.entity }));

		const trimmed = query.trim();
		const exact = items.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
		if (this.allowCreate && trimmed.length > 0 && !exact) {
			ranked.push({ kind: "create", name: trimmed });
		}
		return ranked;
	}

	override renderSuggestion(value: EntitySuggestion, el: HTMLElement): void {
		el.addClass("pe-suggest-row");
		if (value.kind === "file") {
			el.setText(value.entity.name);
		} else {
			el.setText(`Create "${value.name}"`);
		}
	}

	override selectSuggestion(value: EntitySuggestion, _evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(value);
		this.close();
	}
}
