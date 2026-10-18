/**
 * @file ProjectEditor.ts
 * @purpose Mountable Edit Project form (modal or Edit leaf).
 * @dependencies projectIo, projectFlags, linkSync, taskListTemplates, IconPicker
 * @usedBy ProjectEditView, ProjectEditModal, ProjectOverviewView, DashboardView
 *
 * Reuses the creation wizard field patterns (fuzzy pickers, chips) but patches
 * an existing project note via {@link patchProjectFrontmatter} / vault.process.
 *
 * Business rules:
 * - `isNonPM` relabels Budget → Assigned (Days).
 * - `isTechnicalIntervention` hides days input (T&M); overrides Non PM visibility.
 * - Team `role` is loaded from YAML and persisted; Overview shows role badges.
 */

import { Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import {
	DEFAULT_PROJECT_COLOR,
	DEFAULT_PROJECT_ICON,
	defaultProjectStatusId,
	projectStatusLabel,
	toWikiLink,
	wikiLinkTarget,
	type GovernanceModel,
	type ItsmItem,
	type ItsmItemType,
	type ProjectTeamAssignment,
	type EntityType,
} from "../models/types";
import { governanceDisplayLabel } from "../services/governance";
import { appendEntityLink, ensureEntityNote } from "../services/linkSync";
import { patchProjectFrontmatter } from "../services/projectIo";
import {
	budgetDaysFieldLabel,
	nextItsmId,
	serialiseItsmItems,
	showBudgetDaysInput,
	teamMemberDisplayName,
} from "../services/projectFlags";
import {
	applyTaskListTemplate,
	countTemplateTasks,
	loadTaskListTemplate,
	projectTasksFolderHasNotes,
	resolveTaskListTemplateFile,
} from "../services/taskListTemplates";
import {
	deleteProjectFolder,
	notifyProjectDeleted,
} from "../services/projectDelete";
import { isValidHttpUrl, isValidTeamsChannelUrl } from "../services/urls";
import { joinVaultPath, sanitiseNoteBasename } from "../services/vaultIo";
import { ConfirmModal } from "../ui/ConfirmModal";
import { mountIconPicker } from "../ui/IconPicker";
import { withBusy } from "../ui/withBusy";
import { userFacingErrorMessage } from "../services/userFacingErrors";
import { loadActiveProjectRows, type ProjectRow } from "./projectRows";
import { EntitySuggest, type EntitySuggestion } from "./suggest";
import { openTaskListTemplateModal } from "./TaskListTemplateModal";

interface TeamChip {
	name: string;
	role: string;
}

interface StakeholderChip {
	name: string;
	linkToCustomer: boolean;
}

interface EditForm {
	id: string;
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
	isNonPM: boolean;
	isTechnicalIntervention: boolean;
	itsmItems: ItsmItem[];
	projectUrl: string;
	teamsChannelUrl: string;
	icon: string;
	color: string;
	parentProjectId: string;
	/** Optional task-list template basename. */
	taskListTemplate: string;
}

/**
 * Host surface for {@link ProjectEditor} — modal or in-leaf ItemView.
 * Pattern from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) ProjectEditView
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */
export interface ProjectEditorHost {
	surface: "modal" | "tab";
	close: () => void;
}

/**
 * Mountable project editor (PE domain fields: governance, stakeholders, Teams, budget days).
 */
export class ProjectEditor {
	private form!: EditForm;
	/** JSON snapshot of {@link form} after load — used for dirty Cancel confirm. */
	private baselineJson = "";
	private errorEl: HTMLElement | null = null;
	private readonly suggests: EntitySuggest[] = [];
	private rootEl: HTMLElement | null = null;
	/** Mount for budget / T&M field — refreshed in place when flags toggle (no scroll jump). */
	private budgetMountEl: HTMLElement | null = null;
	private readonly app: App;
	private readonly plugin: ProjectsEnginePlugin;
	private readonly project: ProjectRow;
	private readonly host: ProjectEditorHost;
	private readonly onSaved?: () => void;
	private isSubmitting = false;

	constructor(
		app: App,
		plugin: ProjectsEnginePlugin,
		project: ProjectRow,
		host: ProjectEditorHost,
		onSaved?: () => void,
	) {
		this.app = app;
		this.plugin = plugin;
		this.project = project;
		this.host = host;
		this.onSaved = onSaved;
	}

	public get title(): string {
		return this.project.name || "Project";
	}

	public mount(container: HTMLElement): void {
		this.rootEl = container;
		this.plugin.indexer.rebuild();
		this.form = this.formFromRow(this.project);
		this.baselineJson = JSON.stringify(this.form);
		if (this.host.surface === "tab") {
			container.addClass("pe-edit");
		} else {
			container.addClass("pe-modal-body");
		}
		this.render();
	}

	public destroy(): void {
		for (const suggest of this.suggests) {
			suggest.close();
		}
		this.suggests.length = 0;
		this.rootEl?.empty();
		this.rootEl = null;
	}

	private isDirty(): boolean {
		return JSON.stringify(this.form) !== this.baselineJson;
	}

	private closeHost(): void {
		if (!this.isDirty()) {
			this.host.close();
			return;
		}
		new ConfirmModal(this.app, {
			title: "Discard changes?",
			message: "You have unsaved project edits. Discard them and leave?",
			confirmLabel: "Discard",
			dangerous: true,
			onConfirm: () => {
				this.host.close();
			},
		}).open();
	}

	private closeAfterSave(): void {
		this.onSaved?.();
		this.host.close();
	}

	private formFromRow(row: ProjectRow): EditForm {
		const statuses = this.plugin.settings.projectStatuses;
		const status =
			row.status ||
			defaultProjectStatusId(statuses);
		return {
			id: row.id,
			name: row.name,
			governance: row.governance,
			status,
			customer: wikiLinkTarget(row.customer),
			projectType: wikiLinkTarget(row.projectType),
			technologies: row.technologies.map(wikiLinkTarget),
			// Persist role from YAML — never drop to "" unless truly missing.
			team: row.team.map((item) => ({
				name: teamMemberDisplayName(item),
				role: item.role?.trim() ?? "",
			})),
			stakeholders: row.stakeholders.map((name) => ({
				name: wikiLinkTarget(name),
				linkToCustomer: false,
			})),
			workOrders: [...row.commesse],
			assignedDays: String(row.assignedDays),
			isNonPM: row.isNonPM,
			isTechnicalIntervention: row.isTechnicalIntervention,
			itsmItems: row.itsmItems.map((item) => ({ ...item })),
			projectUrl: row.projectUrl,
			teamsChannelUrl: row.teamsChannelUrl,
			icon: row.icon || DEFAULT_PROJECT_ICON,
			color: row.color || DEFAULT_PROJECT_COLOR,
			parentProjectId: row.parentProjectId ?? "",
			taskListTemplate: wikiLinkTarget(row.taskListTemplate),
		};
	}

	private render(): void {
		const contentEl = this.rootEl;
		if (!contentEl) return;
		contentEl.empty();
		if (this.host.surface === "tab") {
			const crumbs = contentEl.createDiv({ cls: "pe-crumbs" });
			const back = crumbs.createEl("button", {
				text: "Overview",
				cls: "pe-link-button pe-touch-target",
				attr: { type: "button" },
			});
			back.addEventListener("click", () => {
				this.closeHost();
			});
			crumbs.createSpan({ text: " / Edit", cls: "pe-help" });
		}
		contentEl.createEl("h2", { text: "Edit project" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: `Days · 1 day = ${this.plugin.settings.hoursPerManday} h. Changing ID or name does not rename the project folder in this version.`,
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		this.addText("Project ID *", this.form.id, (value) => {
			this.form.id = value.trim();
		});
		this.addText("Project name *", this.form.name, (value) => {
			this.form.name = value;
		});
		this.addIconColorFields();
		this.addParentPicker();
		this.addStatusPicker();
		this.addGovernanceToggle();
		this.addProjectFlagToggles();
		this.addTaskListTemplatePicker();
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
		this.addItsmEditor();
		this.addBudgetDaysField();
		this.addText("Project URL", this.form.projectUrl, (value) => {
			this.form.projectUrl = value;
		}, "url");
		this.addText("Teams channel URL", this.form.teamsChannelUrl, (value) => {
			this.form.teamsChannelUrl = value;
		}, "url");

		// Bottom flex footer — no float/fixed/absolute on action buttons.
		const actions = contentEl.createDiv({ cls: "pe-actions pe-form-footer" });
		const cancel = actions.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.closeHost());
		const save = actions.createEl("button", {
			text: "Save project",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		save.addEventListener("click", () => {
			void withBusy(save, "Saving…", () => this.save());
		});
		const applyTpl = actions.createEl("button", {
			text: "Apply template…",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button", title: "Create task notes from the assigned template" },
		});
		applyTpl.addEventListener("click", () => {
			void this.applyTemplate();
		});
		const del = actions.createEl("button", {
			text: "Delete project…",
			cls: "pe-danger pe-touch-target",
			attr: { type: "button" },
		});
		del.addEventListener("click", () => this.confirmDelete());
	}

	/**
	 * Non PM / Technical intervention checkboxes.
	 * Flag changes refresh only the budget mount (preserves scroll position).
	 */
	private addProjectFlagToggles(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field pe-flag-toggles" });
		wrap.createEl("label", { text: "Project flags", cls: "pe-label" });

		const nonPm = wrap.createEl("label", { cls: "pe-check-label pe-touch-target" });
		const nonPmBox = nonPm.createEl("input", { attr: { type: "checkbox" } });
		nonPmBox.checked = this.form.isNonPM;
		nonPm.createSpan({ text: "Non PM" });
		nonPmBox.addEventListener("change", () => {
			this.form.isNonPM = nonPmBox.checked;
			this.refreshBudgetDaysField();
		});

		const tech = wrap.createEl("label", { cls: "pe-check-label pe-touch-target" });
		const techBox = tech.createEl("input", { attr: { type: "checkbox" } });
		techBox.checked = this.form.isTechnicalIntervention;
		tech.createSpan({ text: "Technical intervention" });
		techBox.addEventListener("change", () => {
			this.form.isTechnicalIntervention = techBox.checked;
			this.refreshBudgetDaysField();
		});
	}

	/** Create the budget mount and paint Budget / Assigned / T&M content. */
	private addBudgetDaysField(): void {
		this.budgetMountEl = this.rootEl!.createDiv({ cls: "pe-budget-field-mount" });
		this.paintBudgetDaysField();
	}

	/** Re-paint budget fields in place — does not re-render the whole form (no scroll jump). */
	private refreshBudgetDaysField(): void {
		if (!this.budgetMountEl) {
			return;
		}
		this.paintBudgetDaysField();
	}

	/** Budget / Assigned days — hidden when Technical intervention is on. */
	private paintBudgetDaysField(): void {
		const mount = this.budgetMountEl;
		if (!mount) {
			return;
		}
		mount.empty();
		const flags = {
			isNonPM: this.form.isNonPM,
			isTechnicalIntervention: this.form.isTechnicalIntervention,
		};
		if (!showBudgetDaysInput(flags)) {
			const wrap = mount.createDiv({ cls: "pe-field" });
			wrap.createEl("label", { text: "Effort", cls: "pe-label" });
			wrap.createEl("p", {
				cls: "pe-help",
				text: "Time & Materials (No Budget) — days input is disabled for technical interventions.",
			});
			return;
		}
		const wrap = mount.createDiv({ cls: "pe-field" });
		wrap.createEl("label", {
			text: budgetDaysFieldLabel(flags, true),
			cls: "pe-label",
		});
		wrap.createEl("p", {
			text: `Management days. Equals ${this.plugin.settings.hoursPerManday} hours each.`,
			cls: "pe-help",
		});
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "number", min: "0", spellcheck: "false" },
		});
		input.value = this.form.assignedDays;
		input.addEventListener("input", () => {
			this.form.assignedDays = input.value;
		});
	}

	/** CRUD list for ITSM Ticket / Change / Problem associations. */
	private addItsmEditor(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field pe-itsm-editor" });
		wrap.createEl("label", { text: "ITSM associations", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Link Ticket, Change, or Problem records. ID badges copy to the clipboard on the project Dashboard.",
		});
		const list = wrap.createDiv({ cls: "pe-itsm-list" });

		const render = (): void => {
			list.empty();
			this.form.itsmItems.forEach((item, index) => {
				const card = list.createDiv({ cls: "pe-itsm-card" });
				const typeSelect = card.createEl("select", {
					cls: "pe-input pe-touch-target",
					attr: { "aria-label": "ITSM type" },
				});
				for (const type of ["Ticket", "Change", "Problem"] as ItsmItemType[]) {
					typeSelect.createEl("option", { text: type, attr: { value: type } });
				}
				typeSelect.value = item.type;
				typeSelect.addEventListener("change", () => {
					const current = this.form.itsmItems[index];
					if (current) current.type = typeSelect.value as ItsmItemType;
				});

				const idInput = card.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: { type: "text", placeholder: "ID", "aria-label": "ITSM ID" },
				});
				idInput.value = item.id;
				idInput.addEventListener("input", () => {
					const current = this.form.itsmItems[index];
					if (current) current.id = idInput.value;
				});

				const titleInput = card.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: { type: "text", placeholder: "Title", "aria-label": "ITSM title" },
				});
				titleInput.value = item.title;
				titleInput.addEventListener("input", () => {
					const current = this.form.itsmItems[index];
					if (current) current.title = titleInput.value;
				});

				const descInput = card.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: {
						type: "text",
						placeholder: "Short description",
						"aria-label": "ITSM description",
					},
				});
				descInput.value = item.description;
				descInput.addEventListener("input", () => {
					const current = this.form.itsmItems[index];
					if (current) current.description = descInput.value;
				});

				const remove = card.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.form.itsmItems.splice(index, 1);
					render();
				});
			});
		};

		const addBtn = wrap.createEl("button", {
			text: "+ Add ITSM item",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		addBtn.addEventListener("click", () => {
			this.form.itsmItems.push({
				id: nextItsmId(this.form.itsmItems),
				type: "Ticket",
				title: "",
				description: "",
			});
			render();
		});
		render();
	}

	private addIconColorFields(): void {
		mountIconPicker(this.rootEl!, {
			value: this.form.icon,
			help: "Click an icon to select it. Search filters the grid; press Enter to use a typed id.",
			onChange: (iconId) => {
				this.form.icon = iconId || DEFAULT_PROJECT_ICON;
			},
		});

		const colorField = this.rootEl!.createDiv({ cls: "pe-field" });
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

	private addParentPicker(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Parent project", cls: "pe-label" });
		const select = wrap.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { "aria-label": "Parent project" },
		});
		select.createEl("option", { text: "— None —", attr: { value: "" } });
		for (const row of loadActiveProjectRows(this.app, this.plugin.settings)) {
			if (row.id === this.project.id) continue;
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

	private confirmDelete(): void {
		new ConfirmModal(this.app, {
			title: "Delete project?",
			message: `This will remove the project folder and all plugin-managed contents for “${this.project.name}”. This cannot be undone (unless vault trash can recover it).`,
			confirmLabel: "Delete project",
			dangerous: true,
			onConfirm: async () => {
				const result = await deleteProjectFolder({
					app: this.app,
					vault: this.app.vault,
					projectFile: this.project.file,
					projectsRoot: this.plugin.settings.projectsFolder,
				});
				notifyProjectDeleted(result.deletedPath, result.trashed);
				this.plugin.refreshOpenViews();
				this.closeHost();
				await this.plugin.router.openDashboard();
			},
		}).open();
	}

	/**
	 * Materialise the assigned (or currently selected) template into Tasks/.
	 * Confirms when the folder already has notes to avoid silent duplicates.
	 */
	private async applyTemplate(): Promise<void> {
		const name = this.form.taskListTemplate.trim();
		if (!name) {
			new Notice("Choose a task list template first");
			return;
		}
		const file = resolveTaskListTemplateFile(this.app, this.plugin.settings, name);
		if (!file) {
			new Notice(`Template “${name}” was not found`);
			return;
		}
		const template = await loadTaskListTemplate(this.app, file);
		if (!template || template.tasks.length === 0) {
			new Notice(`Template “${name}” has no tasks`);
			return;
		}

		const run = async (): Promise<void> => {
			// Persist the assignment before apply so YAML stays consistent.
			await patchProjectFrontmatter(this.app.vault, this.project.file, (data) => {
				data.task_list_template = toWikiLink(name);
			});
			const result = await applyTaskListTemplate({
				app: this.app,
				vault: this.app.vault,
				projectFile: this.project.file,
				projectId: this.form.id.trim() || this.project.id,
				projectLink: toWikiLink(this.project.file.basename),
				template,
				settings: this.plugin.settings,
			});
			this.plugin.refreshOpenViews();
			new Notice(
				result.created > 0
					? `Applied template “${template.name}” (${result.created} tasks)`
					: `No tasks created from “${template.name}”`,
			);
		};

		if (projectTasksFolderHasNotes(this.app, this.project.file, this.plugin.settings)) {
			const n = countTemplateTasks(template.tasks);
			new ConfirmModal(this.app, {
				title: "Apply task list template?",
				message: `This project already has notes under Tasks/. Applying “${template.name}” will add ${n} new task notes (existing notes are kept). Continue?`,
				confirmLabel: "Apply template",
				onConfirm: () => run(),
			}).open();
			return;
		}
		await run();
	}

	private addText(
		label: string,
		value: string,
		onChange: (value: string) => void,
		type = "text",
		help?: string,
		min?: string,
	): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		if (help) {
			wrap.createEl("p", { text: help, cls: "pe-help" });
		}
		const attr: Record<string, string> = { type, spellcheck: "false" };
		if (type === "number" && min !== undefined) {
			attr.min = min;
		}
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr,
		});
		input.value = value;
		input.addEventListener("input", () => onChange(input.value));
	}

	private addStatusPicker(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
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
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Governance", cls: "pe-label" });
		const group = wrap.createDiv({ cls: "pe-segmented", attr: { role: "radiogroup" } });
		for (const model of ["Semplificato", "PRINCE2"] as GovernanceModel[]) {
			const button = group.createEl("button", {
				text: governanceDisplayLabel(model),
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

	/**
	 * Assign a task-list template (wikilink on save). Apply separately via
	 * {@link applyTemplate} so existing Tasks/ notes are not overwritten silently.
	 */
	private addTaskListTemplatePicker(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field pe-template-assign" });
		wrap.createEl("label", {
			text: "Assign task list template",
			cls: "pe-label",
		});
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Optional. Create templates in Settings → Task list templates first, then assign here. Save stores the link; click Apply template… to generate task notes under Tasks/.",
		});

		const templates = this.plugin.indexer.list("task-list-template");
		if (templates.length === 0) {
			const empty = wrap.createDiv({ cls: "pe-template-empty" });
			empty.createEl("p", {
				cls: "pe-help",
				text: "No templates yet. Create one in Settings, then return here to assign it.",
			});
			const createBtn = empty.createEl("button", {
				text: "Create template…",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			createBtn.addEventListener("click", () => {
				openTaskListTemplateModal(this.plugin);
			});
		}

		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: {
				type: "text",
				placeholder:
					templates.length === 0
						? "Create a template in Settings first…"
						: "Search and assign a template…",
				spellcheck: "false",
				"aria-label": "Assign task list template",
			},
		});
		input.value = this.form.taskListTemplate;
		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list("task-list-template"),
			(suggestion) => {
				const name = suggestionName(suggestion);
				input.value = name;
				this.form.taskListTemplate = name;
			},
		);
		this.suggests.push(suggest);
		input.addEventListener("input", () => {
			this.form.taskListTemplate = input.value.trim();
		});
	}

	private addEntityPicker(
		label: string,
		type: "customer" | "project-type",
		initial: string,
		onPick: (name: string) => void,
	): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
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
		type: EntityType,
		getValues: () => string[],
		setValues: (next: string[]) => void,
	): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
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
					setValues(getValues().filter((v) => v !== name));
					renderChips();
				});
			}
		};
		const add = (name: string): void => {
			const trimmed = name.trim();
			if (!trimmed || getValues().includes(trimmed)) return;
			setValues([...getValues(), trimmed]);
			input.value = "";
			renderChips();
		};
		this.suggests.push(
			new EntitySuggest(this.app, input, () => this.plugin.indexer.list(type), (s) =>
				add(suggestionName(s)),
			),
		);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				add(input.value);
			}
		});
		renderChips();
	}

	private addTeamEditor(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Team members", cls: "pe-label" });
		const list = wrap.createDiv({ cls: "pe-team-list" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Search people and add…" },
		});
		const render = (): void => {
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
					this.form.team[index] = { name: member.name, role: role.value };
				});
				const remove = row.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.form.team.splice(index, 1);
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

	private addStakeholderEditor(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
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
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Work orders", cls: "pe-label" });
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
		const id = this.form.id.trim();
		if (!id) {
			errors.push("Project ID is required");
		} else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
			errors.push(
				"Project ID may only contain letters, numbers, dots, underscores, and hyphens",
			);
		} else if (id !== this.project.id) {
			this.plugin.indexer.rebuild();
			if (this.plugin.indexer.hasProjectId(id)) {
				errors.push(`Project ID “${id}” is already in use`);
			}
		}
		if (!this.form.name.trim()) errors.push("Project name is required");
		if (!this.form.customer.trim()) errors.push("Customer is required");
		if (!this.form.projectType.trim()) errors.push("Project type is required");
		if (this.form.parentProjectId && this.form.parentProjectId === id) {
			errors.push("Parent project cannot be the same as this project");
		}
		const flags = {
			isNonPM: this.form.isNonPM,
			isTechnicalIntervention: this.form.isTechnicalIntervention,
		};
		if (showBudgetDaysInput(flags)) {
			const days = Number.parseFloat(this.form.assignedDays);
			if (!Number.isFinite(days) || days < 0) {
				errors.push(`${budgetDaysFieldLabel(flags)} must be a number ≥ 0`);
			}
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
		if (this.isSubmitting) {
			return;
		}
		const errors = this.validate();
		this.showErrors(errors);
		if (errors.length > 0) {
			new Notice(errors[0] ?? "Fix the form");
			return;
		}
		this.isSubmitting = true;
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
			const flags = {
				isNonPM: this.form.isNonPM,
				isTechnicalIntervention: this.form.isTechnicalIntervention,
			};
			const assignedDays = showBudgetDaysInput(flags)
				? Number.parseFloat(this.form.assignedDays)
				: 0;
			const itsmItems = this.form.itsmItems
				.map((item) => ({
					id: item.id.trim() || nextItsmId(this.form.itsmItems),
					type: item.type,
					title: item.title.trim(),
					description: item.description.trim(),
				}))
				.filter((item) => item.id || item.title);

			await patchProjectFrontmatter(this.app.vault, this.project.file, (data) => {
				data.id = this.form.id.trim();
				data.name = this.form.name.trim();
				data.governance = this.form.governance;
				data.status = this.form.status;
				data.icon = this.form.icon.trim() || DEFAULT_PROJECT_ICON;
				data.color = this.form.color.trim() || DEFAULT_PROJECT_COLOR;
				data.parent_project = this.form.parentProjectId.trim() || null;
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
				data.assigned_days = Number.isFinite(assignedDays) ? assignedDays : 0;
				data.is_non_pm = this.form.isNonPM;
				data.is_technical_intervention = this.form.isTechnicalIntervention;
				data.itsm_items = serialiseItsmItems(itsmItems);
				data.project_url = this.form.projectUrl.trim();
				data.teams_channel_url = this.form.teamsChannelUrl.trim();
				const templateName = this.form.taskListTemplate.trim();
				if (templateName) {
					data.task_list_template = toWikiLink(templateName);
				} else {
					delete data.task_list_template;
				}
			});

			this.plugin.indexer.rebuild();
			this.plugin.refreshOpenViews();
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
			this.baselineJson = JSON.stringify(this.form);
			new Notice(`Saved ${this.project.id}`);
			this.closeAfterSave();
		} catch (error) {
			console.error(error);
			const message = userFacingErrorMessage(error, "Could not save project");
			new Notice(message);
			this.showErrors([message]);
		} finally {
			this.isSubmitting = false;
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
			await this.ensureOne("stakeholder", member.name, settings.stakeholdersFolder);
		}
		for (const stakeholder of this.form.stakeholders) {
			await this.ensureOne("stakeholder", stakeholder.name, settings.stakeholdersFolder);
		}
	}

	private async ensureOne(
		peType: "customer" | "project-type" | "technology" | "stakeholder",
		name: string,
		folder: string,
	): Promise<void> {
		await ensureEntityNote(this.app.vault, peType, name, folder);
	}
}

function suggestionName(suggestion: EntitySuggestion): string {
	return suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
}
