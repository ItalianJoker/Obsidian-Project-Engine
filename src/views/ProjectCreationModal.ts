/**
 * Touch-friendly project creation wizard.
 *
 * Collects the v1.0.0 required fields, validates them, and writes an
 * Entity-as-a-Note Markdown file whose YAML stores Obsidian wikilinks.
 * Content is persisted exclusively through `vault.process` (via
 * {@link writeNoteAtomic}) to stay safe under Obsidian Sync and iCloud.
 */

import { Modal, Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	defaultProjectStatusId,
	toWikiLink,
	type EntityType,
	type GovernanceModel,
	type ProjectTeamAssignment,
} from "../models/types";
import { buildGraphLinksSection, buildMarkdownNote } from "../services/frontmatter";
import { appendEntityLink } from "../services/linkSync";
import { nextAvailableProjectId } from "../services/projectId";
import { isValidHttpUrl, isValidTeamsChannelUrl, openExternalUrl } from "../services/urls";
import { joinVaultPath, noteExists, sanitiseNoteBasename, writeNoteAtomic } from "../services/vaultIo";
import { projectNotePath } from "../services/projectPaths";
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON } from "../models/types";
import { loadProjectRows } from "./projectRows";
import { EntitySuggest, type EntitySuggestion } from "./suggest";

interface TeamChip {
	name: string;
	role: string;
}

/**
 * Wizard row for a stakeholder. `linkToCustomer` writes the customer wikilink
 * both ways (stakeholder.customer + customer.stakeholders) in addition to the
 * project-level `stakeholders` list.
 */
interface StakeholderChip {
	name: string;
	linkToCustomer: boolean;
}

interface CreationForm {
	id: string;
	name: string;
	governance: GovernanceModel;
	customer: string;
	projectType: string;
	technologies: string[];
	team: TeamChip[];
	stakeholders: StakeholderChip[];
	workOrders: string[];
	assignedDays: string;
	projectUrl: string;
	teamsChannelUrl: string;
	icon: string;
	color: string;
	parentProjectId: string;
}

/**
 * Interactive, mobile-ready project creation modal.
 */
export class ProjectCreationModal extends Modal {
	private form: CreationForm;
	private errorEl: HTMLElement | null = null;
	private readonly suggests: EntitySuggest[] = [];
	/** Counter to persist after a successful create (accounts for collision skips). */
	private nextCounter = 1;

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(app);
		this.form = this.emptyForm();
		this.modalEl.addClass("projects-engine-modal");
	}

	override onOpen(): void {
		this.plugin.indexer.rebuild();
		this.form = this.emptyForm();
		this.allocateId();
		this.render();
	}

	override onClose(): void {
		for (const suggest of this.suggests) {
			suggest.close();
		}
		this.suggests.length = 0;
		this.contentEl.empty();
	}

	private emptyForm(): CreationForm {
		return {
			id: "",
			name: "",
			governance: "Semplificato",
			customer: "",
			projectType: "",
			technologies: [],
			team: [],
			stakeholders: [],
			workOrders: [],
			assignedDays: "",
			projectUrl: "",
			teamsChannelUrl: "",
			icon: DEFAULT_PROJECT_ICON,
			color: DEFAULT_PROJECT_COLOR,
			parentProjectId: "",
		};
	}

	private allocateId(): void {
		const allocated = nextAvailableProjectId(
			this.plugin.settings.projectIdPattern,
			this.plugin.settings.projectIdCounter,
			(id) => this.plugin.indexer.hasProjectId(id),
		);
		this.form.id = allocated.id;
		this.nextCounter = allocated.nextCounter;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");

		contentEl.createEl("h2", { text: "Create project" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: "Fields marked * are required. Wikilinks are stored in frontmatter so Graph View can cluster entities.",
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		this.addIdField();

		this.addTextField("Project name *", "Identifying title", (value) => {
			this.form.name = value;
		});

		this.addIconColorFields();
		this.addParentProjectField();

		this.addGovernanceToggle();

		this.addEntityPicker("Customer *", "customer", (name) => {
			this.form.customer = name;
		});

		this.addEntityPicker("Project type *", "project-type", (name) => {
			this.form.projectType = name;
		});

		this.addMultiEntityPicker(
			"Project technologies",
			"technology",
			() => this.form.technologies,
			(next) => {
				this.form.technologies = next;
			},
		);

		this.addTeamPicker();
		this.addStakeholderPicker();
		this.addWorkOrderChips();

		this.addTextField(
			"Budget (giornate) *",
			`Management days (1 g = ${this.plugin.settings.hoursPerManday} h)`,
			(value) => {
				this.form.assignedDays = value;
			},
			"number",
		);

		this.addTextField("Project URL", "Issue tracker or documentation", (value) => {
			this.form.projectUrl = value;
		}, "url");

		this.addTeamsField();
		this.addActions();
	}

	/**
	 * Editable project ID with uniqueness validation (pattern default still applied).
	 */
	private addIdField(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Project ID *", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Auto-generated from Settings pattern; editable. Must be unique.",
		});
		const row = wrap.createDiv({ cls: "pe-inline-row" });
		const input = row.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", spellcheck: "false", "aria-label": "Project ID" },
		});
		input.value = this.form.id;
		input.addEventListener("input", () => {
			this.form.id = input.value.trim();
		});
		const regen = row.createEl("button", {
			text: "Regenerate",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		regen.addEventListener("click", () => {
			this.allocateId();
			input.value = this.form.id;
		});
	}

	private addIconColorFields(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field pe-field-row" });
		const iconField = wrap.createDiv({ cls: "pe-field" });
		iconField.createEl("label", { text: "Icon", cls: "pe-label" });
		iconField.createEl("p", {
			cls: "pe-help",
			text: "Obsidian / Lucide icon id (example: clipboard-list, folder, rocket).",
		});
		const iconInput = iconField.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", spellcheck: "false", placeholder: DEFAULT_PROJECT_ICON },
		});
		iconInput.value = this.form.icon;
		iconInput.addEventListener("input", () => {
			this.form.icon = iconInput.value.trim() || DEFAULT_PROJECT_ICON;
		});

		const colorField = wrap.createDiv({ cls: "pe-field" });
		colorField.createEl("label", { text: "Color", cls: "pe-label" });
		const colorInput = colorField.createEl("input", {
			cls: "pe-touch-target",
			attr: { type: "color", "aria-label": "Project colour" },
		});
		colorInput.value = this.form.color || DEFAULT_PROJECT_COLOR;
		colorInput.addEventListener("input", () => {
			this.form.color = colorInput.value;
		});
	}

	private addParentProjectField(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Parent project", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Optional. Leave empty for a top-level project.",
		});
		const select = wrap.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { "aria-label": "Parent project" },
		});
		select.createEl("option", { text: "— None —", attr: { value: "" } });
		for (const row of loadProjectRows(this.app)) {
			select.createEl("option", {
				text: `${row.id} — ${row.name}`,
				attr: { value: row.id },
			});
		}
		select.value = this.form.parentProjectId;
		select.addEventListener("change", () => {
			this.form.parentProjectId = select.value;
		});
	}

	private addTextField(
		label: string,
		placeholder: string,
		onChange: (value: string) => void,
		inputType: string = "text",
	): HTMLInputElement {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: inputType, placeholder, spellcheck: "false" },
		});
		input.addEventListener("input", () => onChange(input.value));
		return input;
	}

	private addGovernanceToggle(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Governance model *", cls: "pe-label" });
		const group = wrap.createDiv({ cls: "pe-segmented", attr: { role: "radiogroup" } });

		const makeButton = (model: GovernanceModel): void => {
			const button = group.createEl("button", {
				text: model,
				cls: "pe-segment pe-touch-target",
				attr: { type: "button", "aria-pressed": String(this.form.governance === model) },
			});
			if (this.form.governance === model) {
				button.addClass("is-active");
			}
			button.addEventListener("click", () => {
				this.form.governance = model;
				group.findAll(".pe-segment").forEach((el) => {
					el.removeClass("is-active");
					el.setAttr("aria-pressed", "false");
				});
				button.addClass("is-active");
				button.setAttr("aria-pressed", "true");
			});
		};

		makeButton("Semplificato");
		makeButton("PRINCE2");
	}

	private addEntityPicker(
		label: string,
		type: "customer" | "project-type",
		onPick: (name: string) => void,
	): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search or create…", spellcheck: "false" },
		});
		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list(type),
			(suggestion) => {
				const name = suggestionName(suggestion);
				input.value = name;
				onPick(name);
			},
		);
		this.suggests.push(suggest);
		input.addEventListener("input", () => onPick(input.value.trim()));
	}

	private addMultiEntityPicker(
		label: string,
		type: "technology" | "team-member",
		getValues: () => string[],
		setValues: (next: string[]) => void,
	): HTMLElement {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		const chips = wrap.createDiv({ cls: "pe-chip-row" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search and add…", spellcheck: "false" },
		});

		const renderChips = (): void => {
			chips.empty();
			for (const name of getValues()) {
				this.renderChip(chips, name, () => {
					setValues(getValues().filter((item) => item !== name));
					renderChips();
				});
			}
		};

		const addName = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed) {
				return;
			}
			if (!getValues().includes(trimmed)) {
				setValues([...getValues(), trimmed]);
			}
			input.value = "";
			renderChips();
		};

		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list(type),
			(suggestion) => addName(suggestionName(suggestion)),
		);
		this.suggests.push(suggest);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addName(input.value);
			}
		});
		renderChips();
		return wrap;
	}

	private addTeamPicker(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Team members", cls: "pe-label" });
		const list = wrap.createDiv({ cls: "pe-team-list" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search people and add…", spellcheck: "false" },
		});

		const renderTeam = (): void => {
			list.empty();
			this.form.team.forEach((member, index) => {
				const row = list.createDiv({ cls: "pe-team-row" });
				row.createEl("span", { text: member.name, cls: "pe-chip-label" });
				const role = row.createEl("input", {
					cls: "pe-input pe-role-input pe-touch-target",
					attr: { type: "text", placeholder: "Role (optional)" },
				});
				role.value = member.role;
				role.addEventListener("input", () => {
					const current = this.form.team[index];
					if (current) {
						current.role = role.value;
					}
				});
				const remove = row.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button", "aria-label": `Remove ${member.name}` },
				});
				remove.addEventListener("click", () => {
					this.form.team = this.form.team.filter((_, i) => i !== index);
					renderTeam();
				});
			});
		};

		const addMember = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed || this.form.team.some((member) => member.name === trimmed)) {
				return;
			}
			this.form.team.push({ name: trimmed, role: "" });
			input.value = "";
			renderTeam();
		};

		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list("team-member"),
			(suggestion) => addMember(suggestionName(suggestion)),
		);
		this.suggests.push(suggest);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addMember(input.value);
			}
		});
		renderTeam();
	}

	/**
	 * Multi-select fuzzy picker for Stakeholder notes.
	 * Each chip can also associate the stakeholder with the selected Customer.
	 */
	private addStakeholderPicker(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Stakeholders", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Link to this project. Optionally also link to the customer (both-ways wikilinks for Graph View).",
		});
		const list = wrap.createDiv({ cls: "pe-team-list" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search stakeholders and add…", spellcheck: "false" },
		});

		const renderRows = (): void => {
			list.empty();
			this.form.stakeholders.forEach((item, index) => {
				const row = list.createDiv({ cls: "pe-team-row" });
				row.createEl("span", { text: item.name, cls: "pe-chip-label" });
				const checkWrap = row.createEl("label", { cls: "pe-check-label pe-touch-target" });
				const checkbox = checkWrap.createEl("input", {
					attr: { type: "checkbox" },
				});
				checkbox.checked = item.linkToCustomer;
				checkWrap.createSpan({ text: "Also link to customer" });
				checkbox.addEventListener("change", () => {
					const current = this.form.stakeholders[index];
					if (current) {
						current.linkToCustomer = checkbox.checked;
					}
				});
				const remove = row.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button", "aria-label": `Remove ${item.name}` },
				});
				remove.addEventListener("click", () => {
					this.form.stakeholders = this.form.stakeholders.filter((_, i) => i !== index);
					renderRows();
				});
			});
		};

		const addStakeholder = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed || this.form.stakeholders.some((item) => item.name === trimmed)) {
				return;
			}
			this.form.stakeholders.push({ name: trimmed, linkToCustomer: true });
			input.value = "";
			renderRows();
		};

		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list("stakeholder"),
			(suggestion) => addStakeholder(suggestionName(suggestion)),
		);
		this.suggests.push(suggest);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addStakeholder(input.value);
			}
		});
		renderRows();
	}

	private addWorkOrderChips(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Work orders (Commesse)", cls: "pe-label" });
		const chips = wrap.createDiv({ cls: "pe-chip-row" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "COM-2026-01 — Enter or comma to add", spellcheck: "false" },
		});

		const renderChips = (): void => {
			chips.empty();
			for (const code of this.form.workOrders) {
				this.renderChip(chips, code, () => {
					this.form.workOrders = this.form.workOrders.filter((item) => item !== code);
					renderChips();
				});
			}
		};

		const addCodes = (raw: string): void => {
			const parts = raw
				.split(/[,;]/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0);
			for (const part of parts) {
				if (!this.form.workOrders.includes(part)) {
					this.form.workOrders.push(part);
				}
			}
			input.value = "";
			renderChips();
		};

		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === ",") {
				event.preventDefault();
				addCodes(input.value);
			}
		});
		input.addEventListener("blur", () => {
			if (input.value.trim()) {
				addCodes(input.value);
			}
		});
		renderChips();
	}

	private addTeamsField(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Teams channel URL", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "https://teams.microsoft.com/... or msteams:// deep link. Rendered as a quick-launch button.",
		});
		const row = wrap.createDiv({ cls: "pe-inline-row" });
		const input = row.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				type: "url",
				placeholder: "https://teams.microsoft.com/l/channel/…",
				spellcheck: "false",
			},
		});
		const launch = row.createEl("button", {
			text: "Open",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		launch.disabled = true;
		input.addEventListener("input", () => {
			this.form.teamsChannelUrl = input.value;
			launch.disabled = !isValidTeamsChannelUrl(input.value);
		});
		launch.addEventListener("click", () => {
			if (isValidTeamsChannelUrl(this.form.teamsChannelUrl)) {
				openExternalUrl(this.form.teamsChannelUrl.trim());
			}
		});
	}

	private addActions(): void {
		const row = this.contentEl.createDiv({ cls: "pe-actions" });
		const cancel = row.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());

		const submit = row.createEl("button", {
			text: "Create project",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		submit.addEventListener("click", () => {
			void this.submit();
		});
	}

	private renderChip(parent: HTMLElement, label: string, onRemove: () => void): void {
		const chip = parent.createDiv({ cls: "pe-chip" });
		chip.createEl("span", { text: label, cls: "pe-chip-label" });
		const remove = chip.createEl("button", {
			text: "×",
			cls: "pe-chip-remove pe-touch-target",
			attr: { type: "button", "aria-label": `Remove ${label}` },
		});
		remove.addEventListener("click", onRemove);
	}

	/**
	 * Validate the form, persist the project note, and bump the ID counter.
	 */
	private async submit(): Promise<void> {
		const errors = this.validate();
		this.showErrors(errors);
		if (errors.length > 0) {
			new Notice(errors[0] ?? "Please fix the highlighted fields");
			return;
		}

		try {
			await this.ensureEntityNotes();
			this.plugin.indexer.rebuild();
			const id = this.form.id.trim();
			if (this.plugin.indexer.hasProjectId(id)) {
				throw new Error(`Project ID “${id}” is already in use`);
			}
			const file = await this.writeProjectNote();
			await this.linkStakeholdersBothWays(file);
			await this.plugin.afterProjectCreated(
				file,
				this.form.governance,
				id,
				this.form.name.trim(),
			);
			this.plugin.settings.projectIdCounter = this.nextCounter;
			await this.plugin.saveSettings();
			this.plugin.indexer.rebuild();
			new Notice(`Created project ${id}`);
			this.close();
			await this.plugin.router.openProjectLink(file.path);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not create project: ${message}`);
			this.showErrors([message]);
		}
	}

	/**
	 * Return English validation messages. Empty array means the form is ready.
	 */
	private validate(): string[] {
		const errors: string[] = [];
		const id = this.form.id.trim();
		if (!id) {
			errors.push("Project ID is required");
		} else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
			errors.push(
				"Project ID may only contain letters, numbers, dots, underscores, and hyphens",
			);
		} else {
			this.plugin.indexer.rebuild();
			if (this.plugin.indexer.hasProjectId(id)) {
				errors.push(`Project ID “${id}” is already in use`);
			}
		}
		if (!this.form.name.trim()) {
			errors.push("Project name is required");
		}
		if (this.form.governance !== "Semplificato" && this.form.governance !== "PRINCE2") {
			errors.push("Governance model is required");
		}
		if (!this.form.customer.trim()) {
			errors.push("Customer is required");
		}
		if (!this.form.projectType.trim()) {
			errors.push("Project type is required");
		}
		const days = Number.parseFloat(this.form.assignedDays);
		if (!Number.isFinite(days) || days < 0) {
			errors.push("Budget (giornate) must be a number greater than or equal to 0");
		}
		if (this.form.projectUrl.trim() && !isValidHttpUrl(this.form.projectUrl)) {
			errors.push("Project URL must be a valid http(s) URL");
		}
		if (this.form.teamsChannelUrl.trim() && !isValidTeamsChannelUrl(this.form.teamsChannelUrl)) {
			errors.push("Teams channel must be a teams.microsoft.com / teams.live.com URL or an msteams:// deep link");
		}
		if (
			this.form.parentProjectId &&
			this.form.parentProjectId === this.form.id.trim()
		) {
			errors.push("Parent project cannot be the same as this project");
		}
		return errors;
	}

	private showErrors(errors: string[]): void {
		if (!this.errorEl) {
			return;
		}
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

	/**
	 * Create missing Customer / Type / Technology / Person / Stakeholder notes so wikilinks resolve.
	 */
	private async ensureEntityNotes(): Promise<void> {
		const settings = this.plugin.settings;
		await this.ensureOne("customer", this.form.customer, settings.customersFolder);
		await this.ensureOne("project-type", this.form.projectType, settings.projectTypesFolder);
		for (const tech of this.form.technologies) {
			await this.ensureOne("technology", tech, settings.technologiesFolder);
		}
		for (const member of this.form.team) {
			await this.ensureOne("team-member", member.name, settings.teamMembersFolder);
		}
		for (const stakeholder of this.form.stakeholders) {
			await this.ensureOne("stakeholder", stakeholder.name, settings.stakeholdersFolder);
		}
	}

	private async ensureOne(
		peType: "customer" | "project-type" | "technology" | "team-member" | "stakeholder",
		name: string,
		folder: string,
	): Promise<void> {
		const basename = sanitiseNoteBasename(name);
		if (!basename) {
			return;
		}
		const existing = this.plugin.indexer.list(peType).some(
			(item) => item.name.toLowerCase() === basename.toLowerCase(),
		);
		if (existing) {
			return;
		}
		const path = joinVaultPath(folder, `${basename}.md`);
		if (noteExists(this.app.vault, path)) {
			return;
		}
		const markdown = buildMarkdownNote(
			{
				pe_type: peType,
				name: basename,
			},
			`# ${basename}\n`,
		);
		await writeNoteAtomic(this.app.vault, path, markdown);
	}

	/**
	 * Compose YAML + body and write through vault.process.
	 */
	private async writeProjectNote(): Promise<TFile> {
		const now = new Date().toISOString();
		const customer = toWikiLink(this.form.customer.trim());
		const projectType = toWikiLink(this.form.projectType.trim());
		const technologies = this.form.technologies.map((name) => toWikiLink(name));
		const team: ProjectTeamAssignment[] = this.form.team.map((member) => ({
			member: toWikiLink(member.name),
			role: member.role.trim() || undefined,
		}));
		const stakeholders = this.form.stakeholders.map((item) => toWikiLink(item.name));
		const assignedDays = Number.parseFloat(this.form.assignedDays);

		const frontmatter: Record<string, unknown> = {
			pe_type: "project",
			id: this.form.id.trim(),
			name: this.form.name.trim(),
			governance: this.form.governance,
			status: defaultProjectStatusId(this.plugin.settings.projectStatuses),
			icon: this.form.icon.trim() || DEFAULT_PROJECT_ICON,
			color: this.form.color.trim() || DEFAULT_PROJECT_COLOR,
			parent_project: this.form.parentProjectId.trim() || null,
			customer,
			project_type: projectType,
			technologies,
			team: team.map((item) => {
				const row: Record<string, string> = { member: item.member };
				if (item.role) {
					row.role = item.role;
				}
				return row;
			}),
			stakeholders,
			work_orders: this.form.workOrders,
			assigned_days: assignedDays,
			actual_days: 0,
			project_url: this.form.projectUrl.trim(),
			teams_channel_url: this.form.teamsChannelUrl.trim(),
			created: now,
			updated: now,
		};

		const graphLinks = buildGraphLinksSection([
			{ label: "Customer", wikiLink: customer },
			{ label: "Type", wikiLink: projectType },
			...technologies.map((wikiLink) => ({ label: "Technology", wikiLink })),
			...team.map((item) => ({ label: "Team", wikiLink: item.member })),
			...stakeholders.map((wikiLink) => ({ label: "Stakeholder", wikiLink })),
		]);

		const teamsBlock = this.form.teamsChannelUrl.trim()
			? `## Teams\n\n[Open Teams channel](${this.form.teamsChannelUrl.trim()})\n\n`
			: "";

		const body = [
			`# ${this.form.name.trim()}`,
			"",
			teamsBlock,
			graphLinks,
			this.form.governance === "PRINCE2" ? prince2Template() : semplificatoTemplate(),
		].join("\n");

		const markdown = buildMarkdownNote(frontmatter, body);
		const path = projectNotePath(
			this.plugin.settings.projectsFolder,
			this.form.id.trim(),
			this.form.name.trim(),
		);
		if (noteExists(this.app.vault, path)) {
			throw new Error(`A note already exists at ${path}`);
		}
		return writeNoteAtomic(this.app.vault, path, markdown);
	}

	/**
	 * Write reverse wikilinks so Graph View clusters stakeholders with the
	 * project and, when requested, with the customer (both directions).
	 */
	private async linkStakeholdersBothWays(projectFile: TFile): Promise<void> {
		if (this.form.stakeholders.length === 0) {
			return;
		}
		this.plugin.indexer.rebuild();
		const projectLink = toWikiLink(projectFile.basename);
		const customerName = sanitiseNoteBasename(this.form.customer.trim());
		const customerFile = this.resolveEntityFile(
			"customer",
			customerName,
			this.plugin.settings.customersFolder,
		);

		for (const item of this.form.stakeholders) {
			const stakeholderFile = this.resolveEntityFile(
				"stakeholder",
				item.name,
				this.plugin.settings.stakeholdersFolder,
			);
			if (!stakeholderFile) {
				continue;
			}
			await appendEntityLink(
				this.app.vault,
				stakeholderFile,
				"projects",
				projectLink,
				"Project",
				"list",
			);
			if (item.linkToCustomer && customerFile && customerName) {
				const customerLink = toWikiLink(customerFile.basename);
				await appendEntityLink(
					this.app.vault,
					stakeholderFile,
					"customer",
					customerLink,
					"Customer",
					"scalar",
				);
				await appendEntityLink(
					this.app.vault,
					customerFile,
					"stakeholders",
					toWikiLink(stakeholderFile.basename),
					"Stakeholder",
					"list",
				);
			}
		}
	}

	/**
	 * Resolve an Entity-as-a-Note file by indexed name, then by configured folder path.
	 */
	private resolveEntityFile(type: EntityType, name: string, folder: string): TFile | null {
		const basename = sanitiseNoteBasename(name);
		if (!basename) {
			return null;
		}
		const indexed = this.plugin.indexer
			.list(type)
			.find((item) => item.name.toLowerCase() === basename.toLowerCase());
		if (indexed) {
			return indexed.file;
		}
		const path = joinVaultPath(folder, `${basename}.md`);
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}
}

function suggestionName(suggestion: EntitySuggestion): string {
	return suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
}

function semplificatoTemplate(): string {
	return [
		"## Semplificato",
		"",
		"Linear operational flow: **Backlog → In Progress → Review → Done**.",
		"",
		"| Status | Notes |",
		"| --- | --- |",
		"| Backlog | |",
		"| In Progress | |",
		"| Review | |",
		"| Done | |",
		"",
		"Track actual days against `assigned_days` using task time logs.",
		"",
	].join("\n");
}

function prince2Template(): string {
	return [
		"## PRINCE2",
		"",
		"Organised by management stages. End-of-stage milestones are formal scheduler blocks.",
		"",
		"### Business Case",
		"",
		"- Summary:",
		"- Reasons:",
		"- Options:",
		"- Expected benefits:",
		"",
		"### Risk Register",
		"",
		"| ID | Description | Probability | Impact | Owner | Status |",
		"| --- | --- | --- | --- | --- | --- |",
		"|  |  |  |  |  | open |",
		"",
		"### Issue & Change Log",
		"",
		"| ID | Type | Description | Status | Decision |",
		"| --- | --- | --- | --- | --- |",
		"|  | issue |  | open |  |",
		"",
		"### Quality Register",
		"",
		"| ID | Product | Method | Reviewer | Result |",
		"| --- | --- | --- | --- | --- |",
		"|  |  |  |  | pending |",
		"",
		"### Work Packages",
		"",
		"- WP-01:",
		"",
	].join("\n");
}
