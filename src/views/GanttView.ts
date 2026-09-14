/**
 * Interactive Gantt / timeline ItemView.
 *
 * Renders project tasks as bars on a scrollable calendar axis. Zoom changes
 * pixels-per-day (day / week / month presets). Dependency hints are drawn as
 * SVG curves from blocker end → dependent start when both tasks are dated.
 *
 * Pure DOM + SVG — no Node builtins. Touch targets for zoom / refresh are
 * ≥ 44×44px. Opens as a workspace leaf consistent with {@link PortfolioView}.
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type { IsoDate, Task, TaskId } from "../models/types";
import { toWikiLink } from "../models/types";
import { addDays, endFromStart, formatIsoDate, parseIsoDate } from "../engine/Scheduler";
import { loadAllTasks } from "../services/taskIo";
import { activatePortfolioView } from "./PortfolioView";
import { TaskEditorModal } from "./TaskEditorModal";

/** View type id registered in main.ts. */
export const GANTT_VIEW_TYPE = "projects-engine-gantt";

/** Zoom presets: pixels allocated to one calendar day. */
const ZOOM_PRESETS: { id: "day" | "week" | "month"; label: string; pxPerDay: number }[] = [
	{ id: "day", label: "Day", pxPerDay: 28 },
	{ id: "week", label: "Week", pxPerDay: 12 },
	{ id: "month", label: "Month", pxPerDay: 4 },
];

const ROW_HEIGHT = 44;
const LABEL_WIDTH = 180;
const HEADER_HEIGHT = 36;

interface GanttRow {
	task: Task;
	start: IsoDate;
	end: IsoDate;
	/** Depth in the parent/child tree (indent). */
	depth: number;
}

/**
 * Workspace leaf showing a project/task timeline with zoom and dependency hints.
 */
export class GanttView extends ItemView {
	private tasks: Task[] = [];
	private projectFilter = "all";
	private zoomId: "day" | "week" | "month" = "week";
	private rangeStart: IsoDate = formatIsoDate(new Date());
	private rangeEnd: IsoDate = formatIsoDate(new Date());

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return GANTT_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Gantt";
	}

	override getIcon(): string {
		return "calendar-range";
	}

	override async onOpen(): Promise<void> {
		await this.refresh();
	}

	override async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/**
	 * Reload tasks and re-render the chart.
	 */
	public async refresh(): Promise<void> {
		this.plugin.indexer.rebuild();
		this.tasks = await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);
		this.render();
	}

	private pxPerDay(): number {
		return ZOOM_PRESETS.find((z) => z.id === this.zoomId)?.pxPerDay ?? 12;
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("projects-engine-view");
		root.addClass("pe-gantt-view");

		const header = root.createDiv({ cls: "pe-gantt-header" });
		header.createEl("h2", { text: "Gantt timeline" });

		const toolbar = header.createDiv({ cls: "pe-toolbar" });
		this.toolbarButton(toolbar, "Refresh", () => {
			void this.refresh();
		});

		const zoomGroup = toolbar.createDiv({ cls: "pe-segmented pe-gantt-zoom" });
		for (const preset of ZOOM_PRESETS) {
			const button = zoomGroup.createEl("button", {
				text: preset.label,
				cls: `pe-segment pe-touch-target${this.zoomId === preset.id ? " is-active" : ""}`,
				attr: { type: "button", "aria-pressed": String(this.zoomId === preset.id) },
			});
			button.addEventListener("click", () => {
				this.zoomId = preset.id;
				this.render();
			});
		}

		const filter = toolbar.createEl("select", { cls: "pe-input pe-touch-target" });
		filter.createEl("option", { text: "All projects", attr: { value: "all" } });
		const projectIds = [...new Set(this.tasks.map((task) => task.projectId))].sort();
		for (const id of projectIds) {
			filter.createEl("option", { text: id, attr: { value: id } });
		}
		filter.value = this.projectFilter;
		filter.addEventListener("change", () => {
			this.projectFilter = filter.value;
			this.render();
		});

		const rows = this.buildRows();
		if (rows.length === 0) {
			const empty = root.createDiv({ cls: "pe-empty-state" });
			empty.createEl("p", {
				text: "No dated tasks to chart. Create tasks, set start dates (or run Auto-schedule), then refresh.",
			});
			const create = empty.createEl("button", {
				text: "Open portfolio",
				cls: "pe-primary pe-touch-target",
				attr: { type: "button" },
			});
			create.addEventListener("click", () => {
				void activatePortfolioView(this.plugin);
			});
			return;
		}

		this.computeRange(rows);
		const dayCount = daysBetween(this.rangeStart, this.rangeEnd) + 1;
		const px = this.pxPerDay();
		const chartWidth = Math.max(dayCount * px, 320);

		const scroll = root.createDiv({ cls: "pe-gantt-scroll" });
		const chart = scroll.createDiv({ cls: "pe-gantt-chart" });
		chart.style.setProperty("--pe-gantt-label-w", `${LABEL_WIDTH}px`);
		chart.style.width = `${LABEL_WIDTH + chartWidth}px`;

		this.renderAxis(chart, dayCount, px, chartWidth);
		this.renderRows(chart, rows, px, chartWidth);
		this.renderDependencies(chart, rows);
	}

	private toolbarButton(parent: HTMLElement, label: string, onClick: () => void): void {
		const button = parent.createEl("button", {
			text: label,
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		button.addEventListener("click", onClick);
	}

	/**
	 * Flatten tasks for the selected project into indented Gantt rows.
	 * Only tasks with a resolvable start (explicit or inferred) appear.
	 */
	private buildRows(): GanttRow[] {
		const filtered =
			this.projectFilter === "all"
				? this.tasks
				: this.tasks.filter((task) => task.projectId === this.projectFilter);

		const byParent = new Map<TaskId | null, Task[]>();
		for (const task of filtered) {
			const key = task.parentId;
			const list = byParent.get(key) ?? [];
			list.push(task);
			byParent.set(key, list);
		}
		for (const list of byParent.values()) {
			list.sort(
				(a, b) =>
					(a.startDate ?? "").localeCompare(b.startDate ?? "") ||
					a.title.localeCompare(b.title),
			);
		}

		const rows: GanttRow[] = [];
		const visit = (parentId: TaskId | null, depth: number): void => {
			for (const task of byParent.get(parentId) ?? []) {
				const dated = resolveDates(task);
				if (dated) {
					rows.push({ task, start: dated.start, end: dated.end, depth });
				}
				visit(task.id, depth + 1);
			}
		};
		visit(null, 0);

		// Orphans whose parent is outside the filter still show at root depth.
		const listed = new Set(rows.map((row) => row.task.id));
		for (const task of filtered) {
			if (listed.has(task.id)) continue;
			const dated = resolveDates(task);
			if (!dated) continue;
			rows.push({ task, start: dated.start, end: dated.end, depth: 0 });
		}
		return rows;
	}

	private computeRange(rows: GanttRow[]): void {
		let min = rows[0]!.start;
		let max = rows[0]!.end;
		for (const row of rows) {
			if (row.start < min) min = row.start;
			if (row.end > max) max = row.end;
		}
		// Pad one week on each side for readability.
		this.rangeStart = addDays(min, -7);
		this.rangeEnd = addDays(max, 7);
	}

	private renderAxis(
		chart: HTMLElement,
		dayCount: number,
		px: number,
		chartWidth: number,
	): void {
		const axis = chart.createDiv({ cls: "pe-gantt-axis" });
		axis.style.height = `${HEADER_HEIGHT}px`;

		const corner = axis.createDiv({ cls: "pe-gantt-corner" });
		corner.setText("Task");
		corner.style.width = `${LABEL_WIDTH}px`;

		const ticks = axis.createDiv({ cls: "pe-gantt-ticks" });
		ticks.style.width = `${chartWidth}px`;

		const step = this.zoomId === "day" ? 1 : this.zoomId === "week" ? 7 : 14;
		for (let i = 0; i < dayCount; i += step) {
			const date = addDays(this.rangeStart, i);
			const tick = ticks.createDiv({ cls: "pe-gantt-tick" });
			tick.style.left = `${i * px}px`;
			tick.style.width = `${step * px}px`;
			tick.setText(this.zoomId === "day" ? date.slice(5) : date);
		}
	}

	private renderRows(
		chart: HTMLElement,
		rows: GanttRow[],
		px: number,
		chartWidth: number,
	): void {
		const body = chart.createDiv({ cls: "pe-gantt-body" });
		body.style.position = "relative";

		rows.forEach((row, index) => {
			const lane = body.createDiv({ cls: "pe-gantt-row" });
			lane.style.height = `${ROW_HEIGHT}px`;
			lane.style.top = `${index * ROW_HEIGHT}px`;

			const label = lane.createDiv({ cls: "pe-gantt-label pe-touch-target" });
			label.style.width = `${LABEL_WIDTH}px`;
			label.style.paddingLeft = `${8 + row.depth * 12}px`;
			label.setText(row.task.title || row.task.id);
			label.title = row.task.id;
			label.addEventListener("click", () => {
				this.openTask(row.task);
			});

			const track = lane.createDiv({ cls: "pe-gantt-track" });
			track.style.width = `${chartWidth}px`;

			const offset = daysBetween(this.rangeStart, row.start);
			const span = Math.max(daysBetween(row.start, row.end) + 1, 1);
			const isMilestone = row.task.isMilestone || row.task.durationDays === 0;
			const bar = track.createDiv({
				cls: `pe-gantt-bar pe-touch-target${isMilestone ? " is-milestone" : ""}${row.task.isStageBoundary ? " is-boundary" : ""}`,
			});
			const barWidth = isMilestone ? Math.max(px, 12) : span * px;
			bar.style.left = `${offset * px}px`;
			bar.style.width = `${barWidth}px`;
			bar.setText(isMilestone ? "◆" : `${row.start} → ${row.end}`);
			bar.title = `${row.task.title}\n${row.start} → ${row.end}\n${row.task.status}`;
			bar.addEventListener("click", () => {
				this.openTask(row.task);
			});

			lane.dataset.taskId = row.task.id;
			lane.dataset.barLeft = String(offset * px);
			lane.dataset.barWidth = String(barWidth);
			lane.dataset.rowIndex = String(index);
		});

		body.style.height = `${rows.length * ROW_HEIGHT}px`;
	}

	/**
	 * Draw lightweight SVG dependency hints over the bar area.
	 */
	private renderDependencies(chart: HTMLElement, rows: GanttRow[]): void {
		const body = chart.querySelector(".pe-gantt-body");
		if (!(body instanceof HTMLElement)) {
			return;
		}
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "pe-gantt-deps");
		svg.setAttribute("width", String(Math.max(body.scrollWidth, body.clientWidth, 1)));
		svg.setAttribute("height", String(rows.length * ROW_HEIGHT));
		svg.style.left = `${LABEL_WIDTH}px`;

		const indexById = new Map(rows.map((row, index) => [row.task.id, index] as const));
		const geometry = new Map<TaskId, { left: number; width: number; index: number }>();
		Array.from(body.querySelectorAll(".pe-gantt-row")).forEach((lane) => {
			if (!(lane instanceof HTMLElement) || !lane.dataset.taskId) return;
			geometry.set(lane.dataset.taskId, {
				left: Number(lane.dataset.barLeft ?? 0),
				width: Number(lane.dataset.barWidth ?? 0),
				index: Number(lane.dataset.rowIndex ?? 0),
			});
		});

		for (const row of rows) {
			for (const blockerId of row.task.blockedBy) {
				const from = geometry.get(blockerId);
				const to = geometry.get(row.task.id);
				if (!from || !to) continue;
				if (!indexById.has(blockerId)) continue;

				const x1 = from.left + from.width;
				const y1 = from.index * ROW_HEIGHT + ROW_HEIGHT / 2;
				const x2 = to.left;
				const y2 = to.index * ROW_HEIGHT + ROW_HEIGHT / 2;
				const midX = (x1 + x2) / 2;

				const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
				path.setAttribute(
					"d",
					`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
				);
				path.setAttribute("class", "pe-gantt-dep-path");
				path.setAttribute("fill", "none");
				svg.appendChild(path);

				const tip = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				tip.setAttribute("cx", String(x2));
				tip.setAttribute("cy", String(y2));
				tip.setAttribute("r", "3");
				tip.setAttribute("class", "pe-gantt-dep-tip");
				svg.appendChild(tip);
			}
		}

		body.appendChild(svg);
	}

	private openTask(task: Task): void {
		const projectFile = this.app.vault.getMarkdownFiles().find((file) => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			return fm?.pe_type === "project" && fm?.id === task.projectId;
		});
		const projectLink = projectFile
			? toWikiLink(projectFile.basename)
			: task.project;
		new TaskEditorModal(
			this.app,
			this.plugin,
			task.projectId,
			projectLink,
			task,
			task.parentId,
		).open();
	}
}

/**
 * Resolve display dates: prefer explicit start/end; else start + duration.
 */
function resolveDates(task: Task): { start: IsoDate; end: IsoDate } | null {
	if (task.startDate) {
		const end =
			task.endDate ??
			endFromStart(task.startDate, Math.max(task.durationDays, task.isMilestone ? 0 : 1));
		return { start: task.startDate, end };
	}
	if (task.endDate) {
		const duration = Math.max(task.durationDays, 0);
		const start =
			duration <= 0 ? task.endDate : addDays(task.endDate, -(duration - 1));
		return { start, end: task.endDate };
	}
	return null;
}

/**
 * Inclusive calendar-day distance between two ISO dates.
 */
function daysBetween(a: IsoDate, b: IsoDate): number {
	const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
	return Math.round(ms / 86_400_000);
}

/**
 * Activate or create the Gantt leaf.
 */
export async function activateGanttView(plugin: ProjectsEnginePlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf: WorkspaceLeaf | null = null;
	for (const existing of workspace.getLeavesOfType(GANTT_VIEW_TYPE)) {
		leaf = existing;
		break;
	}
	if (!leaf) {
		leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: GANTT_VIEW_TYPE, active: true });
	}
	workspace.revealLeaf(leaf);
	const view = leaf.view;
	if (view instanceof GanttView) {
		await view.refresh();
	}
}
