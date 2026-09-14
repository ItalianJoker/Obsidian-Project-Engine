/**
 * Edit Project modal — dotpm-like primary action from Overview.
 *
 * Reuses the creation wizard field patterns (fuzzy pickers, chips) but patches
 * an existing project note via {@link patchProjectFrontmatter} / vault.process.
 */

import { Modal, Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	defaultProjectStatusId,
	projectStatusLabel,
	toWikiLink,
	type GovernanceModel,
	type ProjectTeamAssignment,
} from "../models/types";
import { buildMarkdownNote } from "../services/frontmatter";
import { appendEntityLink } from "../services/linkSync";
import { patchProjectFrontmatter } from "../services/projectIo";
import { isValidHttpUrl, isValidTeamsChannelUrl } from "../services/urls";
import { joinVaultPath, noteExists, sanitiseNoteBasename, writeNoteAtomic } from "../services/vaultIo";
import type { ProjectRow } from "./projectRows";
import { EntitySuggest, type EntitySuggestion } from "./suggest";

interface TeamChip {
	name: string;
	role: string;
}

interface StakeholderChip {
	name: string;
	linkToCustomer: boolean;
}

interface EditForm {
	name: string;
	governance: GovernanceModel;
	status: string;
	customer: string;
	projectType: string;
	technologies: string[];
	team: TeamChip[];
	stakeholders: StakeholderChip[];
	workOrders: string[];
	assignedDays: string;
	projectUrl: string;
	teamsChannelUrl: string;
}

/**
 * Touch-friendly project editor opened from Overview / Dashboard context menu.
 */
export class ProjectEditModal extends Modal {
	private form!: EditForm;
	private errorEl: HTMLElement | null = null;
	private readonly suggests: EntitySuggest[] = [];

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		private readonly project: ProjectRow,
		private readonly onSaved?: () => void,
	) {
		super(app);
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-project-edit-modal");
	}

	override onOpen(): void {
		this.plugin.indexer.rebuild();
		this.form = this.formFromRow(this.project);
		this.render();
	}

	override onClose(): void {
		for (const suggest of this.suggests) {
			suggest.close();
		}
		this.suggests.length = 0;
		this.contentEl.empty();
	}

	private formFromRow(row: ProjectRow): EditForm {
		const statuses = this.plugin.settings.projectStatuses;
		const status =
			row.status ||
			defaultProjectStatusId(statuses);
		return {
			name: row.name,
			governance: row.governance,
			status,
			customer: stripWiki(row.customer),
			projectType: stripWiki(row.projectType),
			technologies: row.technologies.map(stripWiki),
			team: row.team.map((item) => ({ name: stripWiki(item), role: "" })),
			stakeholders: row.stakeholders.map((name) => ({
				name: stripWiki(name),
				linkToCustomer: false,
			})),
			workOrders: [...row.commesse],
			assignedDays: String(row.assignedDays),
			projectUrl: row.projectUrl,
			teamsChannelUrl: row.teamsChannelUrl,
		};
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		contentEl.createEl("h2", { text: "Edit project" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: `${this.project.id} · budget in giornate · 1 giornata = ${this.plugin.settings.hoursPerManday} h`,
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		this.addReadOnly("Project ID", this.project.id);
		this.addText("Project name *", this.form.name, (value) => {
			this.form.name = value;
		});
		this.addStatusPicker();
		this.addGovernanceToggle();
		this.addEntityPicker("Customer *", "customer", this.form.customer, (name) => {
			this.form.customer = name;
		});
		this.addEntityPicker("Project type *", "project-type", this.form.projectType, (name) => {
			this.form.projectType = name;
		});
		this.addChipList(
			"Technologies",
			"technology",
			() => this.form.technologies,
			(next) => {
				this.form.technologies = next;
			},
		);
		this.addTeamEditor();
		this.addStakeholderEditor();
		this.addWorkOrders();
		this.addText(
			"Budget (giornate) *",
			this.form.assignedDays,
			(value) => {
				this.form.assignedDays = value;
			},
			"number",
			`Management budget in days. Equals ${this.plugin.settings.hoursPerManday} hours each.`,
		);
		this.addText("Project URL", this.form.projectUrl, (value) => {
			this.form.projectUrl = value;
		}, "url");
		this.addText("Teams channel URL", this.form.teamsChannelUrl, (value) => {
			this.form.teamsChannelUrl = value;
		}, "url");

		const actions = contentEl.createDiv({ cls: "pe-actions" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
		const save = actions.createEl("button", {
			text: "Save project",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		save.addEventListener("click", () => {
			void this.save();
		});
	}

	private addReadOnly(label: string, value: string): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		wrap.createEl("div", { text: value, cls: "pe-readonly pe-touch-target" });
	}

	private addText(
		label: string,
		value: string,
		onChange: (value: string) => void,
		type = "text",
		help?: string,
	): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		if (help) {
			wrap.createEl("p", { text: help, cls: "pe-help" });
		}
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type, spellcheck: "false" },
		});
		input.value = value;
		input.addEventListener("input", () => onChange(input.value));
	}

	private addStatusPicker(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Status", cls: "pe-label" });
		const select = wrap.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { "aria-label": "Project status" },
		});
		const options = this.plugin.settings.projectStatuses.filter(
			(item) => !item.archived || item.id === this.form.status,
		);
		for (const option of options) {
			select.createEl("option", {
				text: projectStatusLabel(this.plugin.settings.projectStatuses, option.id),
				attr: { value: option.id },
			});
		}
		if (!options.some((item) => item.id === this.form.status)) {
			select.createEl("option", {
				text: this.form.status,
				attr: { value: this.form.status },
			});
		}
		select.value = this.form.status;
		select.addEventListener("change", () => {
			this.form.status = select.value;
		});
	}

	private addGovernanceToggle(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Governance", cls: "pe-label" });
		const group = wrap.createDiv({ cls: "pe-segmented", attr: { role: "radiogroup" } });
		for (const model of ["Semplificato", "PRINCE2"] as GovernanceModel[]) {
			const button = group.createEl("button", {
				text: model,
				cls: `pe-segment pe-touch-target${this.form.governance === model ? " is-active" : ""}`,
				attr: { type: "button", "aria-pressed": String(this.form.governance === model) },
			});
			button.addEventListener("click", () => {
				this.form.governance = model;
				group.findAll(".pe-segment").forEach((el) => {
					el.removeClass("is-active");
					el.setAttr("aria-pressed", "false");
				});
				button.addClass("is-active");
				button.setAttr("aria-pressed", "true");
			});
		}
	}

	private addEntityPicker(
		label: string,
		type: "customer" | "project-type",
		initial: string,
		onPick: (name: string) => void,
	): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search or create…", spellcheck: "false" },
		});
		input.value = initial;
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

	private addChipList(
		label: string,
		type: "technology" | "team-member",
		getValues: () => string[],
		setValues: (next: string[]) => void,
	): void {
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
				const chip = chips.createDiv({ cls: "pe-chip" });
				chip.createSpan({ text: name, cls: "pe-chip-label" });
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
	}

	private addTeamEditor(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Team", cls: "pe-label" });
		const list = wrap.createDiv({ cls: "pe-team-list" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search people…" },
		});
		const render = (): void => {
			list.empty();
			this.form.team.forEach((member, index) => {
				const row = list.createDiv({ cls: "pe-team-row" });
				row.createSpan({ text: member.name, cls: "pe-chip-label" });
				const role = row.createEl("input", {
					cls: "pe-input pe-role-input pe-touch-target",
					attr: { type: "text", placeholder: "Role" },
				});
				role.value = member.role;
				role.addEventListener("input", () => {
					const current = this.form.team[index];
					if (current) current.role = role.value;
				});
				const remove = row.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.form.team = this.form.team.filter((_, i) => i !== index);
					render();
				});
			});
		};
		const add = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed || this.form.team.some((m) => m.name === trimmed)) return;
			this.form.team.push({ name: trimmed, role: "" });
			input.value = "";
			render();
		};
		this.suggests.push(
			new EntitySuggest(this.app, input, () => this.plugin.indexer.list("team-member"), (s) =>
				add(suggestionName(s)),
			),
		);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				add(input.value);
			}
		});
		render();
	}

	private addStakeholderEditor(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Stakeholders", cls: "pe-label" });
		const list = wrap.createDiv({ cls: "pe-team-list" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search stakeholders…" },
		});
		const render = (): void => {
			list.empty();
			this.form.stakeholders.forEach((item, index) => {
				const row = list.createDiv({ cls: "pe-team-row" });
				row.createSpan({ text: item.name, cls: "pe-chip-label" });
				const remove = row.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.form.stakeholders = this.form.stakeholders.filter((_, i) => i !== index);
					render();
				});
			});
		};
		const add = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed || this.form.stakeholders.some((s) => s.name === trimmed)) return;
			this.form.stakeholders.push({ name: trimmed, linkToCustomer: false });
			input.value = "";
			render();
		};
		this.suggests.push(
			new EntitySuggest(this.app, input, () => this.plugin.indexer.list("stakeholder"), (s) =>
				add(suggestionName(s)),
			),
		);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				add(input.value);
			}
		});
		render();
	}

	private addWorkOrders(): void {
		const wrap = this.contentEl.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Commesse / work orders", cls: "pe-label" });
		const chips = wrap.createDiv({ cls: "pe-chip-row" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "COM-2026-01 then Enter" },
		});
		const render = (): void => {
			chips.empty();
			for (const code of this.form.workOrders) {
				const chip = chips.createDiv({ cls: "pe-chip" });
				chip.createSpan({ text: code, cls: "pe-chip-label" });
				const remove = chip.createEl("button", {
					text: "×",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.form.workOrders = this.form.workOrders.filter((item) => item !== code);
					render();
				});
			}
		};
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				const code = input.value.trim();
				if (code && !this.form.workOrders.includes(code)) {
					this.form.workOrders.push(code);
				}
				input.value = "";
				render();
			}
		});
		render();
	}

	private validate(): string[] {
		const errors: string[] = [];
		if (!this.form.name.trim()) errors.push("Project name is required");
		if (!this.form.customer.trim()) errors.push("Customer is required");
		if (!this.form.projectType.trim()) errors.push("Project type is required");
		const days = Number.parseFloat(this.form.assignedDays);
		if (!Number.isFinite(days) || days < 0) {
			errors.push("Budget (giornate) must be a number ≥ 0");
		}
		if (this.form.projectUrl.trim() && !isValidHttpUrl(this.form.projectUrl)) {
			errors.push("Project URL must be a valid http(s) URL");
		}
		if (
			this.form.teamsChannelUrl.trim() &&
			!isValidTeamsChannelUrl(this.form.teamsChannelUrl)
		) {
			errors.push("Teams channel URL is not valid");
		}
		return errors;
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

	private async save(): Promise<void> {
		const errors = this.validate();
		this.showErrors(errors);
		if (errors.length > 0) {
			new Notice(errors[0] ?? "Fix the form");
			return;
		}
		try {
			await this.ensureEntities();
			const customer = toWikiLink(this.form.customer.trim());
			const projectType = toWikiLink(this.form.projectType.trim());
			const technologies = this.form.technologies.map((name) => toWikiLink(name));
			const team: ProjectTeamAssignment[] = this.form.team.map((member) => ({
				member: toWikiLink(member.name),
				role: member.role.trim() || undefined,
			}));
			const stakeholders = this.form.stakeholders.map((item) => toWikiLink(item.name));
			const assignedDays = Number.parseFloat(this.form.assignedDays);

			await patchProjectFrontmatter(this.app.vault, this.project.file, (data) => {
				data.name = this.form.name.trim();
				data.governance = this.form.governance;
				data.status = this.form.status;
				data.customer = customer;
				data.project_type = projectType;
				data.technologies = technologies;
				data.team = team.map((item) => {
					const row: Record<string, string> = { member: item.member };
					if (item.role) row.role = item.role;
					return row;
				});
				data.stakeholders = stakeholders;
				data.work_orders = this.form.workOrders;
				data.assigned_days = assignedDays;
				data.project_url = this.form.projectUrl.trim();
				data.teams_channel_url = this.form.teamsChannelUrl.trim();
			});

			this.plugin.indexer.rebuild();
			const projectLink = toWikiLink(this.project.file.basename);
			for (const item of this.form.stakeholders) {
				const stakeholderFile = this.resolveEntityFile(item.name);
				if (!stakeholderFile) continue;
				await appendEntityLink(
					this.app.vault,
					stakeholderFile,
					"projects",
					projectLink,
					"Project",
					"list",
				);
			}

			this.plugin.indexer.rebuild();
			new Notice(`Saved ${this.project.id}`);
			this.close();
			this.onSaved?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not save: ${message}`);
			this.showErrors([message]);
		}
	}

	private resolveEntityFile(name: string): TFile | null {
		const basename = sanitiseNoteBasename(name);
		if (!basename) return null;
		const indexed = this.plugin.indexer
			.list("stakeholder")
			.find((item) => item.name.toLowerCase() === basename.toLowerCase());
		if (indexed) return indexed.file;
		const path = joinVaultPath(this.plugin.settings.stakeholdersFolder, `${basename}.md`);
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	private async ensureEntities(): Promise<void> {
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
		if (!basename) return;
		const existing = this.plugin.indexer.list(peType).some(
			(item) => item.name.toLowerCase() === basename.toLowerCase(),
		);
		if (existing || noteExists(this.app.vault, joinVaultPath(folder, `${basename}.md`))) {
			return;
		}
		await writeNoteAtomic(
			this.app.vault,
			joinVaultPath(folder, `${basename}.md`),
			buildMarkdownNote({ pe_type: peType, name: basename }, `# ${basename}\n`),
		);
	}
}

function stripWiki(value: string): string {
	return value.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0] ?? "";
}

function suggestionName(suggestion: EntitySuggestion): string {
	return suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
}
