/**
 * Gantt / timeline SubView for one project (or filtered task set).
 *
 * Visual parity with dotpm Gantt: hierarchical task list, multi-zoom timeline,
 * today marker, expand/collapse. Chart logic ported from the former standalone
 * Gantt ItemView; hosted as a SubView in the project workspace.
 */

import { setIcon, type App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import type { IsoDate, Task, TaskId } from "../../models/types";
import { toWikiLink } from "../../models/types";
import { addDays, endFromStart, formatIsoDate, parseIsoDate } from "../../engine/Scheduler";
import { EmptyState } from "../../ui/EmptyState";
import type { ProjectRow } from "../projectRows";
import type { SubView } from "../SubView";
import { openTaskEditor } from "../TaskEditor";

/** Supported Gantt zoom presets. */
export type GanttZoomId = "day" | "week" | "month" | "quarter" | "year";

const ZOOM_PRESETS: { id: GanttZoomId; label: string; pxPerDay: number }[] = [
	{ id: "day", label: "Day", pxPerDay: 28 },
	{ id: "week", label: "Week", pxPerDay: 12 },
	{ id: "month", label: "Month", pxPerDay: 4 },
	{ id: "quarter", label: "Quarter", pxPerDay: 1.2 },
	{ id: "year", label: "Year", pxPerDay: 0.35 },
];

const ROW_HEIGHT = 40;
const LABEL_WIDTH = 220;
const HEADER_HEIGHT_SINGLE = 36;
const HEADER_HEIGHT_DUAL = 52;

interface GanttRow {
	task: Task;
	depth: number;
	hasChildren: boolean;
	start: IsoDate | null;
	end: IsoDate | null;
}

export interface GanttSubViewProps {
	app: App;
	plugin: ProjectsEnginePlugin;
	project: ProjectRow;
	tasks: Task[];
	filterText: string;
	container: HTMLElement;
	zoomId: GanttZoomId;
	onZoomChange: (zoom: GanttZoomId) => void;
	/** Optional external collapse state; otherwise managed internally. */
	collapsedIds?: Set<TaskId>;
	onToggleCollapse?: (id: TaskId) => void;
}

/**
 * Scrollable calendar bars with hierarchical labels and dependency hints.
 */
export class GanttSubView implements SubView {
	private rangeStart: IsoDate = formatIsoDate(new Date());
	private rangeEnd: IsoDate = formatIsoDate(new Date());
	private internalCollapsed = new Set<TaskId>();
	private scrollEl: HTMLElement | null = null;

	constructor(private readonly props: GanttSubViewProps) {}

	public render(): void {
		const { container, tasks, project, filterText, zoomId, onZoomChange } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-gantt-subview");

		this.renderToolbar(zoomId, onZoomChange);

		const filtered = this.filterTasks(tasks, project.id, filterText);
		if (filtered.length === 0) {
			new EmptyState(container)
				.setTitle("No tasks yet")
				.setBody("Add tasks to this project, set dates, then refresh.")
				.setAction("+ Add task", () => this.openNewTask());
			return;
		}

		const rows = this.buildVisibleRows(filtered);
		this.computeRange(rows);

		const dayCount = daysBetween(this.rangeStart, this.rangeEnd) + 1;
		const px = ZOOM_PRESETS.find((z) => z.id === zoomId)?.pxPerDay ?? 12;
		const chartWidth = Math.max(dayCount * px, 320);
		const headerHeight = zoomId === "week" ? HEADER_HEIGHT_DUAL : HEADER_HEIGHT_SINGLE;

		this.scrollEl = container.createDiv({ cls: "pe-gantt-scroll" });
		const chart = this.scrollEl.createDiv({ cls: "pe-gantt-chart" });
		chart.style.setProperty("--pe-gantt-label-w", `${LABEL_WIDTH}px`);
		chart.style.width = `${LABEL_WIDTH + chartWidth}px`;

		this.renderAxis(chart, dayCount, px, chartWidth, zoomId, headerHeight);
		this.renderRows(chart, rows, px, chartWidth);
		this.renderTodayMarker(chart, px, headerHeight);
		this.renderDependencies(chart, rows);
		this.renderFooter(chart);
	}

	public refresh(): void {
		this.render();
	}

	public destroy(): void {
		this.scrollEl = null;
		this.props.container.empty();
	}

	private renderToolbar(zoomId: GanttZoomId, onZoomChange: (zoom: GanttZoomId) => void): void {
		const toolbar = this.props.container.createDiv({ cls: "pe-gantt-toolbar" });

		const zoomGroup = toolbar.createDiv({ cls: "pe-segmented pe-gantt-zoom" });
		for (const preset of ZOOM_PRESETS) {
			const button = zoomGroup.createEl("button", {
				text: preset.label,
				cls: `pe-segment pe-touch-target${zoomId === preset.id ? " is-active" : ""}`,
				attr: { type: "button", "aria-pressed": String(zoomId === preset.id) },
			});
			button.addEventListener("click", () => onZoomChange(preset.id));
		}

		const actions = toolbar.createDiv({ cls: "pe-gantt-actions" });
		for (const [label, handler] of [
			["Today", () => this.scrollToToday()],
			["Expand all", () => this.setAllCollapsed(false)],
			["Collapse all", () => this.setAllCollapsed(true)],
		] as const) {
			const btn = actions.createEl("button", {
				text: label,
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			btn.addEventListener("click", handler);
		}
	}

	private filterTasks(tasks: Task[], projectId: string, filterText: string): Task[] {
		const q = filterText.trim().toLowerCase();
		return tasks.filter((task) => {
			if (task.projectId !== projectId) return false;
			if (!q) return true;
			return `${task.title} ${task.id}`.toLowerCase().includes(q);
		});
	}

	private collapsedSet(): Set<TaskId> {
		return this.props.collapsedIds ?? this.internalCollapsed;
	}

	private toggleCollapse(id: TaskId): void {
		if (this.props.onToggleCollapse) {
			this.props.onToggleCollapse(id);
			this.render();
			return;
		}
		const set = this.internalCollapsed;
		if (set.has(id)) {
			set.delete(id);
		} else {
			set.add(id);
		}
		this.render();
	}

	private setAllCollapsed(collapsed: boolean): void {
		const filtered = this.filterTasks(
			this.props.tasks,
			this.props.project.id,
			this.props.filterText,
		);
		const byParent = groupByParent(filtered);
		const set = this.collapsedSet();
		if (!collapsed) {
			set.clear();
		} else {
			for (const task of filtered) {
				if ((byParent.get(task.id) ?? []).length > 0) {
					set.add(task.id);
				}
			}
		}
		this.render();
	}

	private buildVisibleRows(tasks: Task[]): GanttRow[] {
		const byParent = groupByParent(tasks);
		for (const list of byParent.values()) {
			list.sort(
				(a, b) =>
					(a.startDate ?? "").localeCompare(b.startDate ?? "") ||
					a.title.localeCompare(b.title),
			);
		}

		const collapsed = this.collapsedSet();
		const rows: GanttRow[] = [];

		const visit = (parentId: TaskId | null, depth: number): void => {
			for (const task of byParent.get(parentId) ?? []) {
				const children = byParent.get(task.id) ?? [];
				const hasChildren = children.length > 0;
				const dated = resolveDates(task);
				rows.push({
					task,
					depth,
					hasChildren,
					start: dated?.start ?? null,
					end: dated?.end ?? null,
				});
				if (hasChildren && !collapsed.has(task.id)) {
					visit(task.id, depth + 1);
				}
			}
		};
		visit(null, 0);
		return rows;
	}

	private computeRange(rows: GanttRow[]): void {
		const dated = rows.filter((row) => row.start && row.end) as Array<
			GanttRow & { start: IsoDate; end: IsoDate }
		>;
		if (dated.length === 0) {
			const today = formatIsoDate(new Date());
			this.rangeStart = addDays(today, -14);
			this.rangeEnd = addDays(today, 60);
			return;
		}
		let min = dated[0]!.start;
		let max = dated[0]!.end;
		for (const row of dated) {
			if (row.start < min) min = row.start;
			if (row.end > max) max = row.end;
		}
		this.rangeStart = addDays(min, -7);
		this.rangeEnd = addDays(max, 14);
	}

	private renderAxis(
		chart: HTMLElement,
		dayCount: number,
		px: number,
		chartWidth: number,
		zoomId: GanttZoomId,
		headerHeight: number,
	): void {
		const axis = chart.createDiv({ cls: "pe-gantt-axis" });
		axis.style.height = `${headerHeight}px`;
		if (zoomId === "week") {
			axis.addClass("pe-gantt-axis--dual");
		}

		const corner = axis.createDiv({ cls: "pe-gantt-corner" });
		corner.setText("TASK");
		corner.style.width = `${LABEL_WIDTH}px`;

		const ticksWrap = axis.createDiv({ cls: "pe-gantt-ticks-wrap" });
		ticksWrap.style.width = `${chartWidth}px`;

		const step = tickStepDays(zoomId);
		if (zoomId === "week") {
			const upper = ticksWrap.createDiv({ cls: "pe-gantt-ticks pe-gantt-ticks--upper" });
			const lower = ticksWrap.createDiv({ cls: "pe-gantt-ticks pe-gantt-ticks--lower" });
			for (let i = 0; i < dayCount; i += step) {
				const date = addDays(this.rangeStart, i);
				const tick = lower.createDiv({ cls: "pe-gantt-tick" });
				tick.style.left = `${i * px}px`;
				tick.style.width = `${step * px}px`;
				tick.setText(isoWeekLabel(date));
			}
			let spanStart = 0;
			let spanLabel = "";
			for (let i = 0; i <= dayCount; i += step) {
				const date = i < dayCount ? addDays(this.rangeStart, i) : null;
				const label = date ? monthYearLabel(date) : "";
				if (label !== spanLabel && spanLabel) {
					const tick = upper.createDiv({ cls: "pe-gantt-tick pe-gantt-tick--span" });
					tick.style.left = `${spanStart * px}px`;
					tick.style.width = `${(i - spanStart) * px}px`;
					tick.setText(spanLabel);
					spanStart = i;
				}
				if (date) spanLabel = label;
			}
		} else {
			const ticks = ticksWrap.createDiv({ cls: "pe-gantt-ticks" });
			for (let i = 0; i < dayCount; i += step) {
				const date = addDays(this.rangeStart, i);
				const tick = ticks.createDiv({ cls: "pe-gantt-tick" });
				tick.style.left = `${i * px}px`;
				tick.style.width = `${step * px}px`;
				tick.setText(formatTickLabel(date, zoomId));
			}
		}

		this.renderGridLines(chart, dayCount, px, chartWidth, step, headerHeight);
	}

	private renderGridLines(
		chart: HTMLElement,
		dayCount: number,
		px: number,
		chartWidth: number,
		step: number,
		headerHeight: number,
	): void {
		const grid = chart.createDiv({ cls: "pe-gantt-grid" });
		grid.style.setProperty("--pe-gantt-header-h", `${headerHeight}px`);
		grid.style.width = `${LABEL_WIDTH + chartWidth}px`;
		for (let i = 0; i < dayCount; i += step) {
			const line = grid.createDiv({ cls: "pe-gantt-grid-line" });
			line.style.left = `${LABEL_WIDTH + i * px}px`;
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

			const label = lane.createDiv({ cls: "pe-gantt-label" });
			label.style.width = `${LABEL_WIDTH}px`;
			label.style.paddingLeft = `${8 + row.depth * 16}px`;

			if (row.hasChildren) {
				const chevron = label.createSpan({ cls: "pe-gantt-chevron pe-touch-target" });
				const collapsed = this.collapsedSet().has(row.task.id);
				setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
				chevron.addEventListener("click", (event) => {
					event.stopPropagation();
					this.toggleCollapse(row.task.id);
				});
			} else {
				label.createSpan({ cls: "pe-gantt-chevron-spacer" });
			}

			label.createSpan({ cls: "pe-gantt-tree-dot" });
			const title = label.createSpan({ cls: "pe-gantt-label-text", text: row.task.title || row.task.id });
			title.title = row.task.id;
			label.addEventListener("click", () => this.openTask(row.task));

			const track = lane.createDiv({ cls: "pe-gantt-track" });
			track.style.width = `${chartWidth}px`;

			if (row.start && row.end) {
				const offset = daysBetween(this.rangeStart, row.start);
				const span = Math.max(daysBetween(row.start, row.end) + 1, 1);
				const isMilestone = row.task.isMilestone || row.task.durationDays === 0;
				const bar = track.createDiv({
					cls: `pe-gantt-bar pe-touch-target${isMilestone ? " is-milestone" : ""}${row.task.isStageBoundary ? " is-boundary" : ""}`,
				});
				const barWidth = isMilestone ? Math.max(px, 12) : span * px;
				bar.style.left = `${offset * px}px`;
				bar.style.width = `${barWidth}px`;
				if (!isMilestone) {
					bar.setText(`${row.start.slice(5)} → ${row.end.slice(5)}`);
				} else {
					bar.setText("◆");
				}
				bar.title = [
					row.task.title,
					`${row.start} → ${row.end}`,
					row.task.status,
					row.task.due ? `Due date: ${row.task.due}` : null,
					row.task.scheduled ? `Scheduled: ${row.task.scheduled}` : null,
				]
					.filter(Boolean)
					.join("\n");
				bar.addEventListener("click", () => this.openTask(row.task));

				lane.dataset.taskId = row.task.id;
				lane.dataset.barLeft = String(offset * px);
				lane.dataset.barWidth = String(barWidth);
				lane.dataset.rowIndex = String(index);
			}
		});

		body.style.height = `${rows.length * ROW_HEIGHT}px`;
	}

	private renderTodayMarker(chart: HTMLElement, px: number, headerHeight: number): void {
		const today = formatIsoDate(new Date());
		if (today < this.rangeStart || today > this.rangeEnd) {
			return;
		}
		const offset = daysBetween(this.rangeStart, today);
		const left = LABEL_WIDTH + offset * px + px / 2;

		const marker = chart.createDiv({ cls: "pe-gantt-today" });
		marker.style.setProperty("--pe-gantt-today-x", `${left}px`);
		marker.style.setProperty("--pe-gantt-header-h", `${headerHeight}px`);

		const diamond = marker.createDiv({ cls: "pe-gantt-today-diamond" });
		diamond.setAttribute("aria-hidden", "true");
		marker.createDiv({ cls: "pe-gantt-today-line" });
	}

	private renderFooter(chart: HTMLElement): void {
		const footer = chart.createDiv({ cls: "pe-gantt-footer" });
		const labelCol = footer.createDiv({ cls: "pe-gantt-footer-label" });
		labelCol.style.width = `${LABEL_WIDTH}px`;
		const addBtn = labelCol.createEl("button", {
			cls: "pe-gantt-add-task pe-link-button pe-touch-target",
			attr: { type: "button" },
		});
		addBtn.createSpan({ cls: "pe-gantt-add-icon", text: "+" });
		addBtn.createSpan({ text: " Add task" });
		addBtn.addEventListener("click", () => this.openNewTask());
	}

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

	private scrollToToday(): void {
		if (!this.scrollEl) return;
		const today = formatIsoDate(new Date());
		const px = ZOOM_PRESETS.find((z) => z.id === this.props.zoomId)?.pxPerDay ?? 12;
		const offset = daysBetween(this.rangeStart, today);
		const x = LABEL_WIDTH + offset * px - this.scrollEl.clientWidth / 3;
		this.scrollEl.scrollLeft = Math.max(0, x);
	}

	private openNewTask(): void {
		const { plugin, project } = this.props;
		void openTaskEditor(plugin, {
			projectId: project.id,
			projectLink: toWikiLink(project.file.basename),
		});
	}

	private openTask(task: Task): void {
		const { plugin, project } = this.props;
		void openTaskEditor(plugin, {
			projectId: project.id,
			projectLink: toWikiLink(project.file.basename),
			existing: task,
			parentId: task.parentId,
		});
	}
}

function groupByParent(tasks: Task[]): Map<TaskId | null, Task[]> {
	const byParent = new Map<TaskId | null, Task[]>();
	const ids = new Set(tasks.map((t) => t.id));
	for (const task of tasks) {
		const key =
			task.parentId && ids.has(task.parentId) ? task.parentId : null;
		const list = byParent.get(key) ?? [];
		list.push(task);
		byParent.set(key, list);
	}
	return byParent;
}

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

function daysBetween(a: IsoDate, b: IsoDate): number {
	const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
	return Math.round(ms / 86_400_000);
}

function tickStepDays(zoomId: GanttZoomId): number {
	switch (zoomId) {
		case "day":
			return 1;
		case "week":
			return 7;
		case "month":
			return 30;
		case "quarter":
			return 91;
		case "year":
			return 365;
	}
}

function formatTickLabel(iso: IsoDate, zoomId: GanttZoomId): string {
	const date = parseIsoDate(iso);
	switch (zoomId) {
		case "day":
			return iso.slice(5);
		case "month":
			return date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
		case "quarter": {
			const q = Math.floor(date.getUTCMonth() / 3) + 1;
			return `Q${q}`;
		}
		case "year":
			return String(date.getUTCFullYear());
		default:
			return iso;
	}
}

function isoWeekLabel(iso: IsoDate): string {
	const date = parseIsoDate(iso);
	const day = date.getUTCDay() || 7;
	const thursday = new Date(date);
	thursday.setUTCDate(date.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `W${week}`;
}

function monthYearLabel(iso: IsoDate): string {
	const date = parseIsoDate(iso);
	const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase();
	const year = String(date.getUTCFullYear()).slice(-2);
	return `${month} ${year}`;
}
