/**
 * Settings tab — structured like [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm)
 * Options (MIT © 2026 Stepan Kropachev and dotpm contributors): General → Style/views →
 * Table / Gantt / Board → Scheduling → Date & time → Paths → Scaffold → Statuses →
 * Custom fields → Performance.
 *
 * PE adaptations: Projects root + Entities under it, project ID pattern, hours↔days,
 * governance-aware scaffold folder names. English UI. Lone buttons stay flat (no card).
 * Date & time formats apply to editors and views (default DD/MM/YYYY + 24h).
 */

import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ProjectsEnginePlugin from "./main";
import type {
	CustomFieldEntityKind,
	CustomFieldSchema,
	CustomFieldType,
	DateDisplayFormat,
	TimeDisplayFormat,
} from "./models/types";
import { DEFAULT_PROJECT_STATUSES, DEFAULT_TASK_STATUSES } from "./models/types";
import { openTaskListTemplateModal } from "./views/TaskListTemplateModal";
import { ensureTaskListTemplatesFolder } from "./services/taskListTemplates";

const ENTITY_KINDS: { id: CustomFieldEntityKind; label: string }[] = [
	{ id: "customer", label: "Customer" },
	{ id: "team-member", label: "Team member" },
	{ id: "project-type", label: "Project type" },
	{ id: "project-technology", label: "Project technology" },
	{ id: "stakeholder", label: "Stakeholder" },
];

const FIELD_TYPES: CustomFieldType[] = [
	"text",
	"number",
	"date",
	"select",
	"multi-select",
	"person",
	"checkbox",
	"url",
];

/**
 * Projects Engine settings pane.
 */
export class ProjectsEngineSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("projects-engine-settings");

		containerEl.createEl("h2", { text: "Projects Engine" });
		containerEl.createEl("p", {
			cls: "setting-item-description pe-settings-lead",
			text: "Project portfolio, governance, and delivery. Defaults keep catalogues under the Projects root.",
		});

		this.renderGeneral();
		this.renderDateTime();
		this.renderTable();
		this.renderGantt();
		this.renderBoard();
		this.renderScheduling();
		this.renderPaths();
		this.renderTaskListTemplates();
		this.renderScaffold();
		this.renderIdentifiers();
		this.renderTimeModel();
		this.renderProjectStatuses();
		this.renderPerformance();
		this.renderCustomFields();
	}

	/** General — open surfaces, defaults, release notes (dotpm General). */
	private renderGeneral(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "General" });

		new Setting(containerEl)
			.setName("Open projects in")
			.setDesc(
				"Where a project opens from the Projects pane: Overview (home + task table) or Workspace (Table / Gantt / Board / Eisenhower).",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("overview", "Overview")
					.addOption("workspace", "Workspace")
					.setValue(this.plugin.settings.projectSurface)
					.onChange(async (value) => {
						this.plugin.settings.projectSurface =
							value === "workspace" ? "workspace" : "overview";
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});

		new Setting(containerEl)
			.setName("Default tasks view")
			.setDesc("Choose the view a project’s tasks open in.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("table", "Table")
					.addOption("gantt", "Gantt")
					.addOption("kanban", "Board")
					.addOption("eisenhower", "Eisenhower")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						if (
							value === "gantt" ||
							value === "kanban" ||
							value === "table" ||
							value === "eisenhower"
						) {
							this.plugin.settings.defaultView = value;
							await this.plugin.saveSettings();
						}
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});

		new Setting(containerEl)
			.setName("Open tasks in")
			.setDesc(
				"Modal overlay (Cancel closes only the dialog and stays on the current page), or a dedicated tab. Default: Modal.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("modal", "Modal")
					.addOption("tab", "Tab")
					.setValue(this.plugin.settings.taskEditorSurface)
					.onChange(async (value) => {
						this.plugin.settings.taskEditorSurface =
							value === "tab" ? "tab" : "modal";
						await this.plugin.saveSettings();
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});

		new Setting(containerEl)
			.setName("Save tasks on close")
			.setDesc("Save changes when the task editor is closed.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.saveTaskOnClose).onChange(async (value) => {
					this.plugin.settings.saveTaskOnClose = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Show release notes after updates")
			.setDesc("Open a tab with the release notes after the plugin updates.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showReleaseNotes).onChange(async (value) => {
					this.plugin.settings.showReleaseNotes = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Show PRINCE2 register widgets")
			.setDesc(
				"On PRINCE2 project Overview/Dashboard, show Risk, Issue & Change, and Quality widgets (counts, recent entries, quick-add). Turn off if you prefer the Documents tree only — register notes stay in Registers/ either way.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showPrince2RegisterWidgets !== false)
					.onChange(async (value) => {
						this.plugin.settings.showPrince2RegisterWidgets = value;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
			});
	}

	/** Date & time — PE default DD/MM/YYYY + 24h. */
	private renderDateTime(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Date & time" });

		new Setting(containerEl)
			.setName("Date format")
			.setDesc(
				"How calendar dates appear and are entered (task editor, tables, board, Gantt). Default DD/MM/YYYY. Stored as ISO in YAML.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("DD/MM/YYYY", "DD/MM/YYYY")
					.addOption("MM/DD/YYYY", "MM/DD/YYYY")
					.addOption("YYYY-MM-DD", "YYYY-MM-DD")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value as DateDisplayFormat;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});

		new Setting(containerEl)
			.setName("Time format")
			.setDesc("Clock style for due/scheduled times and displays (default 24-hour).")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("24h", "24-hour")
					.addOption("12h", "12-hour")
					.setValue(this.plugin.settings.timeFormat)
					.onChange(async (value) => {
						this.plugin.settings.timeFormat = value as TimeDisplayFormat;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});
	}

	/** Table — subtree lines + borders (dotpm Table). */
	private renderTable(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Table" });

		new Setting(containerEl)
			.setName("Show subtree connections")
			.setDesc("Draw lines tying a subtask row back to its parent.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showSubtreeConnections)
					.onChange(async (value) => {
						this.plugin.settings.showSubtreeConnections = value;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
			});

		new Setting(containerEl)
			.setName("Line borders")
			.setDesc("Draw rules between rows, between columns, or both.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("none", "None")
					.addOption("horizontal", "Horizontal")
					.addOption("vertical", "Vertical")
					.addOption("both", "Both")
					.setValue(this.plugin.settings.lineBorders)
					.onChange(async (value) => {
						if (
							value === "none" ||
							value === "horizontal" ||
							value === "vertical" ||
							value === "both"
						) {
							this.plugin.settings.lineBorders = value;
							await this.plugin.saveSettings();
							this.plugin.refreshOpenViews();
						}
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});
	}

	/** Gantt — granularity + week labels (dotpm Gantt). */
	private renderGantt(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Gantt" });

		new Setting(containerEl)
			.setName("Default granularity")
			.setDesc("Choose the time unit for each column in the timeline.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("day", "Day")
					.addOption("week", "Week")
					.addOption("month", "Month")
					.addOption("quarter", "Quarter")
					.addOption("year", "Year")
					.setValue(this.plugin.settings.ganttGranularity)
					.onChange(async (value) => {
						if (
							value === "day" ||
							value === "week" ||
							value === "month" ||
							value === "quarter" ||
							value === "year"
						) {
							this.plugin.settings.ganttGranularity = value;
							await this.plugin.saveSettings();
						}
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});

		new Setting(containerEl)
			.setName("Week label")
			.setDesc("Choose the text shown in weekly header cells.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("weekNumber", "Week number (W15)")
					.addOption("dateRange", "Date range")
					.addOption("both", "Both")
					.setValue(this.plugin.settings.ganttWeekLabel)
					.onChange(async (value) => {
						if (value === "weekNumber" || value === "dateRange" || value === "both") {
							this.plugin.settings.ganttWeekLabel = value;
							await this.plugin.saveSettings();
							this.plugin.refreshOpenViews();
						}
					});
				dropdown.selectEl.addClass("pe-touch-target");
			});
	}

	/** Board — subtasks + description preview + configurable columns. */
	private renderBoard(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Board" });

		new Setting(containerEl)
			.setName("Show subtasks")
			.setDesc("Show subtasks as individual cards (otherwise only root tasks).")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.kanbanShowSubtasks)
					.onChange(async (value) => {
						this.plugin.settings.kanbanShowSubtasks = value;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
			});

		new Setting(containerEl)
			.setName("Show description preview")
			.setDesc("Show the first few lines of each task description on cards.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.kanbanShowDescriptionPreview)
					.onChange(async (value) => {
						this.plugin.settings.kanbanShowDescriptionPreview = value;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					});
			});

		this.renderTaskStatuses();
	}

	/**
	 * Task board columns — add / rename / reorder / colour / archive
	 * (mirrors {@link renderProjectStatuses}).
	 */
	private renderTaskStatuses(): void {
		const { containerEl } = this;
		containerEl.createEl("h4", { text: "Task board columns" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Statuses used by the Board, Eisenhower filters, and task editor. Drag to reorder. Archive hides a column from the Board without remapping existing notes. Defaults: Backlog → In Progress → Review → Done (Blocked / Cancelled archived).",
		});

		const list = containerEl.createDiv({ cls: "pe-status-list pe-task-status-list" });
		this.renderTaskStatusRows(list);

		const actions = containerEl.createDiv({ cls: "pe-settings-actions pe-settings-actions--flat" });
		const add = actions.createEl("button", {
			text: "+ add column",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		add.addEventListener("click", () => {
			void (async () => {
				const id = `status-${Date.now().toString(36)}`;
				this.plugin.settings.taskStatuses.push({
					id,
					label: "New column",
					color: "#94a3b8",
					archived: false,
				});
				await this.plugin.saveSettings();
				this.display();
			})();
		});
		const reset = actions.createEl("button", {
			text: "Reset defaults",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		reset.addEventListener("click", () => {
			void (async () => {
				this.plugin.settings.taskStatuses = DEFAULT_TASK_STATUSES.map((item) => ({
					...item,
				}));
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}

	private renderTaskStatusRows(list: HTMLElement): void {
		list.empty();
		const items = this.plugin.settings.taskStatuses;
		items.forEach((status, index) => {
			const row = list.createDiv({ cls: "pe-status-row pe-touch-target" });
			row.draggable = true;
			row.createSpan({ text: "⠿", cls: "pe-status-drag" });

			row.addEventListener("dragstart", (event) => {
				event.dataTransfer?.setData("text/plain", String(index));
				row.addClass("is-dragging");
			});
			row.addEventListener("dragend", () => row.removeClass("is-dragging"));
			row.addEventListener("dragover", (event) => event.preventDefault());
			row.addEventListener("drop", (event) => {
				event.preventDefault();
				const from = Number.parseInt(event.dataTransfer?.getData("text/plain") ?? "", 10);
				if (!Number.isFinite(from) || from === index) {
					return;
				}
				const [moved] = items.splice(from, 1);
				if (!moved) {
					return;
				}
				items.splice(index, 0, moved);
				void this.plugin.saveSettings().then(() => {
					this.display();
					this.plugin.refreshOpenViews();
				});
			});

			const label = row.createEl("input", {
				cls: "pe-input pe-status-label",
				attr: { type: "text", "aria-label": "Column label" },
			});
			label.value = status.label;
			label.addEventListener("change", () => {
				status.label = label.value.trim() || status.id;
				void this.plugin.saveSettings().then(() => this.plugin.refreshOpenViews());
			});

			const idInput = row.createEl("input", {
				cls: "pe-input pe-status-id",
				attr: { type: "text", "aria-label": "Column id", spellcheck: "false" },
			});
			idInput.value = status.id;
			idInput.addEventListener("change", () => {
				const next = idInput.value.trim().toLowerCase().replace(/\s+/g, "-");
				if (!next) {
					idInput.value = status.id;
					return;
				}
				if (items.some((item, i) => i !== index && item.id === next)) {
					new Notice("Column id must be unique");
					idInput.value = status.id;
					return;
				}
				status.id = next;
				void this.plugin.saveSettings().then(() => this.plugin.refreshOpenViews());
			});

			const color = row.createEl("input", {
				attr: { type: "color", "aria-label": "Column colour" },
			});
			color.value = status.color ?? "#94a3b8";
			color.addEventListener("change", () => {
				status.color = color.value;
				void this.plugin.saveSettings().then(() => this.plugin.refreshOpenViews());
			});

			const archive = row.createEl("label", { cls: "pe-check-label pe-status-archive" });
			const checkbox = archive.createEl("input", { attr: { type: "checkbox" } });
			checkbox.checked = status.archived === true;
			archive.createSpan({ text: "Archive" });
			checkbox.addEventListener("change", () => {
				status.archived = checkbox.checked;
				void this.plugin.saveSettings().then(() => this.plugin.refreshOpenViews());
			});

			const remove = row.createEl("button", {
				text: "Remove",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			remove.addEventListener("click", () => {
				if (items.length <= 1) {
					new Notice("Keep at least one task column");
					return;
				}
				items.splice(index, 1);
				void this.plugin.saveSettings().then(() => {
					this.display();
					this.plugin.refreshOpenViews();
				});
			});
		});
	}

	/** Scheduling — auto-schedule toggles (dotpm Scheduling). */
	private renderScheduling(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Scheduling" });

		new Setting(containerEl)
			.setName("Auto-schedule")
			.setDesc("Adjust dependent task dates when a task changes (DAG cascade).")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoSchedule).onChange(async (value) => {
					this.plugin.settings.autoSchedule = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("Pull dependents forward")
			.setDesc("Move dependent tasks earlier when a task finishes before its due date.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.pullForwardOnEarlyFinish)
					.setDisabled(!this.plugin.settings.autoSchedule)
					.onChange(async (value) => {
						this.plugin.settings.pullForwardOnEarlyFinish = value;
						await this.plugin.saveSettings();
					});
			});
	}

	/**
	 * Paths — Projects root + entity catalogues (default under Projects/Entities).
	 */
	private renderPaths(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Folders" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Projects root holds project folders ({ID} - {Name}). Entity catalogues default under Projects/Entities/. Overrides are allowed.",
		});

		this.addFolderSetting("Projects root", "projectsFolder", "Projects");
		this.addFolderSetting("Customers", "customersFolder", "Projects/Entities/Customers");
		this.addFolderSetting("Team members", "teamMembersFolder", "Projects/Entities/Team Members");
		this.addFolderSetting("Project types", "projectTypesFolder", "Projects/Entities/Project Types");
		this.addFolderSetting("Technologies", "technologiesFolder", "Projects/Entities/Technologies");
		this.addFolderSetting("Stakeholders", "stakeholdersFolder", "Projects/Entities/Stakeholders");
		this.addFolderSetting(
			"Legacy tasks folder",
			"tasksFolder",
			"Projects/Tasks",
			"Fallback scan path for older task notes outside a project folder.",
		);
	}

	/**
	 * Task-list template catalogue (Entity-as-a-Note) + create shortcut.
	 * Flat button row (no card) per PE settings UX.
	 */
	private renderTaskListTemplates(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Task list templates" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Reusable task trees stored as Markdown notes (pe_type: task-list-template). Assign on project create/edit; apply creates notes under the project Tasks/ folder.",
		});

		this.addFolderSetting(
			"Task list templates folder",
			"taskListTemplatesFolder",
			"Projects/Entities/Task List Templates",
		);

		new Setting(containerEl)
			.setName("New task list template")
			.setDesc("Opens the template editor. Starter hierarchy is included; customise freely.")
			.addButton((button) => {
				button.setButtonText("Create template").onClick(() => {
					void ensureTaskListTemplatesFolder(
						this.app.vault,
						this.plugin.settings,
					).then(() => openTaskListTemplateModal(this.plugin));
				});
			});
	}

	/** Per-project scaffold subfolder names. */
	private renderScaffold(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Project scaffold" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Created inside each new project folder. PRINCE2 also scaffolds lean Initiation and Registers Markdown templates (Business Case, registers, Work Package starter, Project Brief, PID, Stage Boundaries guide).",
		});

		this.addTextSetting("Tasks folder name", "scaffoldTasksFolder", "Tasks");
		this.addTextSetting("Initiation folder name", "scaffoldInitiationFolder", "Initiation");
		this.addTextSetting("Documents folder name", "scaffoldDocumentsFolder", "Documents");
		this.addTextSetting(
			"Registers folder name",
			"scaffoldRegistersFolder",
			"Registers",
			"Used when governance is PRINCE2.",
		);
	}

	private renderIdentifiers(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Project identifiers" });

		new Setting(containerEl)
			.setName("ID pattern")
			.setDesc("Tokens: YYYY, YY, MM, DD, and a run of # for the counter. Example: PRJ-YYYY-###")
			.addText((text) => {
				text.inputEl.addClass("pe-touch-target");
				text
					.setPlaceholder("PRJ-YYYY-###")
					.setValue(this.plugin.settings.projectIdPattern)
					.onChange(async (value) => {
						this.plugin.settings.projectIdPattern = value.trim() || "PRJ-YYYY-###";
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Next counter")
			.setDesc("Integer interpolated into the # run. Incremented after each successful create.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.addClass("pe-touch-target");
				text.setValue(String(this.plugin.settings.projectIdCounter)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed) && parsed >= 1) {
						this.plugin.settings.projectIdCounter = parsed;
						await this.plugin.saveSettings();
					}
				});
			});
	}

	private renderTimeModel(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Time model" });

		new Setting(containerEl)
			.setName("Hours per day")
			.setDesc(
				"Task estimates and time logs use hours; project budget uses days. Default 1 day = 8 hours.",
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.step = "0.25";
				text.inputEl.addClass("pe-touch-target");
				text.setValue(String(this.plugin.settings.hoursPerManday)).onChange(async (value) => {
					const parsed = Number.parseFloat(value);
					if (Number.isFinite(parsed) && parsed > 0) {
						this.plugin.settings.hoursPerManday = parsed;
						await this.plugin.saveSettings();
					}
				});
			});
	}

	private renderPerformance(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Performance" });

		new Setting(containerEl)
			.setName("Indexer debounce (ms)")
			.setDesc("Quiet period before rebuilding the in-memory entity index after vault events.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "50";
				text.inputEl.max = "5000";
				text.inputEl.addClass("pe-touch-target");
				text.setValue(String(this.plugin.settings.indexerDebounceMs)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed) && parsed >= 50 && parsed <= 5000) {
						this.plugin.settings.indexerDebounceMs = parsed;
						await this.plugin.saveSettings();
					}
				});
			});
	}

	private addFolderSetting(
		name: string,
		key:
			| "projectsFolder"
			| "customersFolder"
			| "teamMembersFolder"
			| "projectTypesFolder"
			| "technologiesFolder"
			| "stakeholdersFolder"
			| "taskListTemplatesFolder"
			| "tasksFolder",
		placeholder: string,
		desc?: string,
	): void {
		const setting = new Setting(this.containerEl).setName(name);
		if (desc) {
			setting.setDesc(desc);
		}
		setting.addText((text) => {
			text.inputEl.addClass("pe-touch-target");
			text.setPlaceholder(placeholder);
			text.setValue(this.plugin.settings[key]).onChange(async (value) => {
				this.plugin.settings[key] = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
				await this.plugin.saveSettings();
			});
		});
	}

	private addTextSetting(
		name: string,
		key:
			| "scaffoldTasksFolder"
			| "scaffoldInitiationFolder"
			| "scaffoldDocumentsFolder"
			| "scaffoldRegistersFolder",
		placeholder: string,
		desc?: string,
	): void {
		const setting = new Setting(this.containerEl).setName(name);
		if (desc) {
			setting.setDesc(desc);
		}
		setting.addText((text) => {
			text.inputEl.addClass("pe-touch-target");
			text.setPlaceholder(placeholder);
			text.setValue(this.plugin.settings[key]).onChange(async (value) => {
				this.plugin.settings[key] = value.trim() || placeholder;
				await this.plugin.saveSettings();
			});
		});
	}

	private renderProjectStatuses(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Project statuses" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Lifecycle statuses on the portfolio and project overview. Drag to reorder. Archive hides an option from new picks without remapping existing notes.",
		});

		const list = containerEl.createDiv({ cls: "pe-status-list" });
		this.renderStatusRows(list);

		// Flat action row — no card/background behind lone buttons (§7).
		const actions = containerEl.createDiv({ cls: "pe-settings-actions pe-settings-actions--flat" });
		const add = actions.createEl("button", {
			text: "+ add status",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		add.addEventListener("click", () => {
			void (async () => {
				const id = `status-${Date.now().toString(36)}`;
				this.plugin.settings.projectStatuses.push({
					id,
					label: "New status",
					color: "#94a3b8",
					archived: false,
				});
				await this.plugin.saveSettings();
				this.display();
			})();
		});
		const reset = actions.createEl("button", {
			text: "Reset defaults",
			cls: "pe-secondary pe-touch-target",
			attr: { type: "button" },
		});
		reset.addEventListener("click", () => {
			void (async () => {
				this.plugin.settings.projectStatuses = DEFAULT_PROJECT_STATUSES.map((item) => ({
					...item,
				}));
				await this.plugin.saveSettings();
				this.display();
			})();
		});
	}

	private renderStatusRows(list: HTMLElement): void {
		list.empty();
		const items = this.plugin.settings.projectStatuses;
		items.forEach((status, index) => {
			const row = list.createDiv({ cls: "pe-status-row pe-touch-target" });
			row.draggable = true;
			row.createSpan({ text: "⠿", cls: "pe-status-drag" });

			row.addEventListener("dragstart", (event) => {
				event.dataTransfer?.setData("text/plain", String(index));
				row.addClass("is-dragging");
			});
			row.addEventListener("dragend", () => row.removeClass("is-dragging"));
			row.addEventListener("dragover", (event) => event.preventDefault());
			row.addEventListener("drop", (event) => {
				event.preventDefault();
				const from = Number.parseInt(event.dataTransfer?.getData("text/plain") ?? "", 10);
				if (!Number.isFinite(from) || from === index) {
					return;
				}
				const [moved] = items.splice(from, 1);
				if (!moved) {
					return;
				}
				items.splice(index, 0, moved);
				void this.plugin.saveSettings().then(() => this.display());
			});

			const label = row.createEl("input", {
				cls: "pe-input pe-status-label",
				attr: { type: "text", "aria-label": "Status label" },
			});
			label.value = status.label;
			label.addEventListener("change", () => {
				status.label = label.value.trim() || status.id;
				void this.plugin.saveSettings();
			});

			const idInput = row.createEl("input", {
				cls: "pe-input pe-status-id",
				attr: { type: "text", "aria-label": "Status id", spellcheck: "false" },
			});
			idInput.value = status.id;
			idInput.addEventListener("change", () => {
				const next = idInput.value.trim().toLowerCase().replace(/\s+/g, "-");
				if (!next) {
					idInput.value = status.id;
					return;
				}
				if (items.some((item, i) => i !== index && item.id === next)) {
					new Notice("Status id must be unique");
					idInput.value = status.id;
					return;
				}
				status.id = next;
				void this.plugin.saveSettings();
			});

			const color = row.createEl("input", {
				attr: { type: "color", "aria-label": "Status colour" },
			});
			color.value = status.color ?? "#94a3b8";
			color.addEventListener("change", () => {
				status.color = color.value;
				void this.plugin.saveSettings();
			});

			const archive = row.createEl("label", { cls: "pe-check-label pe-status-archive" });
			const checkbox = archive.createEl("input", { attr: { type: "checkbox" } });
			checkbox.checked = status.archived === true;
			archive.createSpan({ text: "Archive" });
			checkbox.addEventListener("change", () => {
				status.archived = checkbox.checked;
				void this.plugin.saveSettings();
			});

			const remove = row.createEl("button", {
				text: "Remove",
				cls: "pe-secondary pe-touch-target",
				attr: { type: "button" },
			});
			remove.addEventListener("click", () => {
				if (items.length <= 1) {
					new Notice("Keep at least one project status");
					return;
				}
				items.splice(index, 1);
				void this.plugin.saveSettings().then(() => this.display());
			});
		});
	}

	private renderCustomFields(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Custom field schemas" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Dynamic fields for Customer, Team Member, Project Type, Project Technology, and Stakeholder notes.",
		});

		for (const schema of this.plugin.settings.customFieldSchemas) {
			this.renderSchemaRow(schema);
		}

		containerEl.createEl("h4", { text: "Add field" });
		this.renderAddSchemaForm();
	}

	private renderSchemaRow(schema: CustomFieldSchema): void {
		const row = new Setting(this.containerEl)
			.setName(schema.name)
			.setDesc(`${schema.entity} · ${schema.type}${schema.required ? " · required" : ""}`);

		row.addButton((button) => {
			button.setButtonText("Remove");
			button.buttonEl.addClass("pe-touch-target");
			button.onClick(async () => {
				this.plugin.settings.customFieldSchemas = this.plugin.settings.customFieldSchemas.filter(
					(item) => item.id !== schema.id,
				);
				await this.plugin.saveSettings();
				this.display();
			});
		});
	}

	private renderAddSchemaForm(): void {
		let name = "";
		let entity: CustomFieldEntityKind = "customer";
		let type: CustomFieldType = "text";
		let required = false;
		let optionsCsv = "";

		new Setting(this.containerEl).setName("Name").addText((text) => {
			text.inputEl.addClass("pe-touch-target");
			text.setPlaceholder("Industry").onChange((value) => {
				name = value;
			});
		});

		new Setting(this.containerEl).setName("Entity").addDropdown((dropdown) => {
			for (const kind of ENTITY_KINDS) {
				dropdown.addOption(kind.id, kind.label);
			}
			dropdown.setValue(entity);
			dropdown.selectEl.addClass("pe-touch-target");
			dropdown.onChange((value) => {
				entity = value as CustomFieldEntityKind;
			});
		});

		new Setting(this.containerEl).setName("Type").addDropdown((dropdown) => {
			for (const fieldType of FIELD_TYPES) {
				dropdown.addOption(fieldType, fieldType);
			}
			dropdown.setValue(type);
			dropdown.selectEl.addClass("pe-touch-target");
			dropdown.onChange((value) => {
				type = value as CustomFieldType;
			});
		});

		new Setting(this.containerEl).setName("Required").addToggle((toggle) => {
			toggle.setValue(required).onChange((value) => {
				required = value;
			});
		});

		new Setting(this.containerEl)
			.setName("Select options")
			.setDesc("Comma-separated labels, used when type is select or multi-select.")
			.addText((text) => {
				text.inputEl.addClass("pe-touch-target");
				text.setPlaceholder("Low, Medium, High").onChange((value) => {
					optionsCsv = value;
				});
			});

		// Flat CTA — no Setting card wrapper for a lone button.
		const actions = this.containerEl.createDiv({
			cls: "pe-settings-actions pe-settings-actions--flat",
		});
		const add = actions.createEl("button", {
			text: "Add custom field",
			cls: "pe-primary pe-touch-target",
			attr: { type: "button" },
		});
		add.addEventListener("click", () => {
			void (async () => {
				const trimmed = name.trim();
				if (!trimmed) {
					new Notice("Custom field name is required");
					return;
				}
				const options = optionsCsv
					.split(",")
					.map((item) => item.trim())
					.filter((item) => item.length > 0)
					.map((label, index) => ({
						id: `opt_${index + 1}_${label.toLowerCase().replace(/\s+/g, "-")}`,
						label,
					}));
				const schema: CustomFieldSchema = {
					id: `cf_${Date.now().toString(36)}`,
					name: trimmed,
					type,
					entity,
					required,
					options,
					defaultValue: type === "checkbox" ? false : type === "multi-select" ? [] : "",
				};
				this.plugin.settings.customFieldSchemas.push(schema);
				await this.plugin.saveSettings();
				new Notice(`Added custom field “${trimmed}”`);
				this.display();
			})();
		});
	}
}
