/**
 * Portfolio workspace view: tabular project listing with card/accordion
 * fallback on small screens, plus a lean Semplificato Kanban board.
 *
 * Touch targets are ≥ 44×44px. Dense tables use `data-label` so CSS can stack
 * cells into cards below 720px.
 */

import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type {
	GovernanceModel,
	ProjectStatus,
	SemplificatoStatus,
	Task,
	WikiLink,
} from "../models/types";
import { toWikiLink } from "../models/types";
import {
	SEMPLIFICATO_LABELS,
	SEMPLIFICATO_STATUSES,
	createPrince2Stage,
	ensurePrince2Registers,
	readProjectStages,
} from "../services/governance";
import { PersistStatusCommand } from "../services/taskCommands";
import { loadAllTasks } from "../services/taskIo";
import { openEntityModal } from "./EntityModal";
import { TaskEditorModal } from "./TaskEditorModal";

/** View type id registered in main.ts. */
export const PORTFOLIO_VIEW_TYPE = "projects-engine-portfolio";

interface ProjectRow {
	file: TFile;
	id: string;
	name: string;
	governance: GovernanceModel;
	status: string;
	customer: string;
	assignedDays: number;
	actualDays: number;
	projectUrl: string;
	teamsChannelUrl: string;
}

/**
 * Leaf view hosting portfolio table + Semplificato board + PRINCE2 actions.
 */
export class PortfolioView extends ItemView {
	private projects: ProjectRow[] = [];
	private tasks: Task[] = [];
	private filterGovernance: "all" | GovernanceModel = "all";
	private selectedProjectId: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return PORTFOLIO_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Projects Engine";
	}

	override getIcon(): string {
		return "briefcase";
	}

	override async onOpen(): Promise<void> {
		await this.refresh();
	}

	override async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/**
	 * Reload projects/tasks from the vault and re-render.
	 */
	public async refresh(): Promise<void> {
		this.plugin.indexer.rebuild();
		this.projects = this.loadProjects();
		this.tasks = await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);
		this.render();
	}

	private loadProjects(): ProjectRow[] {
		const rows: ProjectRow[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (fm?.pe_type !== "project") {
				continue;
			}
			rows.push({
				file,
				id: typeof fm.id === "string" ? fm.id : file.basename,
				name: typeof fm.name === "string" ? fm.name : file.basename,
				governance: fm.governance === "PRINCE2" ? "PRINCE2" : "Semplificato",
				status: typeof fm.status === "string" ? fm.status : "backlog",
				customer: typeof fm.customer === "string" ? fm.customer : "",
				assignedDays: typeof fm.assigned_days === "number" ? fm.assigned_days : 0,
				actualDays: typeof fm.actual_days === "number" ? fm.actual_days : 0,
				projectUrl: typeof fm.project_url === "string" ? fm.project_url : "",
				teamsChannelUrl: typeof fm.teams_channel_url === "string" ? fm.teams_channel_url : "",
			});
		}
		return rows.sort((a, b) => a.id.localeCompare(b.id));
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("projects-engine-view");
		root.addClass("pe-portfolio");

		const header = root.createDiv({ cls: "pe-portfolio-header" });
		header.createEl("h2", { text: "Portfolio" });

		const toolbar = header.createDiv({ cls: "pe-toolbar" });
		this.addToolbarButton(toolbar, "Refresh", () => {
			void this.refresh();
		});
		this.addToolbarButton(toolbar, "New project", () => {
			this.plugin.openCreationModal();
		});
		this.addToolbarButton(toolbar, "New task", () => {
			void this.openTaskForSelection();
		});
		this.addToolbarButton(toolbar, "Customer", () => openEntityModal(this.plugin, "customer"));
		this.addToolbarButton(toolbar, "Team member", () =>
			openEntityModal(this.plugin, "team-member"),
		);
		this.addToolbarButton(toolbar, "Project type", () =>
			openEntityModal(this.plugin, "project-type"),
		);
		this.addToolbarButton(toolbar, "Technology", () =>
			openEntityModal(this.plugin, "project-technology"),
		);
		this.addToolbarButton(toolbar, "Stakeholder", () =>
			openEntityModal(this.plugin, "stakeholder"),
		);

		const filter = toolbar.createEl("select", { cls: "pe-input pe-touch-target" });
		for (const option of [
			{ value: "all", label: "All governance" },
			{ value: "Semplificato", label: "Semplificato" },
			{ value: "PRINCE2", label: "PRINCE2" },
		]) {
			filter.createEl("option", { text: option.label, attr: { value: option.value } });
		}
		filter.value = this.filterGovernance;
		filter.addEventListener("change", () => {
			this.filterGovernance = filter.value as "all" | GovernanceModel;
			this.render();
		});

		const visible = this.projects.filter(
			(row) => this.filterGovernance === "all" || row.governance === this.filterGovernance,
		);

		this.renderTable(root, visible);
		this.renderCards(root, visible);
		this.renderKanban(root);
		this.renderPrince2Panel(root);
	}

	private addToolbarButton(parent: HTMLElement, label: string, onClick: () => void): void {
		const button = parent.createEl("button", {
			text: label,
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		button.addEventListener("click", onClick);
	}

	private renderTable(root: HTMLElement, rows: ProjectRow[]): void {
		const section = root.createDiv({ cls: "pe-section pe-table-section" });
		section.createEl("h3", { text: "Projects", cls: "pe-section-title" });
		const table = section.createEl("table", { cls: "pe-table" });
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		for (const label of ["ID", "Name", "Governance", "Status", "Customer", "Days", "Actions"]) {
			headRow.createEl("th", { text: label });
		}
		const tbody = table.createEl("tbody");
		for (const row of rows) {
			const tr = tbody.createEl("tr");
			if (this.selectedProjectId === row.id) {
				tr.addClass("is-selected");
			}
			tr.addEventListener("click", () => {
				this.selectedProjectId = row.id;
				this.render();
			});
			this.td(tr, "ID", row.id);
			this.td(tr, "Name", row.name);
			this.td(tr, "Governance", row.governance);
			this.td(tr, "Status", row.status);
			this.td(tr, "Customer", row.customer.replace(/^\[\[/, "").replace(/\]\]$/, ""));
			this.td(tr, "Days", `${row.actualDays}/${row.assignedDays}`);
			const actions = tr.createEl("td", { attr: { "data-label": "Actions" } });
			const open = actions.createEl("button", {
				text: "Open",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			open.addEventListener("click", (event) => {
				event.stopPropagation();
				void this.app.workspace.getLeaf(false).openFile(row.file);
			});
		}
		if (rows.length === 0) {
			const tr = tbody.createEl("tr");
			const td = tr.createEl("td", { attr: { colspan: "7", "data-label": "Info" } });
			td.setText("No projects yet. Use “New project” to create one.");
		}
	}

	private td(tr: HTMLElement, label: string, text: string): void {
		tr.createEl("td", { text, attr: { "data-label": label } });
	}

	/**
	 * Accordion card fallback used alongside the table (CSS hides one on size).
	 */
	private renderCards(root: HTMLElement, rows: ProjectRow[]): void {
		const section = root.createDiv({ cls: "pe-section pe-card-section" });
		section.createEl("h3", { text: "Projects (cards)", cls: "pe-section-title" });
		for (const row of rows) {
			const details = section.createEl("details", { cls: "pe-accordion pe-touch-target" });
			if (this.selectedProjectId === row.id) {
				details.open = true;
				details.addClass("is-selected");
			}
			const summary = details.createEl("summary", { cls: "pe-accordion-summary pe-touch-target" });
			summary.setText(`${row.id} — ${row.name}`);
			const body = details.createDiv({ cls: "pe-accordion-body" });
			body.createEl("p", { text: `Governance: ${row.governance}` });
			body.createEl("p", { text: `Status: ${row.status}` });
			body.createEl("p", {
				text: `Customer: ${row.customer.replace(/^\[\[/, "").replace(/\]\]$/, "")}`,
			});
			body.createEl("p", { text: `Days: ${row.actualDays} / ${row.assignedDays}` });
			const actions = body.createDiv({ cls: "pe-inline-row" });
			const select = actions.createEl("button", {
				text: "Select",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			select.addEventListener("click", () => {
				this.selectedProjectId = row.id;
				this.render();
			});
			const open = actions.createEl("button", {
				text: "Open note",
				cls: "pe-primary pe-touch-target",
				attr: { type: "button" },
			});
			open.addEventListener("click", () => {
				void this.app.workspace.getLeaf(false).openFile(row.file);
			});
		}
	}

	/**
	 * Lean Kanban for Semplificato projects (and operational tasks).
	 */
	private renderKanban(root: HTMLElement): void {
		const section = root.createDiv({ cls: "pe-section pe-kanban-section" });
		section.createEl("h3", { text: "Semplificato board", cls: "pe-section-title" });
		section.createEl("p", {
			cls: "pe-help",
			text: this.selectedProjectId
				? `Tasks for ${this.selectedProjectId}. Tap a status to move (undoable).`
				: "Select a Semplificato project to manage its status board.",
		});

		const selected = this.projects.find((row) => row.id === this.selectedProjectId);
		if (!selected || selected.governance !== "Semplificato") {
			section.createEl("p", {
				cls: "pe-help",
				text: "Board available when a Semplificato project is selected.",
			});
			return;
		}

		const board = section.createDiv({ cls: "pe-kanban" });
		const projectTasks = this.tasks.filter(
			(task) => task.projectId === selected.id && task.parentId == null,
		);

		for (const status of SEMPLIFICATO_STATUSES) {
			const column = board.createDiv({ cls: "pe-kanban-column" });
			column.createEl("h4", { text: SEMPLIFICATO_LABELS[status], cls: "pe-kanban-title" });
			const cards = column.createDiv({ cls: "pe-kanban-cards" });
			const inColumn = projectTasks.filter((task) => normaliseStatus(task.status) === status);
			for (const task of inColumn) {
				const card = cards.createDiv({ cls: "pe-kanban-card pe-touch-target" });
				card.createEl("div", { text: task.title || task.id, cls: "pe-kanban-card-title" });
				card.createEl("div", {
					text: `${task.remainingMandays.toFixed(1)} md left`,
					cls: "pe-help",
				});
				const row = card.createDiv({ cls: "pe-inline-row" });
				const edit = row.createEl("button", {
					text: "Edit",
					cls: "pe-secondary pe-touch-target",
					attr: { type: "button" },
				});
				edit.addEventListener("click", () => {
					new TaskEditorModal(
						this.app,
						this.plugin,
						selected.id,
						toWikiLink(selected.file.basename),
						task,
						task.parentId,
					).open();
				});
				for (const target of SEMPLIFICATO_STATUSES) {
					if (target === status) continue;
					const move = row.createEl("button", {
						text: SEMPLIFICATO_LABELS[target],
						cls: "pe-secondary pe-touch-target pe-kanban-move",
						attr: { type: "button", title: `Move to ${SEMPLIFICATO_LABELS[target]}` },
					});
					move.addEventListener("click", () => {
						void this.moveTaskStatus(task, target);
					});
				}
			}
			if (inColumn.length === 0) {
				cards.createEl("p", { text: "Empty", cls: "pe-help" });
			}
		}

		// Also allow updating the project-level status along the same linear flow.
		const projectStatus = section.createDiv({ cls: "pe-inline-row pe-project-status-row" });
		projectStatus.createEl("span", { text: "Project status:", cls: "pe-label" });
		for (const status of SEMPLIFICATO_STATUSES) {
			const button = projectStatus.createEl("button", {
				text: SEMPLIFICATO_LABELS[status],
				cls: `pe-segment pe-touch-target${selected.status === status ? " is-active" : ""}`,
				attr: { type: "button" },
			});
			button.addEventListener("click", () => {
				void this.setProjectStatus(selected, status);
			});
		}
	}

	private async moveTaskStatus(task: Task, status: SemplificatoStatus): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Task file missing");
			return;
		}
		this.plugin.commandStack.execute(
			new PersistStatusCommand(this.app.vault, file, task.status, status),
		);
		new Notice(`Moved to ${SEMPLIFICATO_LABELS[status]}`);
		await this.refresh();
	}

	private async setProjectStatus(row: ProjectRow, status: SemplificatoStatus): Promise<void> {
		this.plugin.commandStack.execute(
			new PersistStatusCommand(this.app.vault, row.file, row.status, status),
		);
		new Notice(`Project status → ${SEMPLIFICATO_LABELS[status]}`);
		await this.refresh();
	}

	private renderPrince2Panel(root: HTMLElement): void {
		const section = root.createDiv({ cls: "pe-section pe-prince2-section" });
		section.createEl("h3", { text: "PRINCE2 governance", cls: "pe-section-title" });
		const selected = this.projects.find((row) => row.id === this.selectedProjectId);
		if (!selected || selected.governance !== "PRINCE2") {
			section.createEl("p", {
				cls: "pe-help",
				text: "Select a PRINCE2 project to manage stages and registers.",
			});
			return;
		}

		const fm = this.app.metadataCache.getFileCache(selected.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const stages = readProjectStages(fm);
		const list = section.createEl("ul", { cls: "pe-stage-list" });
		for (const stage of stages) {
			list.createEl("li", {
				text: `${stage.sequence}. ${stage.name} · boundary ${stage.boundaryTaskId ?? "—"} · ${stage.status}`,
			});
		}
		if (stages.length === 0) {
			list.createEl("li", { text: "No management stages yet." });
		}

		const actions = section.createDiv({ cls: "pe-inline-row" });
		this.addToolbarButton(actions, "Ensure registers", () => {
			void (async () => {
				const folder = selected.file.parent?.path ?? "";
				await ensurePrince2Registers(
					this.app.vault,
					folder,
					toWikiLink(selected.file.basename),
					selected.name,
				);
				new Notice("PRINCE2 registers ready");
				await this.refresh();
			})();
		});
		this.addToolbarButton(actions, "Add stage", () => {
			void this.promptAddStage(selected);
		});
		this.addToolbarButton(actions, "New task", () => {
			new TaskEditorModal(
				this.app,
				this.plugin,
				selected.id,
				toWikiLink(selected.file.basename),
			).open();
		});
	}

	private async promptAddStage(row: ProjectRow): Promise<void> {
		const name = window.prompt("Stage name", `Stage ${(readProjectStages(
			this.app.metadataCache.getFileCache(row.file)?.frontmatter as Record<string, unknown>,
		).length || 0) + 1}`);
		if (!name?.trim()) {
			return;
		}
		const fm = this.app.metadataCache.getFileCache(row.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const existing = readProjectStages(fm);
		const sequence = existing.length + 1;
		try {
			const result = await createPrince2Stage({
				vault: this.app.vault,
				projectFile: row.file,
				projectId: row.id,
				projectLink: toWikiLink(row.file.basename),
				stageName: name.trim(),
				sequence,
				tasksFolder: this.plugin.settings.tasksFolder,
				existingTaskIds: this.tasks.map((task) => task.id),
				hoursPerManday: this.plugin.settings.hoursPerManday,
			});
			new Notice(
				`Created stage ${result.stage.name} with boundary ${result.boundaryTaskId}`,
			);
			await this.refresh();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not create stage: ${message}`);
		}
	}

	private async openTaskForSelection(): Promise<void> {
		const selected = this.projects.find((row) => row.id === this.selectedProjectId);
		if (!selected) {
			new Notice("Select a project first");
			return;
		}
		new TaskEditorModal(
			this.app,
			this.plugin,
			selected.id,
			toWikiLink(selected.file.basename),
		).open();
	}
}

function normaliseStatus(status: string): SemplificatoStatus {
	if (
		status === "backlog" ||
		status === "in-progress" ||
		status === "review" ||
		status === "done"
	) {
		return status;
	}
	return "backlog";
}

/**
 * Activate or create the portfolio leaf.
 */
export async function activatePortfolioView(plugin: ProjectsEnginePlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf: WorkspaceLeaf | null = null;
	for (const existing of workspace.getLeavesOfType(PORTFOLIO_VIEW_TYPE)) {
		leaf = existing;
		break;
	}
	if (!leaf) {
		leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: PORTFOLIO_VIEW_TYPE, active: true });
	}
	workspace.revealLeaf(leaf);
}

export type { ProjectStatus, WikiLink };
