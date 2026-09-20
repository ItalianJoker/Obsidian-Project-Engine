/**
 * View Entity Modal — Catalogue and detail viewer for Entity-as-a-Note records.
 *
 * Allows inspecting Customers, Stakeholders, Project types, and Technologies,
 * viewing all properties, relationships (associated projects, stakeholders, customer),
 * custom fields, and quick-jumping into note editing or the Obsidian workspace.
 */

import { Modal, setIcon, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type {
	Customer,
	CustomFieldEntityKind,
	CustomFieldValue,
	ProjectType,
	Stakeholder,
	Technology,
} from "../models/types";
import { openEntityModal } from "./EntityModal";
import { loadProjectRows, type ProjectRow } from "./projectRows";

export interface ViewEntityMeta {
	label: string;
	singular: string;
	plural: string;
	icon: string;
}

export const VIEW_ENTITY_META: Record<CustomFieldEntityKind, ViewEntityMeta> = {
	customer: {
		label: "Customer",
		singular: "Customer",
		plural: "Customers",
		icon: "building",
	},
	stakeholder: {
		label: "Stakeholder",
		singular: "Stakeholder",
		plural: "Stakeholders",
		icon: "user-check",
	},
	"project-type": {
		label: "Type",
		singular: "Project type",
		plural: "Project types",
		icon: "tag",
	},
	"project-technology": {
		label: "Tech",
		singular: "Technology",
		plural: "Technologies",
		icon: "cpu",
	},
};

export const VIEW_ENTITY_KINDS: CustomFieldEntityKind[] = [
	"customer",
	"stakeholder",
	"project-type",
	"project-technology",
];

export class ViewEntityModal extends Modal {
	private currentKind: CustomFieldEntityKind;
	private searchQuery = "";
	private projects: ProjectRow[] = [];
	private listContainerEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
		initialKind: CustomFieldEntityKind = "customer",
	) {
		super(app);
		this.currentKind = initialKind;
		this.modalEl.addClass("projects-engine-modal");
		this.modalEl.addClass("pe-view-entity-modal");
	}

	override onOpen(): void {
		this.plugin.indexer.rebuild();
		this.projects = loadProjectRows(this.app);
		this.render();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("pe-modal-body");
		contentEl.addClass("pe-view-entity-body");

		const header = contentEl.createDiv({ cls: "pe-view-entity-header" });
		const titleRow = header.createDiv({ cls: "pe-view-entity-title-row" });
		titleRow.createEl("h2", { text: "Entity Catalogue", cls: "pe-modal-title" });

		// Segmented tabs to switch between entity kinds
		const tabs = header.createDiv({ cls: "pe-segmented pe-view-entity-tabs" });
		for (const kind of VIEW_ENTITY_KINDS) {
			const meta = VIEW_ENTITY_META[kind];
			const btn = tabs.createEl("button", {
				cls: `pe-segment pe-touch-target ${kind === this.currentKind ? "is-active" : ""}`,
				text: meta.label,
				attr: { type: "button" },
			});
			btn.addEventListener("click", () => {
				if (this.currentKind !== kind) {
					this.currentKind = kind;
					this.searchQuery = "";
					this.render();
				}
			});
		}

		// Controls row: search filter, count badge, + New button
		const meta = VIEW_ENTITY_META[this.currentKind];
		const controls = header.createDiv({ cls: "pe-view-entity-controls" });

		const searchInput = controls.createEl("input", {
			cls: "pe-input pe-touch-target pe-view-entity-search",
			attr: {
				type: "search",
				placeholder: `Search ${meta.plural.toLowerCase()}…`,
				value: this.searchQuery,
				"aria-label": `Search ${meta.plural}`,
			},
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		this.countEl = controls.createSpan({ cls: "pe-view-entity-count" });

		const newBtn = controls.createEl("button", {
			cls: "pe-primary pe-touch-target pe-view-entity-new-btn",
			text: `+ New ${meta.singular}`,
			attr: { type: "button" },
		});
		newBtn.addEventListener("click", () => {
			this.close();
			openEntityModal(this.plugin, this.currentKind);
		});

		// List container
		this.listContainerEl = contentEl.createDiv({ cls: "pe-view-entity-list" });
		this.renderList();
	}

	private renderList(): void {
		if (!this.listContainerEl) return;
		this.listContainerEl.empty();

		const meta = VIEW_ENTITY_META[this.currentKind];
		const query = this.searchQuery.trim().toLowerCase();

		if (this.currentKind === "customer") {
			const all = this.plugin.indexer.getCustomers();
			const filtered = all.filter((item) => {
				if (!query) return true;
				const hay = `${item.name} ${item.stakeholders.join(" ")}`.toLowerCase();
				return hay.includes(query);
			});
			this.updateCount(filtered.length, all.length, meta.plural);
			if (filtered.length === 0) {
				this.renderEmpty(all.length === 0);
				return;
			}
			for (const customer of filtered) {
				this.renderCustomerCard(customer);
			}
		} else if (this.currentKind === "stakeholder") {
			const all = this.plugin.indexer.getStakeholders();
			const filtered = all.filter((item) => {
				if (!query) return true;
				const hay = `${item.name} ${item.email ?? ""} ${item.role ?? ""} ${item.customer ?? ""} ${item.projects.join(" ")}`.toLowerCase();
				return hay.includes(query);
			});
			this.updateCount(filtered.length, all.length, meta.plural);
			if (filtered.length === 0) {
				this.renderEmpty(all.length === 0);
				return;
			}
			for (const stakeholder of filtered) {
				this.renderStakeholderCard(stakeholder);
			}
		} else if (this.currentKind === "project-type") {
			const all = this.plugin.indexer.getProjectTypes();
			const filtered = all.filter((item) => {
				if (!query) return true;
				const hay = `${item.name} ${item.description ?? ""}`.toLowerCase();
				return hay.includes(query);
			});
			this.updateCount(filtered.length, all.length, meta.plural);
			if (filtered.length === 0) {
				this.renderEmpty(all.length === 0);
				return;
			}
			for (const pt of filtered) {
				this.renderProjectTypeCard(pt);
			}
		} else if (this.currentKind === "project-technology") {
			const all = this.plugin.indexer.getTechnologies();
			const filtered = all.filter((item) => {
				if (!query) return true;
				const hay = `${item.name} ${item.description ?? ""}`.toLowerCase();
				return hay.includes(query);
			});
			this.updateCount(filtered.length, all.length, meta.plural);
			if (filtered.length === 0) {
				this.renderEmpty(all.length === 0);
				return;
			}
			for (const tech of filtered) {
				this.renderTechnologyCard(tech);
			}
		}
	}

	private updateCount(shown: number, total: number, plural: string): void {
		if (!this.countEl) return;
		if (shown === total) {
			this.countEl.setText(`${total} ${plural.toLowerCase()}`);
		} else {
			this.countEl.setText(`${shown} of ${total} ${plural.toLowerCase()}`);
		}
	}

	private renderEmpty(noDataAtAll: boolean): void {
		if (!this.listContainerEl) return;
		const meta = VIEW_ENTITY_META[this.currentKind];
		const empty = this.listContainerEl.createDiv({ cls: "pe-empty-state pe-view-entity-empty" });
		if (noDataAtAll) {
			empty.createEl("p", {
				cls: "pe-help",
				text: `No ${meta.plural.toLowerCase()} found in vault.`,
			});
			const createBtn = empty.createEl("button", {
				cls: "pe-primary pe-touch-target",
				text: `+ Create ${meta.singular}`,
				attr: { type: "button" },
			});
			createBtn.addEventListener("click", () => {
				this.close();
				openEntityModal(this.plugin, this.currentKind);
			});
		} else {
			empty.createEl("p", {
				cls: "pe-help",
				text: `No ${meta.plural.toLowerCase()} matching “${this.searchQuery}”.`,
			});
		}
	}

	private renderCustomerCard(customer: Customer): void {
		const card = this.createCardShell(customer.name, customer.filePath, "customer");
		const grid = card.createDiv({ cls: "pe-entity-card-grid" });

		// Stakeholders
		const stkhValues = customer.stakeholders.map((s) => stripWiki(s)).filter(Boolean);
		this.renderFieldBlock(grid, "Stakeholders", stkhValues, (stkhName) => {
			this.currentKind = "stakeholder";
			this.searchQuery = stkhName;
			this.render();
		});

		// Associated projects
		const linkedProjects = this.projects.filter(
			(p) => stripWiki(p.customer).toLowerCase() === customer.name.toLowerCase(),
		);
		this.renderProjectLinksBlock(grid, linkedProjects);

		// Custom fields
		this.renderCustomFieldsBlock(grid, customer.customFields);
	}

	private renderStakeholderCard(stakeholder: Stakeholder): void {
		const card = this.createCardShell(stakeholder.name, stakeholder.filePath, "stakeholder");
		const grid = card.createDiv({ cls: "pe-entity-card-grid" });

		// Email
		this.renderSingleField(grid, "Email", stakeholder.email || "—", !!stakeholder.email);

		// Role
		this.renderSingleField(grid, "Role", stakeholder.role || "—");

		// Customer
		if (stakeholder.customer) {
			const custName = stripWiki(stakeholder.customer);
			this.renderFieldBlock(grid, "Customer", [custName], () => {
				this.currentKind = "customer";
				this.searchQuery = custName;
				this.render();
			});
		} else {
			this.renderSingleField(grid, "Customer", "—");
		}

		// Associated projects (either in stakeholder note projects or referenced in project team/stakeholders)
		const linkedProjects = this.projects.filter((p) => {
			const nameLower = stakeholder.name.toLowerCase();
			const inTeam = p.team.some((t) => stripWiki(t).toLowerCase() === nameLower);
			const inStakeholders = p.stakeholders.some(
				(s) => stripWiki(s).toLowerCase() === nameLower,
			);
			const inStkhProjects = stakeholder.projects.some(
				(sp) => stripWiki(sp).toLowerCase() === p.name.toLowerCase() || stripWiki(sp) === p.id,
			);
			return inTeam || inStakeholders || inStkhProjects;
		});
		this.renderProjectLinksBlock(grid, linkedProjects);

		// Custom fields
		this.renderCustomFieldsBlock(grid, stakeholder.customFields);
	}

	private renderProjectTypeCard(pt: ProjectType): void {
		const card = this.createCardShell(pt.name, pt.filePath, "project-type");
		const grid = card.createDiv({ cls: "pe-entity-card-grid" });

		// Description
		this.renderSingleField(grid, "Description", pt.description || "—", false, true);

		// Associated projects
		const linkedProjects = this.projects.filter(
			(p) => stripWiki(p.projectType).toLowerCase() === pt.name.toLowerCase(),
		);
		this.renderProjectLinksBlock(grid, linkedProjects);

		// Custom fields
		this.renderCustomFieldsBlock(grid, pt.customFields);
	}

	private renderTechnologyCard(tech: Technology): void {
		const card = this.createCardShell(tech.name, tech.filePath, "project-technology");
		const grid = card.createDiv({ cls: "pe-entity-card-grid" });

		// Description
		this.renderSingleField(grid, "Description", tech.description || "—", false, true);

		// Associated projects
		const linkedProjects = this.projects.filter((p) =>
			p.technologies.some((t) => stripWiki(t).toLowerCase() === tech.name.toLowerCase()),
		);
		this.renderProjectLinksBlock(grid, linkedProjects);

		// Custom fields
		this.renderCustomFieldsBlock(grid, tech.customFields);
	}

	private createCardShell(
		name: string,
		filePath: string,
		kind: CustomFieldEntityKind,
	): HTMLElement {
		const card = this.listContainerEl!.createDiv({ cls: "pe-entity-card" });

		const head = card.createDiv({ cls: "pe-entity-card-header" });
		const left = head.createDiv({ cls: "pe-entity-card-title-group" });
		left.createEl("h3", { text: name, cls: "pe-entity-card-title" });
		const badge = left.createSpan({
			text: VIEW_ENTITY_META[kind].singular,
			cls: "pe-entity-chip pe-entity-kind-badge",
		});
		badge.title = filePath;

		const actions = head.createDiv({ cls: "pe-entity-card-actions" });

		const editBtn = actions.createEl("button", {
			cls: "pe-secondary pe-touch-target pe-entity-action-btn",
			attr: { type: "button", title: `Edit ${name}` },
		});
		setIcon(editBtn, "pencil");
		editBtn.createSpan({ text: "Edit" });
		editBtn.addEventListener("click", () => {
			const file = this.resolveFile(filePath);
			this.close();
			openEntityModal(this.plugin, kind, file);
		});

		const openBtn = actions.createEl("button", {
			cls: "pe-secondary pe-touch-target pe-entity-action-btn",
			attr: { type: "button", title: `Open note for ${name}` },
		});
		setIcon(openBtn, "file-text");
		openBtn.createSpan({ text: "Open note" });
		openBtn.addEventListener("click", () => {
			const file = this.resolveFile(filePath);
			if (file) {
				this.close();
				void this.app.workspace.getLeaf(false).openFile(file);
			}
		});

		return card;
	}

	private renderSingleField(
		grid: HTMLElement,
		label: string,
		value: string,
		isMail = false,
		fullWidth = false,
	): void {
		const field = grid.createDiv({
			cls: `pe-entity-card-field ${fullWidth ? "full-width" : ""}`,
		});
		field.createEl("span", { text: label, cls: "pe-entity-card-label" });
		if (isMail && value && value !== "—") {
			const link = field.createEl("a", {
				text: value,
				cls: "pe-entity-card-value pe-entity-link",
				attr: { href: `mailto:${value}` },
			});
			link.addEventListener("click", (e) => e.stopPropagation());
		} else {
			field.createEl("span", { text: value, cls: "pe-entity-card-value" });
		}
	}

	private renderFieldBlock(
		grid: HTMLElement,
		label: string,
		values: string[],
		onChipClick?: (val: string) => void,
	): void {
		const field = grid.createDiv({ cls: "pe-entity-card-field full-width" });
		field.createEl("span", { text: `${label} (${values.length})`, cls: "pe-entity-card-label" });
		if (values.length === 0) {
			field.createEl("span", { text: "—", cls: "pe-entity-card-value" });
			return;
		}
		const chips = field.createDiv({ cls: "pe-entity-chips" });
		for (const val of values) {
			const chip = chips.createSpan({ text: val, cls: "pe-entity-chip pe-clickable-chip" });
			if (onChipClick) {
				chip.addEventListener("click", () => onChipClick(val));
			}
		}
	}

	private renderProjectLinksBlock(grid: HTMLElement, projects: ProjectRow[]): void {
		const field = grid.createDiv({ cls: "pe-entity-card-field full-width" });
		field.createEl("span", {
			text: `Associated projects (${projects.length})`,
			cls: "pe-entity-card-label",
		});
		if (projects.length === 0) {
			field.createEl("span", { text: "—", cls: "pe-entity-card-value" });
			return;
		}
		const chips = field.createDiv({ cls: "pe-entity-chips" });
		for (const project of projects) {
			const chip = chips.createSpan({
				text: `${project.id} ${project.name}`,
				cls: "pe-entity-chip pe-clickable-chip pe-project-chip",
			});
			chip.title = `Open project ${project.name}`;
			chip.addEventListener("click", () => {
				this.close();
				void this.plugin.router.openProjectLink(project.file.path);
			});
		}
	}

	private renderCustomFieldsBlock(
		grid: HTMLElement,
		customFields: Record<string, CustomFieldValue>,
	): void {
		const entries = Object.entries(customFields);
		if (entries.length === 0) return;

		const field = grid.createDiv({ cls: "pe-entity-card-field full-width" });
		field.createEl("span", {
			text: `Custom fields (${entries.length})`,
			cls: "pe-entity-card-label",
		});
		const list = field.createDiv({ cls: "pe-entity-chips" });
		for (const [key, val] of entries) {
			const displayVal = Array.isArray(val) ? val.join(", ") : String(val);
			list.createSpan({
				text: `${key}: ${displayVal}`,
				cls: "pe-entity-chip pe-custom-field-chip",
			});
		}
	}

	private resolveFile(filePath: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			return file;
		}
		return null;
	}
}

function stripWiki(raw: string): string {
	return raw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0]?.trim() ?? "";
}

export function openViewEntityModal(
	plugin: ProjectsEnginePlugin,
	kind: CustomFieldEntityKind = "customer",
): void {
	new ViewEntityModal(plugin.app, plugin, kind).open();
}
