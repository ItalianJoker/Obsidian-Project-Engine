/**
 * Dynamic custom-field renderer for entity create/edit forms.
 *
 * Renders every {@link CustomFieldSchema} for a given entity kind and collects
 * values into a {@link CustomFieldMap} persisted under YAML `custom_fields`.
 * Touch targets meet the 44×44px mobile guideline.
 */

import type { App } from "obsidian";
import type {
	CustomFieldEntityKind,
	CustomFieldMap,
	CustomFieldSchema,
	CustomFieldValue,
	WikiLink,
} from "../models/types";
import { toWikiLink } from "../models/types";
import { isValidHttpUrl } from "../services/urls";
import { EntitySuggest, type EntitySuggestion } from "./suggest";
import type { IndexedEntity } from "../engine/Indexer";

/**
 * Callbacks required to bind person-type fields to the entity indexer.
 */
export interface CustomFieldsFormOptions {
	/** Active Obsidian app (needed for AbstractInputSuggest). */
	app: App;
	/** Schemas filtered to the target entity kind. */
	schemas: CustomFieldSchema[];
	/** Initial values (edit mode) or defaults. */
	initial: CustomFieldMap;
	/** Team-member catalogue for `person` fields. */
	listPeople: () => IndexedEntity[];
	/** Register a suggest instance so the parent modal can close it. */
	registerSuggest?: (suggest: EntitySuggest) => void;
}

/**
 * Mutable bag of field values owned by the form.
 */
export interface CustomFieldsFormState {
	/** Current values keyed by schema id. */
	values: CustomFieldMap;
	/**
	 * Validate required fields and type constraints.
	 * @returns English error messages (empty when valid).
	 */
	validate: () => string[];
	/** Snapshot suitable for YAML `custom_fields`. */
	toMap: () => CustomFieldMap;
}

/**
 * Mount dynamic field controls into `container` and return a live state handle.
 *
 * @param container - Parent element (usually a modal section).
 * @param options - Schemas, initial values, and person picker.
 */
export function mountCustomFieldsForm(
	container: HTMLElement,
	options: CustomFieldsFormOptions,
): CustomFieldsFormState {
	const values: CustomFieldMap = {};
	for (const schema of options.schemas) {
		const existing = options.initial[schema.id];
		values[schema.id] =
			existing !== undefined ? cloneValue(existing) : cloneValue(schema.defaultValue);
	}

	if (options.schemas.length === 0) {
		return {
			values,
			validate: () => [],
			toMap: () => ({}),
		};
	}

	container.createEl("h3", { text: "Custom fields", cls: "pe-section-title" });

	for (const schema of options.schemas) {
		renderField(container, schema, values, options);
	}

	return {
		values,
		validate: () => validateCustomFields(options.schemas, values),
		toMap: () => {
			const out: CustomFieldMap = {};
			for (const schema of options.schemas) {
				out[schema.id] = cloneValue(values[schema.id] ?? schema.defaultValue);
			}
			return out;
		},
	};
}

/**
 * Filter plugin schemas down to one entity kind.
 */
export function schemasForEntity(
	all: readonly CustomFieldSchema[],
	entity: CustomFieldEntityKind,
): CustomFieldSchema[] {
	return all.filter((schema) => schema.entity === entity);
}

/**
 * Validate a value map against schemas (required + type checks).
 */
export function validateCustomFields(
	schemas: readonly CustomFieldSchema[],
	values: CustomFieldMap,
): string[] {
	const errors: string[] = [];
	for (const schema of schemas) {
		const value = values[schema.id];
		if (schema.required && isEmptyValue(schema.type, value)) {
			errors.push(`${schema.name} is required`);
			continue;
		}
		if (value == null || value === "") {
			continue;
		}
		if (schema.type === "number" && typeof value === "number" && !Number.isFinite(value)) {
			errors.push(`${schema.name} must be a valid number`);
		}
		if (schema.type === "url" && typeof value === "string" && value.trim() && !isValidHttpUrl(value)) {
			errors.push(`${schema.name} must be a valid http(s) URL`);
		}
		if (schema.type === "date" && typeof value === "string" && value.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			errors.push(`${schema.name} must be YYYY-MM-DD`);
		}
	}
	return errors;
}

function renderField(
	container: HTMLElement,
	schema: CustomFieldSchema,
	values: CustomFieldMap,
	options: CustomFieldsFormOptions,
): void {
	const wrap = container.createDiv({ cls: "pe-field" });
	const labelText = schema.required ? `${schema.name} *` : schema.name;
	wrap.createEl("label", { text: labelText, cls: "pe-label" });
	if (schema.description) {
		wrap.createEl("p", { text: schema.description, cls: "pe-help" });
	}

	switch (schema.type) {
		case "text":
			mountText(wrap, schema, values, "text");
			break;
		case "url":
			mountText(wrap, schema, values, "url");
			break;
		case "number":
			mountNumber(wrap, schema, values);
			break;
		case "date":
			mountText(wrap, schema, values, "date");
			break;
		case "checkbox":
			mountCheckbox(wrap, schema, values);
			break;
		case "select":
			mountSelect(wrap, schema, values, false);
			break;
		case "multi-select":
			mountMultiSelect(wrap, schema, values);
			break;
		case "person":
			mountPerson(wrap, schema, values, options);
			break;
		default:
			mountText(wrap, schema, values, "text");
	}
}

function mountText(
	wrap: HTMLElement,
	schema: CustomFieldSchema,
	values: CustomFieldMap,
	inputType: string,
): void {
	const input = wrap.createEl("input", {
		cls: "pe-input pe-touch-target",
		attr: { type: inputType, spellcheck: "false" },
	});
	const current = values[schema.id];
	input.value = typeof current === "string" || typeof current === "number" ? String(current) : "";
	input.addEventListener("input", () => {
		values[schema.id] = input.value;
	});
}

function mountNumber(wrap: HTMLElement, schema: CustomFieldSchema, values: CustomFieldMap): void {
	const input = wrap.createEl("input", {
		cls: "pe-input pe-touch-target",
		attr: { type: "number", spellcheck: "false" },
	});
	const current = values[schema.id];
	input.value = typeof current === "number" ? String(current) : typeof current === "string" ? current : "";
	input.addEventListener("input", () => {
		const parsed = Number.parseFloat(input.value);
		values[schema.id] = input.value.trim() === "" ? null : Number.isFinite(parsed) ? parsed : null;
	});
}

function mountCheckbox(wrap: HTMLElement, schema: CustomFieldSchema, values: CustomFieldMap): void {
	const label = wrap.createEl("label", { cls: "pe-check-label pe-touch-target" });
	const input = label.createEl("input", { attr: { type: "checkbox" } });
	input.checked = values[schema.id] === true;
	label.createSpan({ text: schema.name });
	input.addEventListener("change", () => {
		values[schema.id] = input.checked;
	});
}

function mountSelect(
	wrap: HTMLElement,
	schema: CustomFieldSchema,
	values: CustomFieldMap,
	_multi: boolean,
): void {
	const select = wrap.createEl("select", { cls: "pe-input pe-touch-target" });
	select.createEl("option", { text: "—", attr: { value: "" } });
	for (const option of schema.options) {
		select.createEl("option", { text: option.label, attr: { value: option.id } });
	}
	const current = values[schema.id];
	select.value = typeof current === "string" ? current : "";
	select.addEventListener("change", () => {
		values[schema.id] = select.value;
	});
}

function mountMultiSelect(
	wrap: HTMLElement,
	schema: CustomFieldSchema,
	values: CustomFieldMap,
): void {
	const selected = new Set<string>(
		Array.isArray(values[schema.id])
			? (values[schema.id] as string[])
			: typeof values[schema.id] === "string" && values[schema.id]
				? [values[schema.id] as string]
				: [],
	);
	const list = wrap.createDiv({ cls: "pe-multi-select" });
	const sync = (): void => {
		values[schema.id] = [...selected];
	};
	for (const option of schema.options) {
		const row = list.createEl("label", { cls: "pe-check-label pe-touch-target" });
		const input = row.createEl("input", { attr: { type: "checkbox" } });
		input.checked = selected.has(option.id);
		row.createSpan({ text: option.label });
		input.addEventListener("change", () => {
			if (input.checked) {
				selected.add(option.id);
			} else {
				selected.delete(option.id);
			}
			sync();
		});
	}
	sync();
}

function mountPerson(
	wrap: HTMLElement,
	schema: CustomFieldSchema,
	values: CustomFieldMap,
	options: CustomFieldsFormOptions,
): void {
	const input = wrap.createEl("input", {
		cls: "pe-input pe-touch-target",
		attr: { type: "text", placeholder: "Search team member…", spellcheck: "false" },
	});
	const current = values[schema.id];
	input.value =
		typeof current === "string"
			? current.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0] ?? ""
			: "";

	const apply = (name: string): void => {
		const trimmed = name.trim();
		values[schema.id] = trimmed ? (toWikiLink(trimmed) as WikiLink) : "";
		input.value = trimmed;
	};

	const suggest = new EntitySuggest(
		options.app,
		input,
		options.listPeople,
		(suggestion: EntitySuggestion) => {
			const name = suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
			apply(name);
		},
		true,
	);
	options.registerSuggest?.(suggest);
	input.addEventListener("input", () => apply(input.value));
}

function isEmptyValue(
	type: CustomFieldSchema["type"],
	value: CustomFieldValue | undefined,
): boolean {
	if (value == null) {
		return true;
	}
	if (type === "checkbox") {
		return false;
	}
	if (type === "multi-select") {
		return !Array.isArray(value) || value.length === 0;
	}
	if (typeof value === "string") {
		return value.trim().length === 0;
	}
	return false;
}

function cloneValue(value: CustomFieldValue): CustomFieldValue {
	if (Array.isArray(value)) {
		return [...value];
	}
	return value;
}
