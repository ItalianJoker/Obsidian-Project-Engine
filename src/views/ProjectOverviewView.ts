/**
 * Project overview — governance home page before the delivery workspace.
 *
 * Layout inspiration from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * ProjectOverviewView (MIT © 2026 Stepan Kropachev and dotpm contributors):
 * crumbs, metrics strip, description/entities, CTA into tasks workspace.
 *
 * Domain content (Semplificato vs PRINCE2, Teams URL, stakeholders, stages)
 * is Projects Engine original.
 */

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import { projectStatusLabel, toWikiLink } from "../models/types";
import {
	SEMPLIFICATO_LABELS,
	createPrince2Stage,
	ensurePrince2Registers,
	readProjectStages,
} from "../services/governance";
import { setProjectStatus } from "../services/projectIo";
import {
	formatGiornate,
	formatHours,
	formatHoursAndGiornate,
	giornateToHours,
} from "../services/timeLogs";
import { isValidTeamsChannelUrl, openExternalUrl } from "../services/urls";
import { EmptyState } from "../ui/EmptyState";
import { findProjectRow, loadProjectRows, type ProjectRow } from "./projectRows";
import { loadAllTasks } from "../services/taskIo";
import { ProjectEditModal } from "./ProjectEditModal";
import { TaskEditorModal } from "./TaskEditorModal";

/** Registered ItemView type id. */
export const OVERVIEW_VIEW_TYPE = "projects-engine-overview";

interface OverviewState {
	filePath?: string;
	[key: string]: unknown;
}

/**
 * Project “home” leaf: identity, entities, governance actions, open workspace.
 */
export class ProjectOverviewView extends ItemView {
	private filePath: string | null = null;
	private project: ProjectRow | null = null;
	private taskCount = 0;
	private remainingHours = 0;
	private loggedHours = 0;
	private estimateHours = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	override getViewType(): string {
		return OVERVIEW_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.project?.name ?? "Project";
	}

	override getIcon(): string {
		return "layout-dashboard";
	}

	override getState(): OverviewState {
		return { filePath: this.filePath ?? undefined };
	}

	override async setState(state: OverviewState, result: unknown): Promise<void> {
		if (typeof state.filePath === "string" && state.filePath !== this.filePath) {
			this.filePath = state.filePath;
			await this.loadProject();
		}
		await super.setState(state, result as import("obsidian").ViewStateResult);
	}

	override async onOpen(): Promise<void> {
		this.containerEl.addClass("pe-view");
		if (this.filePath) {
			await this.loadProject();
		} else {
			this.renderMissing();
		}
	}

	override async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private async loadProject(): Promise<void> {
		const rows = loadProjectRows(this.app);
		this.project = this.filePath ? findProjectRow(rows, this.filePath) ?? null : null;
		if (!this.project) {
			this.renderMissing();
			return;
		}
		const tasks = await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);
		const mine = tasks.filter((task) => task.projectId === this.project!.id);
		this.taskCount = mine.length;
		this.remainingHours = mine.reduce((sum, task) => sum + task.remainingHours, 0);
		this.loggedHours = mine.reduce((sum, task) => sum + task.actualHours, 0);
		this.estimateHours = mine.reduce((sum, task) => sum + task.estimateHours, 0);
		this.render();
		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
	}

	private renderMissing(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		new EmptyState(root)
			.setTitle("Project not found")
			.setBody("The project note may have been moved or deleted.")
			.setAction("Back to projects", () => {
				void this.plugin.router.openDashboard();
			});
	}

	private render(): void {
		const project = this.project;
		if (!project) {
			this.renderMissing();
			return;
		}

		const root = this.contentEl;
		root.empty();
		root.addClass("pe-root");
		root.addClass("pe-overview");

		const crumbs = root.createDiv({ cls: "pe-crumbs" });
		const back = crumbs.createEl("button", {
			text: "Projects",
			cls: "pe-link-button pe-touch-target",
			attr: { type: "button" },
		});
		back.addEventListener("click", () => {
			void this.plugin.router.openDashboard();
		});
		crumbs.createSpan({ text: " / ", cls: "pe-help" });
		crumbs.createSpan({ text: project.name });

		const hero = root.createDiv({ cls: "pe-overview-hero" });
		const titleRow = hero.createDiv({ cls: "pe-overview-title-row" });
		titleRow.createSpan({ text: "◇", cls: "pe-overview-glyph" });
		titleRow.createEl("h1", { text: project.name, cls: "pe-overview-title" });

		const meta = hero.createDiv({ cls: "pe-overview-meta pe-meta-compact" });
		meta.createSpan({ text: project.id, cls: "pe-meta-chip" });
		meta.createSpan({ text: project.governance, cls: "pe-meta-chip" });
		const statusChip = meta.createSpan({
			text: projectStatusLabel(this.plugin.settings.projectStatuses, project.status),
			cls: "pe-status-chip pe-meta-chip",
		});
		const statusOpt = this.plugin.settings.projectStatuses.find((s) => s.id === project.status);
		if (statusOpt?.color) {
			statusChip.style.setProperty("--pe-status-color", statusOpt.color);
		}
		if (project.customer) {
			meta.createSpan({ text: stripWiki(project.customer), cls: "pe-meta-chip" });
		}

		const hoursPer = this.plugin.settings.hoursPerManday;
		const budgetHours = giornateToHours(project.assignedDays, hoursPer);
		const metrics = root.createDiv({ cls: "pe-metric-strip" });
		this.metric(metrics, "Tasks", String(this.taskCount));
		this.metric(metrics, "Budget", `${formatGiornate(project.assignedDays)}\n${formatHours(budgetHours)}`);
		this.metric(metrics, "Logged", formatHoursAndGiornate(this.loggedHours, hoursPer));
		this.metric(metrics, "Remaining", formatHoursAndGiornate(this.remainingHours, hoursPer));
		this.metric(metrics, "Est. tasks", formatHours(this.estimateHours));

		const statusRow = root.createDiv({ cls: "pe-overview-status-row pe-inline-row" });
		statusRow.createEl("label", { text: "Status", cls: "pe-label" });
		const statusSelect = statusRow.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { "aria-label": "Project status" },
		});
		const options = this.plugin.settings.projectStatuses.filter(
			(item) => !item.archived || item.id === project.status,
		);
		for (const option of options) {
			statusSelect.createEl("option", {
				text: option.label,
				attr: { value: option.id },
			});
		}
		if (!options.some((item) => item.id === project.status)) {
			statusSelect.createEl("option", {
				text: project.status,
				attr: { value: project.status },
			});
		}
		statusSelect.value = project.status;
		statusSelect.addEventListener("change", () => {
			void (async () => {
				try {
					await setProjectStatus(this.app.vault, project.file, statusSelect.value);
					new Notice(`Status → ${projectStatusLabel(this.plugin.settings.projectStatuses, statusSelect.value)}`);
					await this.loadProject();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not update status: ${message}`);
				}
			})();
		});
		statusRow.createEl("span", {
			cls: "pe-help",
			text: `1 giornata = ${hoursPer} h`,
		});

		const actions = root.createDiv({ cls: "pe-overview-actions pe-inline-row" });
		this.cta(actions, "Open workspace", true, () => {
			void this.plugin.router.openWorkspace(project.file.path, this.leaf);
		});
		this.cta(actions, "Edit project", false, () => {
			new ProjectEditModal(this.app, this.plugin, project, () => {
				void this.loadProject();
			}).open();
		});
		this.cta(actions, "+ add task", false, () => {
			new TaskEditorModal(
				this.app,
				this.plugin,
				project.id,
				toWikiLink(project.file.basename),
			).open();
		});
		this.cta(actions, "Open note", false, () => {
			void this.app.workspace.getLeaf(false).openFile(project.file);
		});
		if (project.teamsChannelUrl) {
			this.cta(actions, "Teams channel", false, () => {
				if (!isValidTeamsChannelUrl(project.teamsChannelUrl)) {
					new Notice("teams_channel_url is not a valid Teams link");
					return;
				}
				openExternalUrl(project.teamsChannelUrl);
			});
		}
		if (project.projectUrl) {
			this.cta(actions, "Project URL", false, () => {
				openExternalUrl(project.projectUrl);
			});
		}

		this.renderEntities(root, project);
		this.renderGovernance(root, project);
	}

	private metric(parent: HTMLElement, label: string, value: string): void {
		const cell = parent.createDiv({ cls: "pe-metric" });
		const valueEl = cell.createDiv({ cls: "pe-metric-value" });
		for (const line of value.split("\n")) {
			valueEl.createDiv({ text: line });
		}
		cell.createDiv({ text: label, cls: "pe-metric-label" });
	}

	private cta(
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

	private renderEntities(root: HTMLElement, project: ProjectRow): void {
		const section = root.createDiv({ cls: "pe-section pe-overview-entities" });
		section.createEl("h3", { text: "Linked entities", cls: "pe-section-title" });
		const grid = section.createDiv({ cls: "pe-entity-grid" });
		this.entityBlock(grid, "Customer", project.customer ? [project.customer] : []);
		this.entityBlock(grid, "Project type", project.projectType ? [project.projectType] : []);
		this.entityBlock(grid, "Technologies", project.technologies);
		this.entityBlock(grid, "Team", project.team);
		this.entityBlock(grid, "Stakeholders", project.stakeholders);
		this.entityBlock(grid, "Commesse", project.commesse);
	}

	private entityBlock(parent: HTMLElement, title: string, values: string[]): void {
		const block = parent.createDiv({ cls: "pe-entity-block" });
		block.createEl("h4", { text: title });
		if (values.length === 0) {
			block.createEl("p", { text: "—", cls: "pe-help" });
			return;
		}
		const list = block.createEl("ul");
		for (const value of values) {
			list.createEl("li", { text: stripWiki(value) });
		}
	}

	private renderGovernance(root: HTMLElement, project: ProjectRow): void {
		const section = root.createDiv({ cls: "pe-section" });
		section.createEl("h3", { text: "Governance", cls: "pe-section-title" });

		if (project.governance === "Semplificato") {
			section.createEl("p", {
				cls: "pe-help",
				text: `Linear board: ${Object.values(SEMPLIFICATO_LABELS).join(" → ")}. Open the workspace Board tab to move tasks.`,
			});
			return;
		}

		const fm = this.app.metadataCache.getFileCache(project.file)?.frontmatter as
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
		this.cta(actions, "Ensure registers", false, () => {
			void (async () => {
				const folder = project.file.parent?.path ?? "";
				await ensurePrince2Registers(
					this.app.vault,
					folder,
					toWikiLink(project.file.basename),
					project.name,
				);
				new Notice("PRINCE2 registers ready");
				await this.loadProject();
			})();
		});
		this.cta(actions, "Add stage", false, () => {
			void this.promptAddStage(project);
		});
	}

	private async promptAddStage(row: ProjectRow): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(row.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const existing = readProjectStages(fm);
		const name = window.prompt("Stage name", `Stage ${existing.length + 1}`);
		if (!name?.trim()) {
			return;
		}
		try {
			const tasks = await loadAllTasks(
				this.app,
				this.plugin.settings.tasksFolder,
				this.plugin.settings.hoursPerManday,
			);
			const result = await createPrince2Stage({
				vault: this.app.vault,
				projectFile: row.file,
				projectId: row.id,
				projectLink: toWikiLink(row.file.basename),
				stageName: name.trim(),
				sequence: existing.length + 1,
				tasksFolder: this.plugin.settings.tasksFolder,
				existingTaskIds: tasks.map((task) => task.id),
				hoursPerManday: this.plugin.settings.hoursPerManday,
			});
			new Notice(
				`Created stage ${result.stage.name} with boundary ${result.boundaryTaskId}`,
			);
			await this.loadProject();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not create stage: ${message}`);
		}
	}
}

function stripWiki(value: string): string {
	return value.replace(/^\[\[/, "").replace(/\]\]$/, "");
}
