/**
 * Entity-as-a-Note create / edit modal for the five configurable entity kinds.
 *
 * Persists via `vault.process`, applies custom-field schemas, and maintains
 * Stakeholder ↔ Customer / Project wikilinks through {@link appendEntityLink}.
 */

import { Modal, Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type {
	CustomFieldEntityKind,
	CustomFieldMap,
	EntityType,
	WikiLink,
} from "../models/types";
import { toWikiLink } from "../models/types";
import { buildGraphLinksSection, buildMarkdownNote, splitFrontmatter } from "../services/frontmatter";
import { appendEntityLink } from "../services/linkSync";
import {
	ensureFolder,
	joinVaultPath,
	noteExists,
	processNote,
	sanitiseNoteBasename,
	writeNoteAtomic,
} from "../services/vaultIo";
import { mountCustomFieldsForm, schemasForEntity, type CustomFieldsFormState } from "./CustomFieldsForm";
import { EntitySuggest, type EntitySuggestion } from "./suggest";

/**
 * Map settings entity kind ↔ pe_type / folder key.
 */
const ENTITY_META: Record<
	CustomFieldEntityKind,
	{ peType: EntityType; label: string; folderKey: keyof ProjectsEnginePlugin["settings"] }
> = {
	customer: { peType: "customer", label: "Customer", folderKey: "customersFolder" },
	"team-member": { peType: "team-member", label: "Team member", folderKey: "teamMembersFolder" },
	"project-type": { peType: "project-type", label: "Project type", folderKey: "projectTypesFolder" },
	"project-technology": { peType: "technology", label: "Technology", folderKey: "technologiesFolder" },
	stakeholder: { peType: "stakeholder", label: "Stakeholder", folderKey: "stakeholdersFolder" },
};

interface EntityFormState {
	name: string;
	email: string;
	defaultRole: string;
	description: string;
	role: string;
	customer: string;
	projects: string[];
	stakeholders: string[];
}

/**
 * Touch-friendly create/edit modal for Entity-as-a-Note records.
 */
export class EntityModal extends Modal {
	private readonly kind: CustomFieldEntityKind;
	private readonly existing: TFile | null;
	private form: EntityFormState;
	private customFields: CustomFieldsFormState | null = null;
	private readonly suggests: EntitySuggest[] = [];
	private errorEl: HTMLElement | null = null;
	private initialCustom: CustomFieldMap = {};

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		kind: CustomFieldEntityKind,
		existing: TFile | null = null,
	) {
		super(app);
		this.kind = kind;
		this.existing = existing;
		this.form = {
			name: existing?.basename ?? "",
			email: "",
			defaultRole: "",
			description: "",
			role: "",
			customer: "",
			projects: [],
			stakeholders: [],
		};
		this.modalEl.addClass("projects-engine-modal");
	}

	override onOpen(): void {
		void this.bootstrap();
	}

	override onClose(): void {
		for (const suggest of this.suggests) {
			suggest.close();
		}
		this.suggests.length = 0;
		this.contentEl.empty();
	}

	private async bootstrap(): Promise<void> {
		this.plugin.indexer.rebuild();
		if (this.existing) {
			await this.loadExisting();
		}
		this.render();
	}

	private async loadExisting(): Promise<void> {
		if (!this.existing) {
			return;
		}
		const markdown = await this.app.vault.cachedRead(this.existing);
		const { data } = splitFrontmatter(markdown);
		this.form.name = typeof data.name === "string" ? data.name : this.existing.basename;
		this.form.email = typeof data.email === "string" ? data.email : "";
		this.form.defaultRole = typeof data.default_role === "string" ? data.default_role : "";
		this.form.description = typeof data.description === "string" ? data.description : "";
		this.form.role = typeof data.role === "string" ? data.role : "";
		this.form.customer =
			typeof data.customer === "string"
				? data.customer.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0] ?? ""
				: "";
		this.form.projects = readLinkNames(data.projects);
		this.form.stakeholders = readLinkNames(data.stakeholders);
		this.initialCustom =
			data.custom_fields && typeof data.custom_fields === "object" && !Array.isArray(data.custom_fields)
				? (data.custom_fields as CustomFieldMap)
				: {};
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		const meta = ENTITY_META[this.kind];
		contentEl.createEl("h2", {
			text: this.existing ? `Edit ${meta.label}` : `Create ${meta.label}`,
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		this.addText("Name *", this.form.name, (value) => {
			this.form.name = value;
		}, !this.existing);

		if (this.kind === "team-member") {
			this.addText("Email", this.form.email, (value) => {
				this.form.email = value;
			});
			this.addText("Default role", this.form.defaultRole, (value) => {
				this.form.defaultRole = value;
			});
		}

		if (this.kind === "project-type" || this.kind === "project-technology") {
			this.addText("Description", this.form.description, (value) => {
				this.form.description = value;
			});
		}

		if (this.kind === "stakeholder") {
			this.addText("Role", this.form.role, (value) => {
				this.form.role = value;
			});
			this.addCustomerPicker();
			this.addProjectMulti();
		}

		if (this.kind === "customer") {
			this.addStakeholderMulti();
		}

		const schemas = schemasForEntity(this.plugin.settings.customFieldSchemas, this.kind);
		const customSection = contentEl.createDiv({ cls: "pe-custom-fields" });
		this.customFields = mountCustomFieldsForm(customSection, {
			app: this.app,
			schemas,
			initial: this.initialCustom,
			listPeople: () => this.plugin.indexer.list("team-member"),
			dateFormat: this.plugin.settings.dateFormat,
			registerSuggest: (suggest) => this.suggests.push(suggest),
		});

		const actions = contentEl.createDiv({ cls: "pe-actions" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
		const save = actions.createEl("button", {
			text: "Save",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		save.addEventListener("click", () => {
			void this.submit();
		});
	}

	private addText(
		label: string,
		value: string,
		onChange: (value: string) => void,
		editable = true,
	): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", spellcheck: "false" },
		});
		input.value = value;
		input.disabled = !editable;
		input.addEventListener("input", () => onChange(input.value));
	}

	private addCustomerPicker(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Customer (optional)", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Link this stakeholder to a Customer note (both-ways wikilink).",
		});
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search customer…", spellcheck: "false" },
		});
		input.value = this.form.customer;
		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list("customer"),
			(suggestion) => {
				const name = suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
				input.value = name;
				this.form.customer = name;
			},
		);
		this.suggests.push(suggest);
		input.addEventListener("input", () => {
			this.form.customer = input.value.trim();
		});
	}

	private addProjectMulti(): void {
		this.addFreeChipPicker(
			"Projects",
			"Link to one or more projects (project-level association). Type a project note name and press Enter.",
			() => this.form.projects,
			(next) => {
				this.form.projects = next;
			},
		);
	}

	private addStakeholderMulti(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Stakeholders", cls: "pe-label" });
		wrap.createEl("p", {
			text: "Customer-level stakeholder association.",
			cls: "pe-help",
		});
		const chips = wrap.createDiv({ cls: "pe-chip-row" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search and add…", spellcheck: "false" },
		});

		const renderChips = (): void => {
			chips.empty();
			for (const name of this.form.stakeholders) {
				const chip = chips.createDiv({ cls: "pe-chip" });
				chip.createEl("span", { text: name, cls: "pe-chip-label" });
				const remove = chip.createEl("button", {
					text: "×",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button", "aria-label": `Remove ${name}` },
				});
				remove.addEventListener("click", () => {
					this.form.stakeholders = this.form.stakeholders.filter((item) => item !== name);
					renderChips();
				});
			}
		};

		const addName = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed) return;
			if (!this.form.stakeholders.includes(trimmed)) {
				this.form.stakeholders = [...this.form.stakeholders, trimmed];
			}
			input.value = "";
			renderChips();
		};

		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list("stakeholder"),
			(suggestion: EntitySuggestion) => {
				addName(suggestion.kind === "file" ? suggestion.entity.name : suggestion.name);
			},
			true,
		);
		this.suggests.push(suggest);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addName(input.value);
			}
		});
		renderChips();
	}

	/**
	 * Chip input without fuzzy suggest (used for project names typed freely).
	 */
	private addFreeChipPicker(
		label: string,
		help: string,
		getValues: () => string[],
		setValues: (next: string[]) => void,
	): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		wrap.createEl("p", { text: help, cls: "pe-help" });
		const chips = wrap.createDiv({ cls: "pe-chip-row" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Note name — Enter to add", spellcheck: "false" },
		});

		const renderChips = (): void => {
			chips.empty();
			for (const name of getValues()) {
				const chip = chips.createDiv({ cls: "pe-chip" });
				chip.createEl("span", { text: name, cls: "pe-chip-label" });
				const remove = chip.createEl("button", {
					text: "×",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button", "aria-label": `Remove ${name}` },
				});
				remove.addEventListener("click", () => {
					setValues(getValues().filter((item) => item !== name));
					renderChips();
				});
			}
		};

		const addName = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed) return;
			if (!getValues().includes(trimmed)) {
				setValues([...getValues(), trimmed]);
			}
			input.value = "";
			renderChips();
		};

		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addName(input.value);
			}
		});
		renderChips();
	}

	private async submit(): Promise<void> {
		const errors: string[] = [];
		const name = sanitiseNoteBasename(this.form.name);
		if (!name) {
			errors.push("Name is required");
		}
		if (this.customFields) {
			errors.push(...this.customFields.validate());
		}
		this.showErrors(errors);
		if (errors.length > 0) {
			new Notice(errors[0] ?? "Validation failed");
			return;
		}

		try {
			const file = this.existing
				? await this.updateExisting(name)
				: await this.createNew(name);
			await this.syncLinks(file);
			this.plugin.indexer.rebuild();
			new Notice(`Saved ${ENTITY_META[this.kind].label} “${name}”`);
			this.close();
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not save: ${message}`);
			this.showErrors([message]);
		}
	}

	private async createNew(name: string): Promise<TFile> {
		const meta = ENTITY_META[this.kind];
		const folder = String(this.plugin.settings[meta.folderKey]);
		await ensureFolder(this.app.vault, folder);
		const path = joinVaultPath(folder, `${name}.md`);
		if (noteExists(this.app.vault, path)) {
			throw new Error(`A note already exists at ${path}`);
		}
		const markdown = this.buildMarkdown(name);
		return writeNoteAtomic(this.app.vault, path, markdown);
	}

	private async updateExisting(name: string): Promise<TFile> {
		if (!this.existing) {
			throw new Error("No file to update");
		}
		await processNote(this.app.vault, this.existing, () => this.buildMarkdown(name));
		return this.existing;
	}

	private buildMarkdown(name: string): string {
		const meta = ENTITY_META[this.kind];
		const custom = this.customFields?.toMap() ?? {};
		const data: Record<string, unknown> = {
			pe_type: meta.peType,
			name,
			custom_fields: custom,
		};

		const links: { label: string; wikiLink: string }[] = [];

		if (this.kind === "team-member") {
			if (this.form.email.trim()) data.email = this.form.email.trim();
			if (this.form.defaultRole.trim()) data.default_role = this.form.defaultRole.trim();
		}
		if (this.kind === "project-type" || this.kind === "project-technology") {
			if (this.form.description.trim()) data.description = this.form.description.trim();
		}
		if (this.kind === "stakeholder") {
			if (this.form.role.trim()) data.role = this.form.role.trim();
			if (this.form.customer.trim()) {
				const customerLink = toWikiLink(this.form.customer.trim());
				data.customer = customerLink;
				links.push({ label: "Customer", wikiLink: customerLink });
			}
			const projects = this.form.projects.map((item) => toWikiLink(item));
			data.projects = projects;
			for (const wikiLink of projects) {
				links.push({ label: "Project", wikiLink });
			}
		}
		if (this.kind === "customer") {
			const stakeholders = this.form.stakeholders.map((item) => toWikiLink(item));
			data.stakeholders = stakeholders;
			for (const wikiLink of stakeholders) {
				links.push({ label: "Stakeholder", wikiLink });
			}
		}

		const body = [`# ${name}`, "", buildGraphLinksSection(links)].join("\n");
		return buildMarkdownNote(data, body);
	}

	/**
	 * Bidirectional link maintenance for Stakeholder ↔ Customer / Project.
	 */
	private async syncLinks(file: TFile): Promise<void> {
		if (this.kind === "stakeholder") {
			const stakeholderLink = toWikiLink(file.basename);
			if (this.form.customer.trim()) {
				const customerFile = this.resolveByBasename(
					this.form.customer.trim(),
					this.plugin.settings.customersFolder,
				);
				if (customerFile) {
					await appendEntityLink(
						this.app.vault,
						customerFile,
						"stakeholders",
						stakeholderLink,
						"Stakeholder",
						"list",
					);
				}
			}
			for (const projectName of this.form.projects) {
				const projectFile = this.resolveProject(projectName);
				if (projectFile) {
					await appendEntityLink(
						this.app.vault,
						projectFile,
						"stakeholders",
						stakeholderLink,
						"Stakeholder",
						"list",
					);
				}
			}
		}

		if (this.kind === "customer") {
			const customerLink = toWikiLink(file.basename);
			for (const name of this.form.stakeholders) {
				const stakeholderFile = this.resolveByBasename(
					name,
					this.plugin.settings.stakeholdersFolder,
				);
				if (stakeholderFile) {
					await appendEntityLink(
						this.app.vault,
						stakeholderFile,
						"customer",
						customerLink,
						"Customer",
						"scalar",
					);
				}
			}
		}
	}

	private resolveByBasename(name: string, folder: string): TFile | null {
		const basename = sanitiseNoteBasename(name);
		const path = joinVaultPath(folder, `${basename}.md`);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return file;
		}
		return (
			this.app.vault
				.getMarkdownFiles()
				.find((item) => item.basename.toLowerCase() === basename.toLowerCase()) ?? null
		);
	}

	private resolveProject(name: string): TFile | null {
		const basename = sanitiseNoteBasename(name);
		return (
			this.app.vault
				.getMarkdownFiles()
				.find((file) => {
					const pe = this.app.metadataCache.getFileCache(file)?.frontmatter?.pe_type;
					return pe === "project" && file.basename.toLowerCase() === basename.toLowerCase();
				}) ?? null
		);
	}

	private showErrors(errors: string[]): void {
		if (!this.errorEl) return;
		this.errorEl.empty();
		if (errors.length === 0) {
			this.errorEl.hide();
			return;
		}
		this.errorEl.show();
		const list = this.errorEl.createEl("ul");
		for (const error of errors) {
			list.createEl("li", { text: error });
		}
	}
}

function readLinkNames(raw: unknown): string[] {
	const list: string[] = [];
	if (typeof raw === "string" && raw.trim()) {
		list.push(raw);
	} else if (Array.isArray(raw)) {
		for (const item of raw) {
			if (typeof item === "string" && item.trim()) {
				list.push(item);
			}
		}
	}
	return list.map((item) => item.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0]?.trim() ?? "");
}

/**
 * Open the entity modal from commands / portfolio actions.
 */
export function openEntityModal(
	plugin: ProjectsEnginePlugin,
	kind: CustomFieldEntityKind,
	file: TFile | null = null,
): void {
	new EntityModal(plugin.app, plugin, kind, file).open();
}

/**
 * Re-export for settings / portfolio helpers that need the folder map.
 */
export function entityFolder(
	plugin: ProjectsEnginePlugin,
	kind: CustomFieldEntityKind,
): string {
	return String(plugin.settings[ENTITY_META[kind].folderKey]);
}

export type { WikiLink };
