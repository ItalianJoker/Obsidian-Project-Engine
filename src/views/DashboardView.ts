/**
 * Dashboard — project portfolio list (primary entry leaf).
 *
 * Scaffold (toolbar + scrollable content + EmptyState) follows the
 * DashboardView / ProjectListRenderer pattern from
 * [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 *
 * Domain columns (governance, customer, mandays) are Projects Engine original.
 */

import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { GovernanceModel } from "../models/types";
import { projectStatusLabel } from "../models/types";
import { governanceDisplayLabel } from "../services/governance";
import {
	archiveProjectFolder,
	notifyProjectArchived,
	notifyProjectUnarchived,
	reconcileProjectArchivedFlags,
	unarchiveProjectFolder,
} from "../services/projectArchive";
import { containingProjectFolder } from "../services/projectPaths";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmModal } from "../ui/ConfirmModal";
import { openEntityModal } from "./EntityModal";
import { openViewEntityModal } from "./ViewEntityModal";
import { openProjectEditor } from "./ProjectEditView";
import {
	findProjectRow,
	loadActiveProjectRows,
	loadArchivedProjectRows,
	loadProjectRows,
	type ProjectRow,
} from "./projectRows";
import { formatDisplayDate } from "../services/dateFormat";
import {
	budgetMetricLabel,
	formatProjectBudgetDisplay,
} from "../services/projectFlags";
import {
	formatBudgetDaysAndHours,
	formatGiornate,
} from "../services/timeLogs";
import { activateGlobalDashboardView } from "./GlobalDashboardView";

/** Registered ItemView type id. */
export const DASHBOARD_VIEW_TYPE = "projects-engine-dashboard";

/**
 * Leaf listing all `pe_type: project` notes with context menus into Overview / Workspace.
 */
export class DashboardView extends ItemView {
	private projects: ProjectRow[] = [];
	private archivedProjects: ProjectRow[] = [];
	/** Persist expand state across vault reloads / unarchive. */
	private showArchived = false;
	private filterGovernance: "all" | GovernanceModel = "all";
	private filterCustomer = "all";
	private searchText = "";
	private reloadTimer: number | null = null;
	private toolbarEl!: HTMLElement;
	private bodyEl!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Projects";
	}

	override getIcon(): string {
		return "briefcase";
	}

	override async onOpen(): Promise<void> {
		this.containerEl.addClass("pe-view");
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		root.addClass("pe-dashboard");
		this.toolbarEl = root.createDiv({ cls: "pe-toolbar" });
		this.bodyEl = root.createDiv({ cls: "pe-content" });
		this.registerVaultListeners();
		this.reload();
	}

	/**
	 * Public refresh for {@link ProjectsEnginePlugin.refreshOpenViews}.
	 */
	public refresh(): void {
		this.reload();
	}

	override async onClose(): Promise<void> {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.contentEl.empty();
	}

	/**
	 * Debounced reload so vault churn does not thrash the UI thread on mobile.
	 */
	private registerVaultListeners(): void {
		const schedule = (): void => {
			if (this.reloadTimer !== null) {
				window.clearTimeout(this.reloadTimer);
			}
			this.reloadTimer = window.setTimeout(() => {
				this.reloadTimer = null;
				this.reload();
			}, this.plugin.settings.indexerDebounceMs);
		};
		this.registerEvent(this.app.vault.on("create", schedule));
		this.registerEvent(this.app.vault.on("modify", schedule));
		this.registerEvent(this.app.vault.on("delete", schedule));
		this.registerEvent(this.app.vault.on("rename", schedule));
		this.registerEvent(this.app.metadataCache.on("resolved", schedule));
	}

	private reload(): void {
		this.plugin.indexer.rebuild();
		this.projects = loadActiveProjectRows(this.app, this.plugin.settings);
		this.archivedProjects = loadArchivedProjectRows(this.app, this.plugin.settings);
		this.render();
		// Heal stale YAML `archived` after OS / explorer folder moves (debounced via vault events).
		void reconcileProjectArchivedFlags({
			app: this.app,
			settings: this.plugin.settings,
		});
	}

	private visibleRows(): ProjectRow[] {
		return this.projects.filter((row) => {
			if (this.filterGovernance !== "all" && row.governance !== this.filterGovernance) {
				return false;
			}
			if (this.filterCustomer !== "all") {
				const customer = stripWiki(row.customer).toLowerCase();
				if (customer !== this.filterCustomer.toLowerCase()) {
					return false;
				}
			}
			if (!this.searchText) {
				return true;
			}
			const hay = `${row.id} ${row.name} ${row.customer} ${row.status}`.toLowerCase();
			return hay.includes(this.searchText.toLowerCase());
		});
	}

	private render(): void {
		this.renderToolbar();
		this.bodyEl.empty();

		const visible = this.visibleRows();

		if (visible.length === 0) {
			new EmptyState(this.bodyEl)
				.setIcon("◇")
				.setTitle(this.projects.length === 0 ? "No projects yet" : "No matches")
				.setBody(
					this.projects.length === 0
						? "Create a project to start portfolio, governance, and delivery in Markdown."
						: "Try a different search or clear Governance / Customer filters.",
				)
				.setAction("+ new project", () => this.plugin.openCreationModal());
		} else {
			this.renderTable(visible);
			this.renderCards(visible);
		}

		this.renderEntityActions();
		this.renderArchivedSection();
	}

	/**
	 * Entity create shortcuts sit under the project list so the toolbar stays
	 * aligned with the title / filters and left margins match the table.
	 */
	private renderEntityActions(): void {
		const createSection = this.bodyEl.createDiv({ cls: "pe-section pe-dashboard-actions" });
		createSection.createEl("h3", { text: "Create entity", cls: "pe-section-title" });
		const createRow = createSection.createDiv({ cls: "pe-inline-row" });
		this.toolButton(createRow, "Customer", false, () => openEntityModal(this.plugin, "customer"));
		this.toolButton(createRow, "Stakeholder", false, () =>
			openEntityModal(this.plugin, "stakeholder"),
		);
		this.toolButton(createRow, "Type", false, () => openEntityModal(this.plugin, "project-type"));
		this.toolButton(createRow, "Tech", false, () =>
			openEntityModal(this.plugin, "project-technology"),
		);

		const viewSection = this.bodyEl.createDiv({ cls: "pe-section pe-dashboard-actions" });
		viewSection.createEl("h3", { text: "View entity", cls: "pe-section-title" });
		const viewRow = viewSection.createDiv({ cls: "pe-inline-row" });
		this.toolButton(viewRow, "Customer", false, () => openViewEntityModal(this.plugin, "customer"));
		this.toolButton(viewRow, "Stakeholder", false, () =>
			openViewEntityModal(this.plugin, "stakeholder"),
		);
		this.toolButton(viewRow, "Type", false, () => openViewEntityModal(this.plugin, "project-type"));
		this.toolButton(viewRow, "Tech", false, () =>
			openViewEntityModal(this.plugin, "project-technology"),
		);
	}

	private renderToolbar(): void {
		const bar = this.toolbarEl;
		bar.empty();

		const left = bar.createDiv({ cls: "pe-toolbar-left" });
		left.createEl("h2", { text: "Projects", cls: "pe-toolbar-title pe-dashboard-title" });

		const center = bar.createDiv({ cls: "pe-toolbar-center pe-toolbar-filters" });
		const search = center.createEl("input", {
			cls: "pe-toolbar-search pe-touch-target",
			attr: {
				type: "search",
				placeholder: "Search projects…",
				value: this.searchText,
				"aria-label": "Search projects",
			},
		});
		search.value = this.searchText;
		search.addEventListener("input", () => {
			this.searchText = search.value;
			this.bodyEl.empty();
			const visible = this.visibleRows();
			if (visible.length === 0) {
				new EmptyState(this.bodyEl)
					.setTitle("No matches")
					.setBody("Try a different search or clear Governance / Customer filters.");
			} else {
				this.renderTable(visible);
				this.renderCards(visible);
			}
			this.renderEntityActions();
			this.renderArchivedSection();
		});

		const gov = center.createEl("select", {
			cls: "pe-input pe-touch-target pe-toolbar-filter",
			attr: { "aria-label": "Filter by governance" },
		});
		for (const option of [
			{ value: "all", label: "All governance" },
			{ value: "Semplificato", label: governanceDisplayLabel("Semplificato") },
			{ value: "PRINCE2", label: "PRINCE2" },
		]) {
			gov.createEl("option", { text: option.label, attr: { value: option.value } });
		}
		gov.value = this.filterGovernance;
		gov.addEventListener("change", () => {
			this.filterGovernance = gov.value as "all" | GovernanceModel;
			this.render();
		});

		const customers = uniqueCustomers(this.projects);
		const cust = center.createEl("select", {
			cls: "pe-input pe-touch-target pe-toolbar-filter",
			attr: { "aria-label": "Filter by customer" },
		});
		cust.createEl("option", { text: "All customers", attr: { value: "all" } });
		for (const name of customers) {
			cust.createEl("option", { text: name, attr: { value: name } });
		}
		cust.value = this.filterCustomer;
		cust.addEventListener("change", () => {
			this.filterCustomer = cust.value;
			this.render();
		});

		const right = bar.createDiv({ cls: "pe-toolbar-right" });
		this.toolButton(right, "Global Dashboard", false, () => {
			void activateGlobalDashboardView(this.plugin);
		});
		this.toolButton(right, "+ new project", true, () => this.plugin.openCreationModal());
	}

	private toolButton(
		parent: HTMLElement,
		label: string,
		primary: boolean,
		onClick: () => void,
	): void {
		const button = parent.createEl("button", {
			text: label,
			cls: `${primary ? "pe-primary" : "pe-secondary"} pe-touch-target`,
			attr: { type: "button" },
		});
		button.addEventListener("click", onClick);
	}

	private renderTable(rows: ProjectRow[]): void {
		const hoursPer = this.plugin.settings.hoursPerManday;
		const dateFormat = this.plugin.settings.dateFormat;
		const section = this.bodyEl.createDiv({ cls: "pe-section pe-table-section" });
		const table = section.createEl("table", { cls: "pe-table pe-project-list" });
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		for (const label of [
			"ID",
			"Name",
			"Governance",
			"Status",
			"Customer",
			"Budget",
			"Last Update",
			"",
		]) {
			const th = headRow.createEl("th", { text: label });
			if (label === "Last Update") {
				th.addClass("pe-col-last-update");
			}
		}
		const tbody = table.createEl("tbody");
		const fragment = document.createDocumentFragment();
		for (const row of rows) {
			const tr = document.createElement("tr");
			tr.className = "pe-project-row pe-touch-target";
			tr.addEventListener("click", () => {
				void this.plugin.router.openProjectLink(row.file.path);
			});
			tr.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				this.openRowMenu(row, event);
			});
			this.td(tr, "ID", row.id);
			this.td(tr, "Name", row.name);
			this.td(tr, "Governance", governanceDisplayLabel(row.governance));
			const statusTd = tr.createEl("td", { attr: { "data-label": "Status" } });
			const chip = statusTd.createSpan({
				text: projectStatusLabel(this.plugin.settings.projectStatuses, row.status),
				cls: "pe-status-chip",
			});
			const meta = this.plugin.settings.projectStatuses.find((item) => item.id === row.status);
			if (meta?.color) {
				chip.style.setProperty("--pe-status-color", meta.color);
			}
			this.td(tr, "Customer", stripWiki(row.customer));
			const flags = {
				isNonPM: row.isNonPM,
				isTechnicalIntervention: row.isTechnicalIntervention,
			};
			const budgetLabel = budgetMetricLabel(flags);
			const budgetText = formatProjectBudgetDisplay(
				flags,
				formatBudgetDaysAndHours(row.assignedDays, hoursPer),
			);
			this.td(tr, budgetLabel, budgetText);
			const lastUpdateTd = tr.createEl("td", {
				text: formatDisplayDate(row.updatedAt, dateFormat),
				cls: "pe-col-last-update",
				attr: { "data-label": "Last Update" },
			});
			if (row.updatedAt) {
				lastUpdateTd.title = row.updatedAt;
			}
			const actions = tr.createEl("td", { attr: { "data-label": "Actions" } });
			const actionRow = actions.createDiv({ cls: "pe-project-row-actions" });
			const open = actionRow.createEl("button", {
				text: "Open",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			open.addEventListener("click", (event) => {
				event.stopPropagation();
				void this.plugin.router.openProjectLink(row.file.path);
			});
			const archiveBtn = actionRow.createEl("button", {
				cls: "pe-icon-btn pe-touch-target pe-project-archive-btn",
				attr: {
					type: "button",
					title: "Archive project",
					"aria-label": `Archive project ${row.name}`,
				},
			});
			setIcon(archiveBtn, "archive");
			archiveBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				this.confirmArchive(row);
			});
			fragment.appendChild(tr);
		}
		tbody.appendChild(fragment);
	}

	private renderCards(rows: ProjectRow[]): void {
		const hoursPer = this.plugin.settings.hoursPerManday;
		const dateFormat = this.plugin.settings.dateFormat;
		const section = this.bodyEl.createDiv({ cls: "pe-section pe-card-section" });
		for (const row of rows) {
			const details = section.createEl("details", { cls: "pe-accordion pe-touch-target" });
			const summary = details.createEl("summary", { cls: "pe-accordion-summary pe-touch-target" });
			summary.setText(`${row.id} — ${row.name}`);
			summary.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				this.openRowMenu(row, event);
			});
			const body = details.createDiv({ cls: "pe-accordion-body" });
			body.createEl("p", { text: `Governance: ${governanceDisplayLabel(row.governance)}` });
			body.createEl("p", {
				text: `Status: ${projectStatusLabel(this.plugin.settings.projectStatuses, row.status)}`,
			});
			body.createEl("p", { text: `Customer: ${stripWiki(row.customer)}` });
			const flags = {
				isNonPM: row.isNonPM,
				isTechnicalIntervention: row.isTechnicalIntervention,
			};
			const budgetText = formatProjectBudgetDisplay(
				flags,
				formatBudgetDaysAndHours(row.assignedDays, hoursPer),
			);
			body.createEl("p", {
				text: `${budgetMetricLabel(flags)}: ${budgetText} · Actual ${formatGiornate(row.actualDays)}`,
			});
			body.createEl("p", {
				text: `Last Update: ${formatDisplayDate(row.updatedAt, dateFormat)}`,
			});
			const actions = body.createDiv({ cls: "pe-inline-row" });
			const open = actions.createEl("button", {
				text: "Open",
				cls: "pe-primary pe-touch-target",
				attr: { type: "button" },
			});
			open.addEventListener("click", () => {
				void this.plugin.router.openProjectLink(row.file.path);
			});
			const more = actions.createEl("button", {
				text: "More…",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			more.addEventListener("click", (event) => {
				this.openRowMenu(row, event);
			});
		}
	}

	/**
	 * Bottom toggle: reveal archived projects with Unarchive actions.
	 * Kept below entity shortcuts so the active table stays uncluttered.
	 */
	private renderArchivedSection(): void {
		const section = this.bodyEl.createDiv({
			cls: "pe-section pe-dashboard-archived",
		});
		const count = this.archivedProjects.length;
		const toggle = section.createEl("button", {
			text: this.showArchived
				? "Hide archived projects"
				: count > 0
					? `Show archived projects (${count})`
					: "Show archived projects",
			cls: "pe-secondary pe-touch-target pe-archived-toggle",
			attr: {
				type: "button",
				"aria-expanded": this.showArchived ? "true" : "false",
				"aria-controls": "pe-archived-projects-panel",
			},
		});
		toggle.addEventListener("click", () => {
			this.showArchived = !this.showArchived;
			this.render();
		});

		if (!this.showArchived) {
			return;
		}

		const panel = section.createDiv({
			cls: "pe-archived-panel",
			attr: { id: "pe-archived-projects-panel" },
		});
		panel.createEl("h3", {
			text: "Archived projects",
			cls: "pe-section-title",
		});

		if (count === 0) {
			panel.createEl("p", {
				text: "No archived projects.",
				cls: "pe-help pe-archived-empty",
			});
			return;
		}

		const table = panel.createEl("table", {
			cls: "pe-table pe-project-list pe-archived-list",
		});
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		for (const label of ["ID", "Name", "Customer", ""]) {
			headRow.createEl("th", { text: label });
		}
		const tbody = table.createEl("tbody");
		const fragment = document.createDocumentFragment();
		for (const row of this.archivedProjects) {
			const tr = document.createElement("tr");
			tr.className = "pe-project-row pe-archived-row pe-touch-target";
			this.td(tr, "ID", row.id);
			this.td(tr, "Name", row.name);
			this.td(tr, "Customer", stripWiki(row.customer));
			const actions = tr.createEl("td", { attr: { "data-label": "Actions" } });
			const actionRow = actions.createDiv({ cls: "pe-project-row-actions" });
			const open = actionRow.createEl("button", {
				text: "Open",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			open.addEventListener("click", (event) => {
				event.stopPropagation();
				void this.plugin.router.openOverview(row.file.path);
			});
			const unarchive = actionRow.createEl("button", {
				text: "Unarchive",
				cls: "pe-primary pe-touch-target",
				attr: { type: "button" },
			});
			unarchive.addEventListener("click", (event) => {
				event.stopPropagation();
				this.confirmUnarchive(row);
			});
			fragment.appendChild(tr);
		}
		tbody.appendChild(fragment);
	}

	/**
	 * Confirm then archive (same path as Project Dashboard Archive).
	 */
	private confirmArchive(project: ProjectRow): void {
		const archiveRoot =
			this.plugin.settings.archivedProjectsFolder || "Projects_Archived";
		const folder = containingProjectFolder(project.file.path) || project.file.path;
		new ConfirmModal(this.app, {
			title: "Archive project?",
			message: `This will move the project folder into “${archiveRoot}” and hide it from active project lists:\n\n${folder}\n\nYou can still open the notes from the vault file explorer.`,
			confirmLabel: "Archive project",
			onConfirm: async () => {
				try {
					const result = await archiveProjectFolder({
						app: this.app,
						projectFile: project.file,
						settings: this.plugin.settings,
					});
					notifyProjectArchived(result.archivedPath, result.moved);
					this.plugin.indexer.rebuild();
					this.plugin.refreshOpenViews();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not archive project: ${message}`);
				}
			},
		}).open();
	}

	/**
	 * Confirm then unarchive (same path as Project Dashboard Unarchive).
	 */
	private confirmUnarchive(project: ProjectRow): void {
		const projectsRoot = this.plugin.settings.projectsFolder || "Projects";
		const folder = containingProjectFolder(project.file.path) || project.file.path;
		new ConfirmModal(this.app, {
			title: "Unarchive project?",
			message: `This will move the project folder back into “${projectsRoot}” and show it in active project lists:\n\n${folder}`,
			confirmLabel: "Unarchive project",
			onConfirm: async () => {
				try {
					const result = await unarchiveProjectFolder({
						app: this.app,
						projectFile: project.file,
						settings: this.plugin.settings,
					});
					notifyProjectUnarchived(result.projectPath, result.moved);
					this.showArchived = true;
					this.plugin.indexer.rebuild();
					this.plugin.refreshOpenViews();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not unarchive project: ${message}`);
				}
			},
		}).open();
	}

	/**
	 * Context menu: overview / workspace / edit / note — mirrors obsidian-pm row menus.
	 */
	private openRowMenu(row: ProjectRow, event: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle("Open overview").onClick(() => {
				void this.plugin.router.openOverview(row.file.path);
			});
		});
		menu.addItem((item) => {
			item.setTitle("Open workspace").onClick(() => {
				void this.plugin.router.openWorkspace(row.file.path);
			});
		});
		menu.addItem((item) => {
			item.setTitle("Edit project").onClick(() => {
				void openProjectEditor(this.plugin, row, { onSaved: () => this.reload() });
			});
		});
		menu.addItem((item) => {
			item.setTitle("Open note").onClick(() => {
				void this.app.workspace.getLeaf(false).openFile(row.file);
			});
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Open in table").onClick(() => {
				void this.plugin.router.openWorkspace(row.file.path, undefined, "table");
			});
		});
		menu.addItem((item) => {
			item.setTitle("Open in board").onClick(() => {
				void this.plugin.router.openWorkspace(row.file.path, undefined, "kanban");
			});
		});
		menu.addItem((item) => {
			item.setTitle("Open in Eisenhower").onClick(() => {
				void this.plugin.router.openWorkspace(row.file.path, undefined, "eisenhower");
			});
		});
		menu.addItem((item) => {
			item.setTitle("Open in Gantt").onClick(() => {
				void this.plugin.router.openWorkspace(row.file.path, undefined, "gantt");
			});
		});
		menu.showAtMouseEvent(event);
	}

	private td(tr: HTMLElement, label: string, text: string): void {
		tr.createEl("td", { text, attr: { "data-label": label } });
	}
}

function stripWiki(value: string): string {
	return value.replace(/^\[\[/, "").replace(/\]\]$/, "");
}

function uniqueCustomers(rows: ProjectRow[]): string[] {
	const set = new Set<string>();
	for (const row of rows) {
		const name = stripWiki(row.customer).trim();
		if (name) set.add(name);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Activate or focus the Dashboard leaf (legacy name kept for callers).
 */
export async function activatePortfolioView(plugin: ProjectsEnginePlugin): Promise<void> {
	await plugin.router.openDashboard();
}

/** @deprecated Prefer {@link DASHBOARD_VIEW_TYPE}; kept for layout compatibility. */
export const PORTFOLIO_VIEW_TYPE = DASHBOARD_VIEW_TYPE;

/** Thin alias so older imports of PortfolioView still type-check during migration. */
export { DashboardView as PortfolioView };

export type { ProjectRow };
export { findProjectRow, loadProjectRows };
