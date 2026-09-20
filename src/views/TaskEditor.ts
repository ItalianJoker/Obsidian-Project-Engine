/**
 * Mountable task editor: recursive nested subtasks, dependencies with cycle detection,
 * time logs, estimate vs actual / remaining effort, start/end/due/scheduled with optional
 * time via Settings-aware calendar/clock pickers, and undo/redo via the Scheduler
 * Command Pattern + vault.process persistence.
 *
 * Hosted in a modal or as {@link TaskView} ItemView (obsidian-pm parity).
 */

import { Notice, TFile, type App } from "obsidian";
import type ProjectsEnginePlugin from "../main";
import type {
	Task,
	TaskId,
	TaskPriority,
	TaskStatus,
	TimeLog,
	WikiLink,
} from "../models/types";
import {
	activeTaskStatuses,
	defaultTaskStatusId,
	resolveEisenhowerFlags,
	toWikiLink,
} from "../models/types";
import { CycleDetectedError } from "../engine/Scheduler";
import {
	PersistCascadeCommand,
	PersistDependencyCommand,
	recomputeBlockingMaps,
} from "../services/taskCommands";
import {
	blankTaskDraft,
	buildTaskTree,
	loadAllTasks,
	nextTaskId,
	parseTaskNote,
	saveTaskNote,
	taskNotePath,
	toSchedulable,
	uniqueTaskPath,
	type TaskDraft,
} from "../services/taskIo";
import {
	collectTaskSubtreeIds,
	deleteTaskConfirmMessage,
	deleteTaskSubtree,
	notifyTaskDeleted,
} from "../services/taskDelete";
import {
	computeEffortRollup,
	formatHours,
	formatHoursAndGiornate,
} from "../services/timeLogs";
import { splitFrontmatter } from "../services/frontmatter";
import {
	calendarDatePart,
	dateFormatPlaceholder,
	formatDisplayDate,
	parseDisplayDate,
	timeFormatPlaceholder,
} from "../services/dateFormat";
import { resolveProjectTasksFolder } from "../services/projectScaffold";
import { ConfirmModal } from "../ui/ConfirmModal";
import { findProjectRow, loadProjectRows } from "./projectRows";
import { EntitySuggest } from "./suggest";
import { mountDateTimeField } from "./dateTimeInputs";

/**
 * Host surface for {@link TaskEditor} — modal dialog or dedicated ItemView tab.
 * Pattern adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) TaskEditorHost
 * (MIT © 2026 Stepan Kropachev and dotpm contributors).
 */
export interface TaskEditorHost {
	surface: "modal" | "tab";
	close: () => void;
}

const TASK_PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Mountable task editor (modal or tab surface).
 * UI pattern adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) TaskEditor
 * (MIT © 2026 Stepan Kropachev and dotpm contributors); PE domain (hours, DAG, vault.process).
 */
export class TaskEditor {
	private draft: TaskDraft;
	private allTasks: Task[] = [];
	private readonly suggests: EntitySuggest[] = [];
	private errorEl: HTMLElement | null = null;
	private treeEl: HTMLElement | null = null;
	private mandayEl: HTMLElement | null = null;
	private mode: "create" | "edit";
	private rootEl: HTMLElement | null = null;
	private readonly app: App;
	private readonly plugin: ProjectsEnginePlugin;
	private readonly projectId: string;
	private readonly projectLink: WikiLink;
	private readonly host: TaskEditorHost;
	private readonly onSaved?: () => void;

	constructor(
		app: App,
		plugin: ProjectsEnginePlugin,
		projectId: string,
		projectLink: WikiLink,
		existing: Task | null = null,
		parentId: TaskId | null = null,
		host: TaskEditorHost,
		onSaved?: () => void,
	) {
		this.app = app;
		this.plugin = plugin;
		this.projectId = projectId;
		this.projectLink = projectLink;
		this.host = host;
		this.onSaved = onSaved;
		this.mode = existing ? "edit" : "create";
		if (existing) {
			this.draft = taskToDraft(existing);
		} else {
			const placeholderId = `${projectId}#T-pending`;
			const priority: TaskPriority = "none";
			this.draft = blankTaskDraft({
				id: placeholderId,
				projectId,
				projectLink,
				parentId,
				filePath: "",
				status: defaultTaskStatusId(plugin.settings.taskStatuses),
				priority,
			});
			// Important defaults false; Urgent comes from Priority (none → not urgent).
			this.draft.important = false;
		}
	}

	/** Display title for leaf chrome. */
	public get title(): string {
		return this.draft.title.trim() || (this.mode === "create" ? "New task" : "Task");
	}

	/** Mount into a modal body or ItemView contentEl. */
	public mount(container: HTMLElement): void {
		this.rootEl = container;
		container.addClass("pe-te-surface");
		if (this.host.surface === "tab") {
			container.addClass("pe-te-view");
		} else {
			container.addClass("pe-modal-body");
		}
		void this.bootstrap();
	}

	/** Tear down suggests and DOM. */
	public destroy(): void {
		for (const suggest of this.suggests) {
			suggest.close();
		}
		this.suggests.length = 0;
		this.rootEl?.empty();
		this.rootEl = null;
	}

	private closeHost(): void {
		this.host.close();
	}

	private closeAfterSave(): void {
		this.onSaved?.();
		this.host.close();
	}

	private async bootstrap(): Promise<void> {
		this.allTasks = await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);
		if (this.mode === "create") {
			const id = nextTaskId(
				this.projectId,
				this.allTasks.map((task) => task.id),
			);
			this.draft.id = id;
			const tasksFolder = this.resolveTasksFolder();
			const preferred = taskNotePath(tasksFolder, id, "New task");
			this.draft.filePath = uniqueTaskPath(this.app.vault, preferred);
		}
		this.render();
	}

	/**
	 * Prefer the project’s Tasks/ subfolder (§9 containment).
	 */
	private resolveTasksFolder(): string {
		const row = findProjectRow(loadProjectRows(this.app), this.projectId);
		if (row) {
			return resolveProjectTasksFolder(row.file, this.plugin.settings);
		}
		return this.plugin.settings.tasksFolder;
	}

	private render(): void {
		const contentEl = this.rootEl;
		if (!contentEl) return;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.mode === "create" ? "New task" : "Edit task" });
		contentEl.createEl("p", {
			cls: "pe-modal-lead",
			text: `ID ${this.draft.id} · Project ${this.projectId}`,
		});

		this.errorEl = contentEl.createDiv({ cls: "pe-errors", attr: { role: "alert" } });
		this.errorEl.hide();

		this.addText("Title *", this.draft.title, (value) => {
			this.draft.title = value;
		});

		this.addStatus();
		this.addPriority();
		this.addEisenhowerFlags();
		this.addNumber("Duration (calendar days)", this.draft.durationDays, (value) => {
			this.draft.durationDays = value;
			if (value === 0) {
				this.draft.isMilestone = true;
			}
		});
		this.addNumber(
			"Estimate (hours)",
			this.draft.estimateHours,
			(value) => {
				this.draft.estimateHours = value;
				this.refreshMandays();
			},
			`Fractions OK (0.5, 1.25). 1 day = ${this.plugin.settings.hoursPerManday} h.`,
		);

		this.addDateTimeField("Start date", this.draft.startDate, (value) => {
			this.draft.startDate = value;
		});
		this.addDateTimeField("End date", this.draft.endDate, (value) => {
			this.draft.endDate = value;
		});
		this.addDateTimeField("Due date", this.draft.due, (value) => {
			this.draft.due = value;
		});
		this.addDateTimeField("Scheduled", this.draft.scheduled, (value) => {
			this.draft.scheduled = value;
		});

		this.addAssignee();
		this.addFlags();
		this.addDependencies();
		this.addTimeLogs();

		this.mandayEl = contentEl.createDiv({ cls: "pe-manday-summary" });
		this.refreshMandays();

		this.treeEl = contentEl.createDiv({ cls: "pe-task-tree" });
		this.renderSubtree();

		const footer = contentEl.createDiv({ cls: "pe-te-footer" });
		this.addScheduleActions(footer);
		this.addActions(footer);
	}

	private addText(label: string, value: string, onChange: (value: string) => void): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", spellcheck: "false" },
		});
		input.value = value;
		input.addEventListener("input", () => onChange(input.value));
	}

	private addNumber(
		label: string,
		value: number,
		onChange: (value: number) => void,
		help?: string,
	): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: label, cls: "pe-label" });
		if (help) {
			wrap.createEl("p", { text: help, cls: "pe-help" });
		}
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "number", min: "0", step: "0.25" },
		});
		input.value = String(value);
		input.addEventListener("input", () => {
			const parsed = Number.parseFloat(input.value);
			onChange(Number.isFinite(parsed) ? parsed : 0);
		});
	}

	private addPriority(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Priority", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Also drives Eisenhower Urgent: High or Urgent priority = Urgent; None / Low / Medium = Not urgent.",
		});
		const select = wrap.createEl("select", {
			cls: "pe-input pe-touch-target",
			attr: { "aria-label": "Priority" },
		});
		for (const priority of TASK_PRIORITIES) {
			select.createEl("option", { text: priority, attr: { value: priority } });
		}
		select.value = this.draft.priority;
		select.addEventListener("change", () => {
			this.draft.priority = select.value as TaskPriority;
			// Refresh Eisenhower help row so the derived Urgent hint stays accurate.
			this.refreshEisenhowerHint();
		});
	}

	/**
	 * Important toggle for the Eisenhower matrix. Urgent is derived from Priority
	 * (`high` | `urgent` → Urgent) — no separate Urgent checkbox.
	 */
	private addEisenhowerFlags(): void {
		const wrap = this.rootEl!.createDiv({
			cls: "pe-field pe-flag-row pe-eisenhower-flags",
		});
		this.eisenhowerHintEl = wrap.createEl("p", { cls: "pe-help" });
		this.refreshEisenhowerHint();

		const important = wrap.createEl("label", { cls: "pe-check-label pe-touch-target" });
		const importantCb = important.createEl("input", { attr: { type: "checkbox" } });
		importantCb.checked = this.draft.important === true;
		important.createSpan({ text: "Important" });
		importantCb.addEventListener("change", () => {
			this.draft.important = importantCb.checked;
		});
	}

	private eisenhowerHintEl: HTMLElement | null = null;

	/** Update the derived-Urgent explanation under the Important checkbox. */
	private refreshEisenhowerHint(): void {
		if (!this.eisenhowerHintEl) return;
		const flags = resolveEisenhowerFlags({
			important: this.draft.important,
			priority: this.draft.priority,
		});
		const urgentLabel = flags.urgent ? "Urgent" : "Not urgent";
		this.eisenhowerHintEl.setText(
			`Toggle Important for the matrix. Urgent is derived from Priority (currently ${urgentLabel} because Priority is “${this.draft.priority}”). Rule: High or Urgent → Urgent; None / Low / Medium → Not urgent.`,
		);
	}

	/**
	 * Date + optional time using native calendar/clock pickers synced with
	 * Settings-format text (default DD/MM/YYYY + 24h). YAML stays ISO.
	 */
	private addDateTimeField(
		label: string,
		value: string | null,
		onChange: (value: string | null) => void,
	): void {
		const dateFormat = this.plugin.settings.dateFormat;
		const timeFormat = this.plugin.settings.timeFormat;
		mountDateTimeField(this.rootEl!, {
			label,
			value,
			dateFormat,
			timeFormat,
			includeTime: true,
			onChange,
			help: `Optional time. Type as ${dateFormatPlaceholder(dateFormat)} and ${timeFormatPlaceholder(timeFormat)}, or use the calendar / clock controls. Stored as ISO in frontmatter.`,
		});
	}

	private addStatus(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Status", cls: "pe-label" });
		const select = wrap.createEl("select", { cls: "pe-input pe-touch-target" });
		const statuses = this.plugin.settings.taskStatuses;
		const active = activeTaskStatuses(statuses);
		const options = [...active];
		// Keep the current (possibly archived) status selectable when editing.
		if (
			this.draft.status &&
			!options.some((item) => item.id === this.draft.status)
		) {
			const archived = statuses.find((item) => item.id === this.draft.status);
			options.push(
				archived ?? {
					id: this.draft.status,
					label: this.draft.status,
				},
			);
		}
		for (const status of options) {
			select.createEl("option", {
				text: status.label,
				attr: { value: status.id },
			});
		}
		select.value = this.draft.status;
		select.addEventListener("change", () => {
			this.draft.status = select.value as TaskStatus;
		});
	}

	private addAssignee(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Assignee", cls: "pe-label" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "Stakeholder / Assignee…", spellcheck: "false" },
		});
		input.value = this.draft.assignee
			? this.draft.assignee.replace(/^\[\[/, "").replace(/\]\]$/, "")
			: "";
		const suggest = new EntitySuggest(
			this.app,
			input,
			() => this.plugin.indexer.list("stakeholder"),
			(suggestion) => {
				const name = suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
				input.value = name;
				this.draft.assignee = toWikiLink(name);
			},
		);
		this.suggests.push(suggest);
		input.addEventListener("input", () => {
			this.draft.assignee = input.value.trim() ? toWikiLink(input.value.trim()) : undefined;
		});
	}

	private addFlags(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field pe-flag-row" });
		const milestone = wrap.createEl("label", { cls: "pe-check-label pe-touch-target" });
		const milestoneCb = milestone.createEl("input", { attr: { type: "checkbox" } });
		milestoneCb.checked = this.draft.isMilestone;
		milestone.createSpan({ text: "Milestone" });
		milestoneCb.addEventListener("change", () => {
			this.draft.isMilestone = milestoneCb.checked;
			if (milestoneCb.checked) {
				this.draft.durationDays = 0;
			}
		});

		const boundary = wrap.createEl("label", { cls: "pe-check-label pe-touch-target" });
		const boundaryCb = boundary.createEl("input", { attr: { type: "checkbox" } });
		boundaryCb.checked = this.draft.isStageBoundary;
		boundary.createSpan({ text: "PRINCE2 stage boundary" });
		boundaryCb.addEventListener("change", () => {
			this.draft.isStageBoundary = boundaryCb.checked;
			if (boundaryCb.checked) {
				this.draft.isMilestone = true;
				this.draft.durationDays = 0;
				milestoneCb.checked = true;
			}
		});
	}

	private addDependencies(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Blocked by (dependencies)", cls: "pe-label" });
		wrap.createEl("p", {
			cls: "pe-help",
			text: "Intra- or cross-project task ids. Cycle detection runs before save.",
		});
		const chips = wrap.createDiv({ cls: "pe-chip-row" });
		const input = wrap.createEl("input", {
			cls: "pe-input pe-touch-target",
			attr: { type: "text", placeholder: "PRJ-2026-001#T-2", spellcheck: "false" },
		});

		const render = (): void => {
			chips.empty();
			for (const id of this.draft.blockedBy) {
				const chip = chips.createDiv({ cls: "pe-chip" });
				chip.createEl("span", { text: id, cls: "pe-chip-label" });
				const remove = chip.createEl("button", {
					text: "×",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.draft.blockedBy = this.draft.blockedBy.filter((item) => item !== id);
					render();
				});
			}
		};

		const add = (): void => {
			const id = input.value.trim();
			if (!id || this.draft.blockedBy.includes(id) || id === this.draft.id) {
				input.value = "";
				return;
			}
			const known = this.allTasks.map(toSchedulable);
			const self = toSchedulable(this.draft);
			const working = known.some((task) => task.id === self.id)
				? known.map((task) => (task.id === self.id ? self : task))
				: [...known, self];
			const cycle = this.plugin.scheduler.wouldCreateCycle(working, id, this.draft.id);
			if (cycle) {
				new Notice(`Dependency cycle: ${cycle.join(" → ")}`);
				return;
			}
			this.draft.blockedBy.push(id);
			input.value = "";
			render();
		};

		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				add();
			}
		});
		const addBtn = wrap.createEl("button", {
			text: "Add dependency",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		addBtn.addEventListener("click", add);
		render();
	}

	private addTimeLogs(): void {
		const wrap = this.rootEl!.createDiv({ cls: "pe-field" });
		wrap.createEl("label", { text: "Time logs", cls: "pe-label" });
		const list = wrap.createDiv({ cls: "pe-timelog-list" });

		const render = (): void => {
			list.empty();
			const dateFormat = this.plugin.settings.dateFormat;
			this.draft.timeLogs.forEach((log, index) => {
				const row = list.createDiv({ cls: "pe-timelog-row" });
				const date = row.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: {
						type: "text",
						placeholder: dateFormatPlaceholder(dateFormat),
						spellcheck: "false",
						"aria-label": "Time log date",
					},
				});
				date.value = log.date ? formatDisplayDate(log.date, dateFormat) : "";
				const commitDate = (): void => {
					const trimmed = date.value.trim();
					if (!trimmed) {
						log.date = "";
						this.refreshMandays();
						return;
					}
					const iso = parseDisplayDate(trimmed, dateFormat);
					if (iso) {
						log.date = iso;
						date.value = formatDisplayDate(iso, dateFormat);
						this.refreshMandays();
					}
				};
				date.addEventListener("change", commitDate);
				date.addEventListener("blur", commitDate);
				const duration = row.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: { type: "number", min: "0", step: "0.25", placeholder: "Hours" },
				});
				duration.value = String(log.duration);
				duration.addEventListener("input", () => {
					log.duration = Number.parseFloat(duration.value) || 0;
					this.refreshMandays();
				});
				const member = row.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: { type: "text", placeholder: "Member" },
				});
				member.value = log.member.replace(/^\[\[/, "").replace(/\]\]$/, "");
				const suggest = new EntitySuggest(
					this.app,
					member,
					() => this.plugin.indexer.list("stakeholder"),
					(suggestion) => {
						const name =
							suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
						member.value = name;
						log.member = toWikiLink(name);
					},
				);
				this.suggests.push(suggest);
				member.addEventListener("input", () => {
					log.member = member.value.trim() ? toWikiLink(member.value.trim()) : "";
				});
				const note = row.createEl("input", {
					cls: "pe-input pe-touch-target",
					attr: { type: "text", placeholder: "Note" },
				});
				note.value = log.note;
				note.addEventListener("input", () => {
					log.note = note.value;
				});
				const remove = row.createEl("button", {
					text: "Remove",
					cls: "pe-chip-remove pe-touch-target",
					attr: { type: "button" },
				});
				remove.addEventListener("click", () => {
					this.draft.timeLogs = this.draft.timeLogs.filter((_, i) => i !== index);
					render();
					this.refreshMandays();
				});
			});
		};

		const add = wrap.createEl("button", {
			text: "Add time log",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		add.addEventListener("click", () => {
			const today = new Date().toISOString().slice(0, 10);
			const row: TimeLog = { date: today, duration: 1, member: "", note: "" };
			this.draft.timeLogs.push(row);
			render();
			this.refreshMandays();
		});
		render();
	}

	private refreshMandays(): void {
		if (!this.mandayEl) return;
		const hoursPer = this.plugin.settings.hoursPerManday;
		const rollup = computeEffortRollup(
			this.draft.estimateHours,
			this.draft.timeLogs,
			hoursPer,
		);
		this.mandayEl.empty();
		this.mandayEl.createEl("strong", { text: "Effort" });
		this.mandayEl.createEl("p", {
			text: `Estimate ${formatHoursAndGiornate(rollup.estimateHours, hoursPer)} · Logged ${formatHoursAndGiornate(rollup.actualHours, hoursPer)} · Remaining ${formatHours(rollup.remainingHours)}${
				rollup.overrunHours > 0 ? ` · Overrun ${formatHours(rollup.overrunHours)}` : ""
			}`,
		});
		this.mandayEl.createEl("p", {
			cls: "pe-help",
			text: `Time logs use hours. Management budget uses days (1 day = ${hoursPer} h).`,
		});
	}

	/**
	 * Render recursive nested subtasks (arbitrary depth) as an accordion tree.
	 */
	private renderSubtree(): void {
		if (!this.treeEl) return;
		this.treeEl.empty();
		this.treeEl.createEl("h3", { text: "Subtasks", cls: "pe-section-title" });
		const addChild = this.treeEl.createEl("button", {
			text: "Add subtask",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		addChild.addEventListener("click", () => {
			void this.openChildEditor(this.draft.id);
		});

		const projectTasks = this.allTasks.filter((task) => task.projectId === this.projectId);
		const tree = buildTaskTree(projectTasks);
		const roots = tree.get(this.draft.id) ?? [];
		const list = this.treeEl.createDiv({ cls: "pe-tree-list" });
		const renderNode = (task: Task, depth: number): void => {
			const details = list.createEl("details", { cls: "pe-tree-node" });
			details.open = depth < 2;
			const summary = details.createEl("summary", { cls: "pe-tree-summary pe-touch-target" });
			summary.setText(`${"· ".repeat(depth)}${task.title || task.id} (${task.status})`);
			const actions = details.createDiv({ cls: "pe-inline-row" });
			const edit = actions.createEl("button", {
				text: "Edit",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			edit.addEventListener("click", () => {
				this.closeHost();
				void openTaskEditor(this.plugin, {
					projectId: this.projectId,
					projectLink: this.projectLink,
					existing: task,
					parentId: task.parentId,
				});
			});
			const nest = actions.createEl("button", {
				text: "Add child",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			nest.addEventListener("click", () => {
				void this.openChildEditor(task.id);
			});
			for (const child of tree.get(task.id) ?? []) {
				renderNode(child, depth + 1);
			}
		};
		for (const root of roots) {
			renderNode(root, 0);
		}
		if (roots.length === 0) {
			list.createEl("p", { text: "No subtasks yet.", cls: "pe-help" });
		}
	}

	private async openChildEditor(parentId: TaskId): Promise<void> {
		if (this.mode === "create") {
			new Notice("Save the parent task before adding subtasks");
			return;
		}
		this.closeHost();
		void openTaskEditor(this.plugin, {
			projectId: this.projectId,
			projectLink: this.projectLink,
			existing: null,
			parentId,
		});
	}

	private addScheduleActions(parent: HTMLElement = this.rootEl!): void {
		const wrap = parent.createDiv({ cls: "pe-inline-row pe-schedule-actions" });
		const auto = wrap.createEl("button", {
			text: "Auto-schedule project",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		auto.addEventListener("click", () => {
			void this.runAutoSchedule();
		});
		const undo = wrap.createEl("button", {
			text: "Undo",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		undo.addEventListener("click", () => {
			if (!this.plugin.commandStack.undo()) {
				new Notice("Nothing to undo");
			} else {
				new Notice("Undid last schedule change");
				void this.bootstrap();
			}
		});
		const redo = wrap.createEl("button", {
			text: "Redo",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		redo.addEventListener("click", () => {
			if (!this.plugin.commandStack.redo()) {
				new Notice("Nothing to redo");
			} else {
				new Notice("Redid last schedule change");
				void this.bootstrap();
			}
		});
	}

	private async runAutoSchedule(): Promise<void> {
		try {
			await this.persistDraft();
			this.allTasks = await loadAllTasks(
				this.app,
				this.plugin.settings.tasksFolder,
				this.plugin.settings.hoursPerManday,
			);
			const projectTasks = this.allTasks.filter((task) => task.projectId === this.projectId);
			const schedulable = projectTasks.map(toSchedulable);
			const projectStart =
				calendarDatePart(this.draft.startDate) ??
				calendarDatePart(projectTasks.find((task) => task.startDate)?.startDate) ??
				new Date().toISOString().slice(0, 10);
			const result = this.plugin.scheduler.autoSchedule(schedulable, {
				projectStart,
				asSoonAsPossible: true,
			});
			const patches = this.plugin.scheduler.diff(schedulable, result);
			const fileByTaskId = new Map<TaskId, TFile>();
			for (const task of projectTasks) {
				const file = this.app.vault.getAbstractFileByPath(task.filePath);
				if (file instanceof TFile) {
					fileByTaskId.set(task.id, file);
				}
			}
			this.plugin.commandStack.execute(
				new PersistCascadeCommand(this.app.vault, fileByTaskId, patches),
			);
			new Notice(`Scheduled ${patches.length} task date(s)`);
			await this.bootstrap();
		} catch (error) {
			if (error instanceof CycleDetectedError) {
				new Notice(error.message);
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Schedule failed: ${message}`);
		}
	}

	private addActions(parent: HTMLElement = this.rootEl!): void {
		const row = parent.createDiv({ cls: "pe-actions pe-te-actions" });
		// Delete only in edit mode — create drafts have no vault file yet.
		if (this.mode === "edit") {
			const del = row.createEl("button", {
				text: "Delete task…",
				cls: "pe-danger pe-touch-target pe-te-delete",
				attr: { type: "button" },
			});
			del.addEventListener("click", () => this.confirmDelete());
		}
		const cancel = row.createEl("button", {
			text: "Cancel",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.closeHost());
		const save = row.createEl("button", {
			text: "Save task",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		save.addEventListener("click", () => {
			void this.submit();
		});
	}

	/**
	 * Confirm then delete this task and its nested subtasks (subtree policy).
	 * Children are removed with the parent — they are not reparented/orphaned —
	 * so the confirm copy always states the nested count when > 0.
	 */
	private confirmDelete(): void {
		const existing = this.allTasks.find((task) => task.id === this.draft.id);
		if (!existing) {
			new Notice("Task note not found on disk");
			return;
		}
		const subtreeCount = collectTaskSubtreeIds(existing.id, this.allTasks).length;
		new ConfirmModal(this.app, {
			title: "Delete task?",
			message: deleteTaskConfirmMessage(existing, subtreeCount),
			confirmLabel: "Delete task",
			dangerous: true,
			onConfirm: async () => {
				try {
					const result = await deleteTaskSubtree({
						app: this.app,
						vault: this.app.vault,
						root: existing,
						allTasks: this.allTasks,
					});
					notifyTaskDeleted(existing.title.trim() || existing.id, result);
					this.plugin.refreshOpenViews();
					this.onSaved?.();
					this.host.close();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not delete task: ${message}`);
				}
			},
		}).open();
	}

	private async submit(): Promise<void> {
		const errors: string[] = [];
		if (!this.draft.title.trim()) {
			errors.push("Title is required");
		}
		if (this.draft.durationDays < 0) {
			errors.push("Duration cannot be negative");
		}
		this.showErrors(errors);
		if (errors.length > 0) {
			new Notice(errors[0] ?? "Validation failed");
			return;
		}

		try {
			await this.persistDraft();
			new Notice(`Saved task ${this.draft.id}`);
			this.plugin.refreshOpenViews();
			// Stay in the plugin UI only — do not open the Markdown note in the
			// Obsidian editor after save (modal or task-edit leaf).
			this.closeAfterSave();
		} catch (error) {
			if (error instanceof CycleDetectedError) {
				new Notice(error.message);
				this.showErrors([error.message]);
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not save task: ${message}`);
			this.showErrors([message]);
		}
	}

	/**
	 * Write the draft and maintain bidirectional blocked_by / blocking lists.
	 */
	private async persistDraft(): Promise<void> {
		const tasksFolder = this.resolveTasksFolder();
		if (!this.draft.filePath) {
			const preferred = taskNotePath(tasksFolder, this.draft.id, this.draft.title);
			this.draft.filePath = uniqueTaskPath(this.app.vault, preferred);
		} else if (this.mode === "create") {
			this.draft.filePath = uniqueTaskPath(
				this.app.vault,
				taskNotePath(tasksFolder, this.draft.id, this.draft.title),
			);
		}

		const previous = this.allTasks.find((task) => task.id === this.draft.id);
		const previousBlockedBy = previous?.blockedBy ?? [];
		const nextBlockedBy = [...this.draft.blockedBy];

		const working = this.allTasks.map(toSchedulable);
		const self = toSchedulable(this.draft);
		const graph = working.some((task) => task.id === self.id)
			? working.map((task) => (task.id === self.id ? { ...self, blockedBy: nextBlockedBy } : task))
			: [...working, { ...self, blockedBy: nextBlockedBy }];
		for (const blockerId of nextBlockedBy) {
			const cycle = this.plugin.scheduler.wouldCreateCycle(graph, blockerId, this.draft.id);
			if (cycle) {
				throw new CycleDetectedError([cycle]);
			}
		}

		await saveTaskNote(this.app.vault, this.draft, this.plugin.settings.hoursPerManday);

		if (this.draft.parentId) {
			await this.ensureParentChildLink(this.draft.parentId, this.draft.id);
		}

		const file = this.app.vault.getAbstractFileByPath(this.draft.filePath);
		if (!(file instanceof TFile)) {
			return;
		}

		const refreshed = await loadAllTasks(
			this.app,
			this.plugin.settings.tasksFolder,
			this.plugin.settings.hoursPerManday,
		);
		const { previousBlockingOnBlockers, nextBlockingOnBlockers } = recomputeBlockingMaps(
			refreshed.map((task) =>
				task.id === this.draft.id
					? { id: task.id, blockedBy: previousBlockedBy, blocking: task.blocking }
					: { id: task.id, blockedBy: task.blockedBy, blocking: task.blocking },
			),
			this.draft.id,
			nextBlockedBy,
		);
		const blockerFiles = new Map<TaskId, TFile>();
		for (const task of refreshed) {
			const f = this.app.vault.getAbstractFileByPath(task.filePath);
			if (f instanceof TFile) {
				blockerFiles.set(task.id, f);
			}
		}
		if (
			previousBlockedBy.join("|") !== nextBlockedBy.join("|") ||
			nextBlockingOnBlockers.size > 0
		) {
			this.plugin.commandStack.execute(
				new PersistDependencyCommand(
					this.app.vault,
					file,
					blockerFiles,
					this.draft.id,
					previousBlockedBy,
					nextBlockedBy,
					previousBlockingOnBlockers,
					nextBlockingOnBlockers,
				),
			);
		}
	}

	private async ensureParentChildLink(parentId: TaskId, childId: TaskId): Promise<void> {
		const parent = this.allTasks.find((task) => task.id === parentId);
		if (!parent) {
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(parent.filePath);
		if (!(file instanceof TFile)) {
			return;
		}
		const markdown = await this.app.vault.cachedRead(file);
		const parsed = parseTaskNote(file, markdown, this.plugin.settings.hoursPerManday);
		if (!parsed) {
			return;
		}
		if (!parsed.childIds.includes(childId)) {
			const draft = taskToDraft(parsed);
			draft.childIds = [...draft.childIds, childId];
			await saveTaskNote(this.app.vault, draft, this.plugin.settings.hoursPerManday);
		}
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

function taskToDraft(task: Task): TaskDraft {
	return {
		id: task.id,
		title: task.title,
		project: task.project,
		projectId: task.projectId,
		parentId: task.parentId,
		childIds: [...task.childIds],
		sortOrder: task.sortOrder,
		blockedBy: [...task.blockedBy],
		blocking: [...task.blocking],
		startDate: task.startDate,
		endDate: task.endDate,
		due: task.due,
		scheduled: task.scheduled,
		durationDays: task.durationDays,
		estimateHours: task.estimateHours,
		timeLogs: task.timeLogs.map((log) => ({ ...log })),
		status: task.status,
		priority: task.priority,
		important: task.important,
		isMilestone: task.isMilestone,
		isStageBoundary: task.isStageBoundary,
		stageId: task.stageId,
		stageSequence: task.stageSequence,
		workPackageId: task.workPackageId,
		assignee: task.assignee,
		notes: task.notes,
		customFields: { ...task.customFields },
		filePath: task.filePath,
	};
}


/**
 * Open task editor in modal or tab per {@link ProjectsEngineSettings.taskEditorSurface}.
 *
 * Default is **modal** so Cancel only dismisses the overlay and leaves
 * Dashboard / Overview / Workspace unchanged (no history.back / leaf replace).
 */
export async function openTaskEditor(
	plugin: ProjectsEnginePlugin,
	opts: {
		projectId: string;
		projectLink: WikiLink;
		existing?: Task | null;
		parentId?: TaskId | null;
		leaf?: import("obsidian").WorkspaceLeaf;
		onSaved?: () => void;
	},
): Promise<void> {
	const existing = opts.existing ?? null;
	const parentId = opts.parentId ?? null;
	// Prefer modal overlay unless the user explicitly chose the tab surface.
	if (plugin.settings.taskEditorSurface === "tab") {
		await plugin.router.openTask(
			{
				filePath: existing?.filePath || undefined,
				projectId: opts.projectId,
				projectLink: opts.projectLink,
				parentId: parentId ?? undefined,
			},
			opts.leaf,
		);
		return;
	}
	const { TaskEditorModal } = await import("./TaskEditorModal");
	new TaskEditorModal(
		plugin.app,
		plugin,
		opts.projectId,
		opts.projectLink,
		existing,
		parentId,
		opts.onSaved,
	).open();
}

/**
 * Open the task editor for the active project note (or a given project id).
 */
export async function openTaskEditorForActiveProject(
	plugin: ProjectsEnginePlugin,
	parentId: TaskId | null = null,
): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) {
		new Notice("Open a project or task note first");
		return;
	}
	const markdown = await plugin.app.vault.cachedRead(file);
	const { data } = splitFrontmatter(markdown);
	let projectId = "";
	let projectLink = toWikiLink(file.basename);
	if (data.pe_type === "project" && typeof data.id === "string") {
		projectId = data.id;
	} else if (data.pe_type === "task" && typeof data.project_id === "string") {
		projectId = data.project_id;
		if (typeof data.project === "string") {
			projectLink = toWikiLink(data.project);
		}
	} else {
		new Notice("Active note is not a project or task");
		return;
	}
	await openTaskEditor(plugin, { projectId, projectLink, parentId });
}
