/**
 * Nested task table SubView — dashboard-style columns matching dotpm task table.
 *
 * The “+ Add task” control lives in a block *below* the `<table>` (not in
 * `<tfoot>`). Putting it in the footer previously allowed table/theme layout
 * quirks to paint the label over the Documents section on Overview.
 */

import { Notice, TFile, setIcon, type App } from "obsidian";
import type ProjectsEnginePlugin from "../../main";
import {
	activeTaskStatuses,
	completedTaskStatusId,
	defaultTaskStatusId,
	isCompletedTaskStatus,
	reopenTaskStatusId,
	taskStatusLabel as resolveTaskStatusLabel,
	toWikiLink,
	wikiLinkTarget,
	type Task,
	type TaskId,
	type TaskPriority,
	type TaskStatus,
} from "../../models/types";
import { ensureEntityNote } from "../../services/linkSync";
import { PersistStatusCommand } from "../../services/taskCommands";
import {
	collectTaskSubtreeIds,
	deleteTaskConfirmMessage,
	deleteTaskSubtree,
	notifyTaskDeleted,
} from "../../services/taskDelete";
import { loadAllTasks, patchTaskFrontmatter } from "../../services/taskIo";
import {
	canReorderTask,
	compareTasksBySortOrder,
	planSiblingReorder,
	type TaskReorderDirection,
} from "../../services/taskOrder";
import { isExpiredDateTime } from "../../services/dateFormat";
import { formatHours } from "../../services/timeLogs";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { EmptyState } from "../../ui/EmptyState";
import { TextPromptModal } from "../../ui/TextPromptModal";
import { createQuickSubtask } from "../../services/quickSubtask";
import { markCompletedConfirmMessage } from "../../services/taskStatusUi";
import { mountInlineDateTime } from "../dateTimeInputs";
import { findProjectRow, type ProjectRow } from "../projectRows";
import { EntitySuggest } from "../suggest";
import type { SubView } from "../SubView";
import { openTaskEditor } from "../TaskEditor";
import { mountTaskNotesToggle } from "../taskNotesControls";
import { mountTaskTitleControls } from "../taskTitleControls";

const TASK_PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Workspace task filters (combinable with free-text search).
 */
export interface TaskDashboardFilters {
	text: string;
	status: "all" | TaskStatus;
	priority: "all" | TaskPriority;
	/**
	 * When true, table surfaces omit tasks in the locked Done status
	 * (`done` id / legacy completed aliases). Session/view-local preference.
	 */
	hideCompleted: boolean;
}

/**
 * Props for {@link TableSubView}.
 *
 * Project Dashboard / Workspace pass {@link project}. Global Dashboard omits it,
 * sets {@link showProjectBadge}, and supplies {@link projects} + {@link onNewTask}.
 */
export interface TableSubViewProps {
	app: App;
	plugin: ProjectsEnginePlugin;
	/** When set, scope rows to this project (Overview / Workspace). */
	project?: ProjectRow;
	/** Portfolio rows for project badge lookup (Global Dashboard). */
	projects?: ProjectRow[];
	tasks: Task[];
	filters: TaskDashboardFilters;
	container: HTMLElement;
	/** Show a clickable project-name badge on each task row. */
	showProjectBadge?: boolean;
	/** Override “+ New task” (Global Dashboard opens a project picker). */
	onNewTask?: () => void;
}

/**
 * Hierarchical task dashboard with tree, status pills, progress, due dates.
 * Status / Priority / Assignees / Due / Scheduled are editable inline on the
 * Dashboard and Table surfaces; title opens detail, pencil opens full edit.
 */
export class TableSubView implements SubView {
	private collapsedIds = new Set<TaskId>();
	private readonly suggests: EntitySuggest[] = [];

	constructor(private readonly props: TableSubViewProps) {}

	public render(): void {
		this.clearSuggests();
		const { container, tasks, project, filters, plugin } = this.props;
		container.empty();
		container.addClass("pe-subview");
		container.addClass("pe-table-subview");

		const filtered = filterTasks(tasks, filters);
		const scoped = project
			? filtered.filter((t) => t.projectId === project.id)
			: filtered;

		if (scoped.length === 0) {
			new EmptyState(container)
				.setTitle(tasks.length === 0 ? "No tasks yet" : "No matching tasks")
				.setBody(
					tasks.length === 0
						? project
							? "Add a task to plan delivery for this project."
							: "Create a task from a project or use New Task with a project selector."
						: "Clear search or change status / priority filters.",
				)
				.setAction("New task", () => this.openNewTask());
			return;
		}

		const dateFormat = plugin.settings.dateFormat;
		const byParent = groupByParent(scoped);
		const visible = this.buildVisibleTasks(byParent);

		const table = container.createEl("table", {
			cls: "pe-table pe-task-table pe-task-dashboard",
		});
		const thead = table.createEl("thead");
		const head = thead.createEl("tr");
		// Mirror body columns (reorder, check, …). Non-empty control headers
		// avoid theme `th:empty { display:none }` collapsing those columns and
		// shifting TASK/STATUS/… left over the controls.
		const headerCells: Array<{ text: string; cls?: string; label?: string }> = [
			{ text: "\u00a0", cls: "pe-task-reorder-col", label: "Order" },
			{ text: "\u00a0", cls: "pe-task-check-col", label: "Complete" },
			{ text: "TASK" },
			{ text: "STATUS" },
			{ text: "PRIORITY" },
			{ text: "ASSIGNEES" },
			{ text: "DUE" },
			{ text: "SCHEDULED" },
			{ text: "PROGRESS", cls: "pe-task-progress-col" },
			{ text: "TIME", cls: "pe-task-time-col" },
			{ text: "\u00a0", cls: "pe-task-row-actions", label: "Actions" },
		];
		for (const cell of headerCells) {
			const th = head.createEl("th", {
				text: cell.text,
				cls: cell.cls,
			});
			if (cell.label) {
				th.setAttr("aria-label", cell.label);
			}
		}

		const tbody = table.createEl("tbody");
		const timeFormat = plugin.settings.timeFormat;
		for (const { task, depth, hasChildren } of visible) {
			this.renderRow(tbody, task, depth, hasChildren, dateFormat, timeFormat);
		}

		// Sibling block under the table — keeps Add task in document flow so it
		// cannot overlap the Documents section that follows on Overview.
		const addRow = container.createDiv({ cls: "pe-task-add-row" });
		const addBtn = addRow.createEl("button", {
			cls: "pe-task-add pe-touch-target",
			attr: {
				type: "button",
				"aria-label": "New task in this project",
				title: "New task",
			},
		});
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: "New task", cls: "pe-task-add-label" });
		addBtn.addEventListener("click", () => this.openNewTask());
	}

	public refresh(): void {
		this.render();
	}

	public destroy(): void {
		this.clearSuggests();
		this.props.container.empty();
	}

	private clearSuggests(): void {
		for (const suggest of this.suggests) {
			suggest.close();
		}
		this.suggests.length = 0;
	}

	private buildVisibleTasks(
		byParent: Map<TaskId | null, Task[]>,
	): Array<{ task: Task; depth: number; hasChildren: boolean }> {
		for (const list of byParent.values()) {
			list.sort(compareTasksBySortOrder);
		}
		const out: Array<{ task: Task; depth: number; hasChildren: boolean }> = [];
		const visit = (parentId: TaskId | null, depth: number): void => {
			for (const task of byParent.get(parentId) ?? []) {
				const children = byParent.get(task.id) ?? [];
				const hasChildren = children.length > 0;
				out.push({ task, depth, hasChildren });
				if (hasChildren && !this.collapsedIds.has(task.id)) {
					visit(task.id, depth + 1);
				}
			}
		};
		visit(null, 0);
		return out;
	}

	private renderRow(
		tbody: HTMLElement,
		task: Task,
		depth: number,
		hasChildren: boolean,
		dateFormat: import("../../models/types").DateDisplayFormat,
		timeFormat: import("../../models/types").TimeDisplayFormat,
	): void {
		const { plugin, tasks } = this.props;
		const project = this.resolveProject(task);
		if (!project) {
			return;
		}
		const projectTasks = tasks.filter((item) => item.projectId === project.id);
		const statuses = plugin.settings.taskStatuses;
		const completedId = completedTaskStatusId(statuses);
		const completed = isCompletedTaskStatus(task.status, statuses);
		const dueExpired = !completed && isExpiredDateTime(task.due);
		const scheduledExpired = !completed && isExpiredDateTime(task.scheduled);
		const overdue = dueExpired || scheduledExpired;
		const tr = tbody.createEl("tr", {
			cls: overdue
				? "pe-task-row pe-task-row--expired pe-task-row--overdue"
				: "pe-task-row",
		});

		const reorderTd = tr.createEl("td", {
			cls: "pe-task-reorder-col",
			attr: { "data-label": "Order" },
		});
		const reorder = reorderTd.createDiv({ cls: "pe-task-reorder" });
		const canUp = canReorderTask(projectTasks, task.id, "up");
		const canDown = canReorderTask(projectTasks, task.id, "down");
		const upBtn = reorder.createEl("button", {
			cls: "pe-task-reorder-btn",
			attr: {
				type: "button",
				title: "Move up",
				"aria-label": `Move ${task.title || task.id} up`,
			},
		});
		setIcon(upBtn, "chevron-up");
		upBtn.disabled = !canUp;
		upBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.reorderTask(task, "up");
		});
		const downBtn = reorder.createEl("button", {
			cls: "pe-task-reorder-btn",
			attr: {
				type: "button",
				title: "Move down",
				"aria-label": `Move ${task.title || task.id} down`,
			},
		});
		setIcon(downBtn, "chevron-down");
		downBtn.disabled = !canDown;
		downBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.reorderTask(task, "down");
		});

		const checkTd = tr.createEl("td", { cls: "pe-task-check-col" });
		const checkbox = checkTd.createEl("input", {
			type: "checkbox",
			cls: "pe-task-checkbox",
			attr: {
				"aria-label": completed
					? `Mark ${task.title || task.id} as not completed`
					: `Mark ${task.title || task.id} as completed`,
			},
		});
		checkbox.checked = completed;
		checkbox.addEventListener("click", (event) => {
			// Keep visual state until confirm (complete) or until we apply reopen.
			event.preventDefault();
			event.stopPropagation();
			if (completed) {
				// Uncheck: no confirm — reopen to first non-completed column (usually Backlog).
				checkbox.checked = false;
				void this.setTaskStatus(task, reopenTaskStatusId(statuses));
				return;
			}
			this.confirmMarkCompleted(task, completedId, {
				onCancel: () => {
					checkbox.checked = false;
				},
				onApplied: () => {
					checkbox.checked = true;
				},
			});
		});

		const titleTd = tr.createEl("td", { cls: "pe-task-tree-cell", attr: { "data-label": "Task" } });
		titleTd.style.setProperty("--pe-tree-depth", String(depth));
		if (depth > 0) {
			tr.addClass("pe-task-row--subtask");
			tr.addClass(`pe-task-row--depth-${Math.min(depth, 6)}`);
		}
		const showTree =
			plugin.settings.showSubtreeConnections !== false && depth > 0;
		const treeInner = titleTd.createDiv({
			cls: `pe-task-tree-inner${showTree ? " pe-task-tree-inner--guide" : ""}${depth > 0 ? " pe-task-tree-inner--subtask" : ""}`,
		});

		if (hasChildren) {
			const chevron = treeInner.createSpan({ cls: "pe-task-chevron pe-touch-target" });
			const collapsed = this.collapsedIds.has(task.id);
			setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
			chevron.addEventListener("click", (event) => {
				event.stopPropagation();
				if (this.collapsedIds.has(task.id)) {
					this.collapsedIds.delete(task.id);
				} else {
					this.collapsedIds.add(task.id);
				}
				this.render();
			});
		} else if (depth > 0) {
			treeInner.createSpan({ cls: "pe-task-chevron-spacer" });
		}

		if (this.props.showProjectBadge) {
			const badgeWrap = treeInner.createSpan({ cls: "pe-task-project-badge-wrap" });
			const link = badgeWrap.createEl("button", {
				cls: "pe-project-link pe-touch-target",
				attr: {
					type: "button",
					title: `Open project ${project.name}`,
					"aria-label": `Open project ${project.name}`,
				},
			});
			link.textContent = project.name;
			link.addEventListener("click", (event) => {
				event.stopPropagation();
				void plugin.router.openOverview(project.file.path);
			});
		}

		mountTaskTitleControls(treeInner, {
			plugin,
			project,
			task,
			titleClass: "pe-task-title",
			titleAsButton: false,
		});
		mountTaskNotesToggle(treeInner, task);
		this.mountAddSubtaskControl(treeInner, task, project);

		const statusTd = tr.createEl("td", { attr: { "data-label": "Status" } });
		const statusSelect = statusTd.createEl("select", {
			cls: "pe-input pe-touch-target pe-task-status-select",
			attr: { "aria-label": `Status for ${task.title || task.id}` },
		});
		const statusOptions = [...activeTaskStatuses(statuses)];
		if (task.status && !statusOptions.some((item) => item.id === task.status)) {
			const archived = statuses.find((item) => item.id === task.status);
			statusOptions.push(
				archived ?? { id: task.status, label: task.status },
			);
		}
		for (const option of statusOptions) {
			statusSelect.createEl("option", {
				text: option.label,
				attr: { value: option.id },
			});
		}
		const previousStatus = task.status || defaultTaskStatusId(statuses);
		statusSelect.value = previousStatus;
		statusSelect.addEventListener("click", (event) => {
			event.stopPropagation();
		});
		statusSelect.addEventListener("change", () => {
			const next = statusSelect.value;
			if (next === completedId && !isCompletedTaskStatus(task.status, statuses)) {
				this.confirmMarkCompleted(task, completedId, {
					onCancel: () => {
						statusSelect.value = previousStatus;
					},
				});
				return;
			}
			void this.setTaskStatus(task, next);
		});

		const priorityTd = tr.createEl("td", {
			cls: "pe-task-inline-cell",
			attr: { "data-label": "Priority" },
		});
		const prioritySelect = priorityTd.createEl("select", {
			cls: "pe-input pe-touch-target pe-task-priority-select",
			attr: { "aria-label": `Priority for ${task.title || task.id}` },
		});
		for (const priority of TASK_PRIORITIES) {
			prioritySelect.createEl("option", {
				text: priorityOptionLabel(priority),
				attr: { value: priority },
			});
		}
		prioritySelect.value = task.priority;
		prioritySelect.addEventListener("click", (event) => event.stopPropagation());
		prioritySelect.addEventListener("change", () => {
			const next = prioritySelect.value as TaskPriority;
			void this.patchTaskField(task, "Priority", (data) => {
				data.priority = next;
			});
		});

		const assigneeTd = tr.createEl("td", {
			cls: "pe-task-inline-cell pe-task-assignees",
			attr: { "data-label": "Assignees" },
		});
		const assigneeInput = assigneeTd.createEl("input", {
			cls: "pe-input pe-touch-target pe-task-assignee-input",
			attr: {
				type: "text",
				placeholder: "Assignee…",
				spellcheck: "false",
				"aria-label": `Assignee for ${task.title || task.id}`,
			},
		});
		assigneeInput.value = task.assignee
			? wikiLinkTarget(task.assignee)
			: "";
		const suggest = new EntitySuggest(
			this.props.app,
			assigneeInput,
			() => this.props.plugin.indexer.list("stakeholder"),
			(suggestion) => {
				const name =
					suggestion.kind === "file" ? suggestion.entity.name : suggestion.name;
				assigneeInput.value = name;
				void (async () => {
					await ensureEntityNote(
						this.props.app.vault,
						"stakeholder",
						name,
						this.props.plugin.settings.stakeholdersFolder,
					);
					await this.patchTaskField(task, "Assignee", (data) => {
						data.assignee = toWikiLink(name);
					});
					this.props.plugin.indexer.rebuild();
				})();
			},
		);
		this.suggests.push(suggest);
		assigneeInput.addEventListener("click", (event) => event.stopPropagation());
		assigneeInput.addEventListener("change", () => {
			const raw = assigneeInput.value.trim();
			void (async () => {
				if (raw) {
					await ensureEntityNote(
						this.props.app.vault,
						"stakeholder",
						raw,
						this.props.plugin.settings.stakeholdersFolder,
					);
					await this.patchTaskField(task, "Assignee", (data) => {
						data.assignee = toWikiLink(raw);
					});
					this.props.plugin.indexer.rebuild();
				} else {
					await this.patchTaskField(task, "Assignee", (data) => {
						delete data.assignee;
					});
				}
			})();
		});


		const dueTd = tr.createEl("td", {
			cls: dueExpired
				? "pe-task-inline-cell pe-task-due-cell is-expired"
				: "pe-task-inline-cell pe-task-due-cell",
			attr: { "data-label": "Due date" },
		});
		mountInlineDateTime(dueTd, {
			ariaLabel: `Due date for ${task.title || task.id}`,
			value: task.due,
			dateFormat,
			timeFormat,
			onChange: (value) => {
				void this.patchTaskField(task, "Due date", (data) => {
					if (value) {
						data.due = value;
					} else {
						delete data.due;
					}
				});
			},
		});

		const scheduledTd = tr.createEl("td", {
			cls: scheduledExpired
				? "pe-task-inline-cell pe-task-scheduled-cell is-expired"
				: "pe-task-inline-cell pe-task-scheduled-cell",
			attr: { "data-label": "Scheduled" },
		});
		mountInlineDateTime(scheduledTd, {
			ariaLabel: `Scheduled for ${task.title || task.id}`,
			value: task.scheduled,
			dateFormat,
			timeFormat,
			onChange: (value) => {
				void this.patchTaskField(task, "Scheduled", (data) => {
					if (value) {
						data.scheduled = value;
					} else {
						delete data.scheduled;
					}
				});
			},
		});

		const progressTd = tr.createEl("td", { cls: "pe-task-progress-col", attr: { "data-label": "Progress" } });
		const pct =
			task.estimateHours > 0
				? Math.min(100, Math.round((task.actualHours / task.estimateHours) * 100))
				: 0;
		const progressWrap = progressTd.createDiv({ cls: "pe-progress-wrap" });
		const bar = progressWrap.createDiv({ cls: "pe-progress-bar" });
		bar.createDiv({ cls: "pe-progress-fill", attr: { style: `width:${pct}%` } });
		progressWrap.createSpan({ text: `${pct}%`, cls: "pe-progress-pct" });

		tr.createEl("td", {
			text: task.estimateHours > 0 ? formatHours(task.estimateHours) : "—",
			cls: "pe-task-time-col",
			attr: { "data-label": "Time" },
		});

		const actionsTd = tr.createEl("td", {
			cls: "pe-task-row-actions",
			attr: { "data-label": "Actions" },
		});
		const delBtn = actionsTd.createEl("button", {
			cls: "pe-task-row-delete pe-link-button pe-touch-target",
			attr: {
				type: "button",
				title: "Delete task",
				"aria-label": `Delete ${task.title || task.id}`,
			},
		});
		setIcon(delBtn, "trash-2");
		delBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			this.confirmDeleteTask(task);
		});
	}

	/**
	 * Confirm before setting the configured Completed status (default Done).
	 * Cancel leaves status and controls unchanged.
	 */
	private confirmMarkCompleted(
		task: Task,
		completedId: string,
		hooks?: { onCancel?: () => void; onApplied?: () => void },
	): void {
		const { app, plugin } = this.props;
		const label = resolveTaskStatusLabel(plugin.settings.taskStatuses, completedId);
		const name = task.title.trim() || task.id;
		new ConfirmModal(app, {
			title: "Mark task completed?",
			message: markCompletedConfirmMessage(name, label),
			confirmLabel: `Mark as ${label}`,
			cancelLabel: "Cancel",
			onConfirm: async () => {
				hooks?.onApplied?.();
				await this.setTaskStatus(task, completedId);
			},
			onCancel: () => {
				hooks?.onCancel?.();
			},
		}).open();
	}

	/**
	 * Move a task one step among its siblings. Writes dense `sort_order` on
	 * siblings and rewrites the parent’s `child_ids` when nested.
	 */
	private async reorderTask(task: Task, direction: TaskReorderDirection): Promise<void> {
		const { app, plugin, tasks } = this.props;
		const project = this.resolveProject(task);
		if (!project) {
			new Notice(`Project “${task.projectId}” not found`);
			return;
		}
		const projectTasks = tasks.filter((item) => item.projectId === project.id);
		const patches = planSiblingReorder(projectTasks, task.id, direction);
		if (patches.length === 0) {
			return;
		}
		try {
			for (const patch of patches) {
				const file = app.vault.getAbstractFileByPath(patch.filePath);
				if (!(file instanceof TFile)) {
					continue;
				}
				await patchTaskFrontmatter(app.vault, file, (data) => {
					if (patch.sortOrder != null) {
						data.sort_order = patch.sortOrder;
					}
					if (patch.childIds) {
						data.child_ids = patch.childIds;
					}
				});
			}
			new Notice(direction === "up" ? "Moved up" : "Moved down");
			plugin.refreshOpenViews();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not reorder task: ${message}`);
			this.render();
		}
	}

	/**
	 * Persist a status change through `vault.process`, then refresh open views.
	 * Awaits the write so Dashboard / Table / Board reload the new YAML.
	 */
	private async setTaskStatus(task: Task, nextStatus: string): Promise<void> {
		if (task.status === nextStatus) {
			return;
		}
		const { app, plugin } = this.props;
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Task file missing");
			this.render();
			return;
		}
		const command = new PersistStatusCommand(app.vault, file, task.status, nextStatus);
		plugin.commandStack.execute(command);
		try {
			await command.settled();
			const label = resolveTaskStatusLabel(plugin.settings.taskStatuses, nextStatus);
			new Notice(`Status → ${label}`);
			plugin.refreshOpenViews();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not update status: ${message}`);
			this.render();
		}
	}

	/**
	 * Patch one YAML field on a task note through `vault.process`, then refresh.
	 * Used by inline Priority / Assignee / Due / Scheduled editors.
	 */
	private async patchTaskField(
		task: Task,
		fieldLabel: string,
		patch: (data: Record<string, unknown>) => void,
	): Promise<void> {
		const { app, plugin } = this.props;
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Task file missing");
			this.render();
			return;
		}
		try {
			await patchTaskFrontmatter(app.vault, file, patch);
			new Notice(`${fieldLabel} updated`);
			plugin.refreshOpenViews();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not update ${fieldLabel.toLowerCase()}: ${message}`);
			this.render();
		}
	}

	/**
	 * Confirm then delete the task note (+ nested subtasks). Reloads open PE views.
	 */
	private confirmDeleteTask(task: Task): void {
		const { app, plugin, tasks } = this.props;
		const subtreeCount = collectTaskSubtreeIds(task.id, tasks).length;
		new ConfirmModal(app, {
			title: "Delete task?",
			message: deleteTaskConfirmMessage(task, subtreeCount),
			confirmLabel: "Delete task",
			dangerous: true,
			onConfirm: async () => {
				try {
					const allTasks = await loadAllTasks(
						app,
						plugin.settings.tasksFolder,
						plugin.settings.hoursPerManday,
					);
					const result = await deleteTaskSubtree({
						app,
						vault: app.vault,
						root: task,
						allTasks,
					});
					notifyTaskDeleted(task.title.trim() || task.id, result);
					plugin.refreshOpenViews();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`Could not delete task: ${message}`);
				}
			},
		}).open();
	}

	private openNewTask(): void {
		const { plugin, project, onNewTask } = this.props;
		if (onNewTask) {
			onNewTask();
			return;
		}
		if (!project) {
			new Notice("Create a project first");
			return;
		}
		void openTaskEditor(plugin, {
			projectId: project.id,
			projectLink: toWikiLink(project.file.basename),
		});
	}

	/**
	 * Compact “+” control to create a child task under this row’s parent.
	 */
	private mountAddSubtaskControl(
		parentEl: HTMLElement,
		task: Task,
		project: ProjectRow,
	): void {
		const name = task.title.trim() || task.id;
		const btn = parentEl.createEl("button", {
			cls: "pe-task-add-subtask-icon pe-touch-target",
			attr: {
				type: "button",
				title: "Add subtask",
				"aria-label": `Add subtask under ${name}`,
			},
		});
		setIcon(btn, "plus");
		btn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.promptAddSubtask(task, project);
		});
	}

	/**
	 * Title-only prompt → create child under parent (same project), then refresh.
	 */
	private promptAddSubtask(parent: Task, project: ProjectRow): void {
		const { app, plugin } = this.props;
		const parentName = parent.title.trim() || parent.id;
		new TextPromptModal(app, {
			title: "Add subtask",
			message: `Create a subtask under “${parentName}” in ${project.name}.`,
			placeholder: "Subtask title",
			confirmLabel: "Create",
			onSubmit: async (value) => {
				const title = value.trim();
				if (!title) {
					return "Title is required";
				}
				try {
					await createQuickSubtask({
						app,
						settings: plugin.settings,
						parent,
						projectFile: project.file,
						title,
					});
					// Expand parent so the new child is visible in the tree.
					this.collapsedIds.delete(parent.id);
					new Notice(`Created subtask “${title}”`);
					plugin.refreshOpenViews();
					return;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return `Could not create subtask: ${message}`;
				}
			},
		}).open();
	}

	/**
	 * Resolve the project row for a task (scoped props or portfolio lookup).
	 */
	private resolveProject(task: Task): ProjectRow | null {
		if (this.props.project && this.props.project.id === task.projectId) {
			return this.props.project;
		}
		if (this.props.project && !this.props.showProjectBadge) {
			return this.props.project;
		}
		if (this.props.projects?.length) {
			return findProjectRow(this.props.projects, task.projectId) ?? null;
		}
		return this.props.project ?? null;
	}
}

/**
 * Shared task filter used by project Dashboard tables and Global Dashboard.
 * // [EXTENSIBILITY]: Add filter dimensions here so all task list surfaces stay in sync.
 */
export function filterTasks(tasks: Task[], filters: TaskDashboardFilters): Task[] {
	const q = filters.text.trim().toLowerCase();
	return tasks.filter((task) => {
		if (filters.hideCompleted && isCompletedTaskStatus(task.status)) {
			return false;
		}
		if (filters.status !== "all" && task.status !== filters.status) {
			return false;
		}
		if (filters.priority !== "all" && task.priority !== filters.priority) {
			return false;
		}
		if (!q) {
			return true;
		}
		const hay = `${task.id} ${task.title} ${task.status} ${task.priority} ${task.assignee ?? ""} ${task.projectId}`.toLowerCase();
		return hay.includes(q);
	});
}

function groupByParent(tasks: Task[]): Map<TaskId | null, Task[]> {
	const byParent = new Map<TaskId | null, Task[]>();
	const ids = new Set(tasks.map((t) => t.id));
	for (const task of tasks) {
		const key = task.parentId && ids.has(task.parentId) ? task.parentId : null;
		const list = byParent.get(key) ?? [];
		list.push(task);
		byParent.set(key, list);
	}
	return byParent;
}

function priorityOptionLabel(priority: TaskPriority): string {
	switch (priority) {
		case "none":
			return "None";
		case "low":
			return "Low";
		case "medium":
			return "Medium";
		case "high":
			return "High";
		case "urgent":
			return "Urgent";
		default:
			return priority;
	}
}
