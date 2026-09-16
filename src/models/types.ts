/**
 * Canonical domain types for Projects Engine.
 *
 * All entities follow the Entity-as-a-Note pattern: each record lives as a
 * Markdown file whose YAML frontmatter is the source of truth. Relationship
 * fields store Obsidian-compliant wikilinks (`[[Note Name]]`) so Graph View
 * clusters customers, technologies, team members, and stakeholders without extra plugins.
 *
 * TypeScript property names are camelCase. Corresponding YAML keys are
 * documented with `@remarks` and are snake_case (for example `teams_channel_url`).
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Primitive aliases
// ---------------------------------------------------------------------------

/**
 * Calendar date in ISO-8601 `YYYY-MM-DD` form, interpreted as UTC midnight.
 * Used by the scheduler so desktop and mobile clients share the same day math.
 */
export type IsoDate = string;

/**
 * Instant in ISO-8601 date-time form (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 */
export type IsoDateTime = string;

/**
 * Globally unique task identifier.
 *
 * Recommended form: `{projectId}#{localTaskId}` (example: `PRJ-2026-001#T-12`)
 * so intra-project and cross-project dependencies share one identifier space.
 */
export type TaskId = string;

/**
 * Obsidian wikilink stored in YAML as a quoted string.
 *
 * @example
 * `"[[Acme Corp]]"`
 * `"[[Jane Doe|PM]]"`
 *
 * @remarks YAML key values MUST include the double-square-bracket notation so
 * Obsidian's link indexer and Graph View can resolve the target note.
 */
export type WikiLink = string;

/**
 * Frontmatter discriminator written on every entity note (`pe_type`).
 */
export type EntityType =
	| "project"
	| "customer"
	| "team-member"
	| "project-type"
	| "technology"
	| "stakeholder"
	| "task"
	| "work-package"
	| "prince2-stage"
	| "prince2-register";

/**
 * Governance model selected when a project is created.
 *
 * - `Semplificato` — linear operational flow (Backlog → In Progress → Review → Done).
 * - `PRINCE2` — management stages, stage-boundary milestones, and formal registers.
 */
export type GovernanceModel = "Semplificato" | "PRINCE2";

/**
 * Linear board status used by Semplificato projects and by operational tasks
 * inside a PRINCE2 stage.
 */
export type SemplificatoStatus = "backlog" | "in-progress" | "review" | "done";

/**
 * High-level project lifecycle status id (portfolio / overview).
 *
 * Builtin defaults live in {@link DEFAULT_PROJECT_STATUSES}; users may add,
 * rename, reorder, or archive entries in Settings. Stored on the project note
 * as YAML `status` (string id).
 */
export type ProjectStatus = string;

/**
 * One configurable project-status option (Settings → Project statuses).
 */
export interface ProjectStatusOption {
	/** Stable id written to YAML `status`. */
	id: string;
	/** Label shown in portfolio, overview, and filters. */
	label: string;
	/** Optional accent colour (CSS hex) for chips. */
	color?: string;
	/**
	 * When true the status is hidden from the default create picker but still
	 * resolves for existing notes (archive without remapping).
	 */
	archived?: boolean;
}

/**
 * Default project lifecycle palette (dotpm-like configurability, PE labels).
 */
export const DEFAULT_PROJECT_STATUSES: ProjectStatusOption[] = [
	{ id: "draft", label: "Draft", color: "#94a3b8" },
	{ id: "active", label: "Active", color: "#22c55e" },
	{ id: "on-hold", label: "On hold", color: "#f59e0b" },
	{ id: "closing", label: "Closing", color: "#3b82f6" },
	{ id: "closed", label: "Closed", color: "#64748b", archived: false },
];

/**
 * Task delivery priority (workspace table / filters).
 */
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

/**
 * Task status. PRINCE2 work-package tasks reuse the same vocabulary so a
 * single board widget can render either governance model.
 */
export type TaskStatus = SemplificatoStatus | "blocked" | "cancelled";

// ---------------------------------------------------------------------------
// Custom fields (Settings-tab schema + per-note values)
// ---------------------------------------------------------------------------

/**
 * Entities that accept administrator-defined custom fields.
 * Matches the five schema targets in plugin settings.
 */
export type CustomFieldEntityKind =
	| "customer"
	| "team-member"
	| "project-type"
	| "project-technology"
	| "stakeholder";

/**
 * Supported custom-field data types.
 */
export type CustomFieldType =
	| "text"
	| "number"
	| "date"
	| "select"
	| "multi-select"
	| "person"
	| "checkbox"
	| "url";

/**
 * One option for `select` / `multi-select` schemas.
 */
export interface CustomFieldOption {
	/** Stable option id persisted in notes. */
	id: string;
	/** Human-readable label shown in the UI. */
	label: string;
}

/**
 * Runtime JSON-compatible value stored on an entity note.
 * `person` values are wikilinks; `multi-select` values are option-id arrays.
 */
export type CustomFieldValue = string | number | boolean | string[] | null;

/**
 * Map of custom-field id → value, persisted under YAML `custom_fields`.
 */
export type CustomFieldMap = Record<string, CustomFieldValue>;

/**
 * Administrator-defined field schema (Settings tab).
 *
 * Schemas are stored in plugin `data.json`, not in the vault, and are applied
 * when entity notes are created or edited.
 */
export interface CustomFieldSchema {
	/** Stable id used as the key inside {@link CustomFieldMap}. */
	id: string;
	/** Display name. */
	name: string;
	/** Value type. */
	type: CustomFieldType;
	/** Entity kind this field is attached to. */
	entity: CustomFieldEntityKind;
	/** When true the creation/edit form rejects an empty value. */
	required: boolean;
	/** Options for `select` and `multi-select`. */
	options: CustomFieldOption[];
	/** Optional default applied to new notes. */
	defaultValue: CustomFieldValue;
	/** Optional helper text shown under the control. */
	description?: string;
}

/**
 * A custom field instance written beside an entity (name duplicated from the
 * schema so notes remain readable if the schema is later renamed).
 */
export interface CustomField {
	/** Schema id. */
	id: string;
	/** Display name snapshot. */
	name: string;
	/** Value type snapshot. */
	type: CustomFieldType;
	/** Current value. */
	value: CustomFieldValue;
}

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

/**
 * One time-log row on a task (`time_logs` in YAML).
 *
 * Effort model (§7):
 * - Task estimates and time-log `duration` are in **hours** (fractions OK).
 * - Management budget (`assigned_days`) is in **days** (management days / giornate).
 * - Conversion: **1 day = {@link ProjectsEngineSettings.hoursPerManday} hours** (default 8).
 * - UI shows days and hours together where useful (e.g. `5 d · 40 h`).
 */
export interface TimeLog {
	/** Day the work was performed. @remarks YAML: `date` */
	date: IsoDate;
	/** Duration in hours (decimals allowed, e.g. 0.5, 1.25). @remarks YAML: `duration` */
	duration: number;
	/** Team member who logged the time. @remarks YAML: `member` (wikilink) */
	member: WikiLink;
	/** Free-text note. @remarks YAML: `note` */
	note: string;
}

/**
 * Team-member assignment on a project, with an optional per-project role.
 *
 * @remarks YAML list `team` of `{ member, role }`.
 */
export interface ProjectTeamAssignment {
	/** Person note. @remarks YAML: `member` */
	member: WikiLink;
	/** Optional role override for this project (example: "Project Manager"). */
	role?: string;
}

/**
 * Directed dependency between two tasks.
 *
 * `blockedBy` on the dependent task is the canonical store; `blocking` on the
 * predecessor is a reverse index rebuilt by the scheduler.
 */
export interface TaskDependency {
	/** Task that must finish first. */
	blockerId: TaskId;
	/** Task that cannot start until the blocker finishes. */
	dependentId: TaskId;
	/** True when the two tasks belong to different projects. */
	crossProject: boolean;
}

// ---------------------------------------------------------------------------
// Entity-as-a-Note records
// ---------------------------------------------------------------------------

/**
 * Customer organisation (Entity-as-a-Note).
 *
 * @remarks YAML `pe_type: customer`
 */
export interface Customer {
	name: string;
	filePath: string;
	wikiLink: WikiLink;
	/**
	 * Stakeholders associated at customer level (independent of any project).
	 * @remarks YAML: `stakeholders` (wikilink list)
	 */
	stakeholders: WikiLink[];
	aliases?: string[];
	customFields: CustomFieldMap;
}

/**
 * Person who can be assigned to projects and time logs.
 *
 * @remarks YAML `pe_type: team-member`
 */
export interface TeamMember {
	name: string;
	filePath: string;
	wikiLink: WikiLink;
	email?: string;
	/** Role applied when none is specified on the project assignment. */
	defaultRole?: string;
	aliases?: string[];
	customFields: CustomFieldMap;
}

/**
 * Catalogue entry describing a kind of engagement
 * (examples: Cloud Migration, Assessment, Security Audit).
 *
 * @remarks YAML `pe_type: project-type`
 */
export interface ProjectType {
	name: string;
	filePath: string;
	wikiLink: WikiLink;
	description?: string;
	aliases?: string[];
	customFields: CustomFieldMap;
}

/**
 * Catalogue entry for a technology tag
 * (examples: Docker, Kubernetes, Nutanix, Commvault).
 *
 * @remarks YAML `pe_type: technology`
 */
export interface Technology {
	name: string;
	filePath: string;
	wikiLink: WikiLink;
	description?: string;
	aliases?: string[];
	customFields: CustomFieldMap;
}

/**
 * Person or organisation with an interest in a project, a customer, or both.
 *
 * Entity-as-a-Note. Association is valid at three levels:
 *
 * 1. **Project only** — the project YAML `stakeholders` list points here.
 * 2. **Customer only** — this note's YAML `customer` wikilink points at a
 *    Customer note, which lists this entity under its own `stakeholders`.
 * 3. **Both** — project and customer wikilinks are written in both directions
 *    so Graph View clusters the stakeholder with the account and the delivery.
 *
 * @remarks YAML `pe_type: stakeholder`. Reverse project links: `projects`.
 */
export interface Stakeholder {
	name: string;
	filePath: string;
	wikiLink: WikiLink;
	/** Optional customer association. @remarks YAML: `customer` */
	customer?: WikiLink;
	/** Projects that reference this stakeholder. @remarks YAML: `projects` */
	projects: WikiLink[];
	/** Optional engagement role (example: "Sponsor", "CIO"). */
	role?: string;
	aliases?: string[];
	customFields: CustomFieldMap;
}

/**
 * PRINCE2 management stage. The end-of-stage milestone (`boundaryTaskId`) is a
 * formal block in {@link Scheduler}: work in later stages cannot start until
 * the boundary task finishes.
 *
 * @remarks YAML `pe_type: prince2-stage`
 */
export interface Prince2Stage {
	id: string;
	name: string;
	project: WikiLink;
	/** 1-based sequence inside the project. */
	sequence: number;
	startDate?: IsoDate;
	endDate?: IsoDate;
	/** Milestone task that closes the stage. */
	boundaryTaskId?: TaskId;
	workPackageIds: string[];
	status: "planned" | "in-progress" | "closing" | "closed";
	filePath?: string;
}

/**
 * PRINCE2 work package: a bounded set of tasks assigned to a team member or
 * team, optionally nested under a management stage.
 *
 * @remarks YAML `pe_type: work-package`
 */
export interface WorkPackage {
	id: string;
	name: string;
	project: WikiLink;
	stageId?: string;
	assignee?: WikiLink;
	estimateMandays?: number;
	actualMandays?: number;
	taskIds: TaskId[];
	status: TaskStatus | "planned" | "completed";
	filePath?: string;
	description?: string;
}

/**
 * Recursively nestable task with intra- and cross-project dependencies.
 *
 * Subtasks nest to arbitrary depth via `parentId` / `childIds`. Duration is
 * measured in calendar days and is preserved when the scheduler cascades a slip.
 *
 * @remarks YAML `pe_type: task`
 */
export interface Task {
	id: TaskId;
	title: string;
	project: WikiLink;
	projectId: string;
	parentId: TaskId | null;
	childIds: TaskId[];
	/** Canonical predecessor list. @remarks YAML: `blocked_by` */
	blockedBy: TaskId[];
	/** Reverse index of dependents. @remarks YAML: `blocking` */
	blocking: TaskId[];
	/**
	 * Planned start (`start_date` in YAML).
	 * Stored as `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (optional wall-clock time).
	 * Scheduler / Gantt use the calendar-day portion only.
	 */
	startDate: string | null;
	/**
	 * Planned end (`end_date` in YAML). Same storage form as {@link startDate}.
	 */
	endDate: string | null;
	/**
	 * User-facing due date with optional time (`due` in YAML).
	 * Stored as `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (local wall clock).
	 * Distinct from scheduler `end_date`.
	 */
	due: string | null;
	/**
	 * When the task is planned to be worked (`scheduled` in YAML).
	 * Same storage form as {@link due}.
	 */
	scheduled: string | null;
	/** Inclusive calendar-day duration; `0` means a zero-length milestone. */
	durationDays: number;
	/**
	 * Planned effort in **hours** (fractions allowed).
	 * @remarks YAML: `estimate_hours` (preferred). Legacy `estimate_mandays` is
	 * migrated as `estimate_mandays * hoursPerManday` when hours are absent.
	 */
	estimateHours: number;
	/**
	 * Planned effort in giornate (derived: hours / hoursPerManday).
	 * Kept for rollups and YAML `estimate_mandays` compatibility.
	 */
	estimateMandays: number;
	/** Logged effort in giornate (hours logged / hoursPerManday). */
	actualMandays: number;
	/** Remaining giornate (clamped ≥ 0). */
	remainingMandays: number;
	/** Logged hours (sum of time-log durations). */
	actualHours: number;
	/** Remaining hours (clamped ≥ 0). */
	remainingHours: number;
	timeLogs: TimeLog[];
	status: TaskStatus;
	/** Delivery priority for the task dashboard. @remarks YAML: `priority` */
	priority: TaskPriority;
	/** Zero-duration checkpoint (also used for PRINCE2 stage boundaries). */
	isMilestone: boolean;
	/** When true, later stages cannot start until this task ends. */
	isStageBoundary: boolean;
	stageId?: string;
	/** Numeric stage order copied from {@link Prince2Stage.sequence}. */
	stageSequence?: number;
	workPackageId?: string;
	assignee?: WikiLink;
	filePath: string;
	notes?: string;
	customFields: CustomFieldMap;
}

/**
 * Project record created by {@link ProjectCreationModal}.
 *
 * @remarks YAML `pe_type: project`. Wikilink fields: `customer`, `project_type`,
 * `technologies`, `team[].member`, `stakeholders`. Teams deep link: `teams_channel_url`.
 */
export interface Project {
	id: string;
	name: string;
	governance: GovernanceModel;
	customer: WikiLink;
	projectType: WikiLink;
	technologies: WikiLink[];
	team: ProjectTeamAssignment[];
	/**
	 * Stakeholder notes linked to this project (project-level association).
	 * @remarks YAML: `stakeholders`
	 */
	stakeholders: WikiLink[];
	/** Work-order / commessa codes (example: `COM-2026-01`). @remarks YAML: `work_orders` */
	workOrders: string[];
	/**
	 * Budgeted management effort in **days**.
	 * UI shows the hour equivalent on the same line (`assignedDays * hoursPerManday`).
	 * @remarks YAML: `assigned_days`
	 */
	assignedDays: number;
	/** Actual days rolled up from task time logs. @remarks YAML: `actual_days` */
	actualDays: number;
	projectUrl: string;
	/** Microsoft Teams channel URL or `msteams://` deep link. */
	teamsChannelUrl: string;
	status: ProjectStatus;
	/**
	 * Lucide / Obsidian icon id for the project chrome (example: `clipboard-list`).
	 * @remarks YAML: `icon`
	 */
	icon: string;
	/**
	 * Accent colour (CSS hex) for the project glyph and portfolio chips.
	 * @remarks YAML: `color`
	 */
	color: string;
	/**
	 * Optional parent project id for portfolio hierarchy.
	 * @remarks YAML: `parent_project` (project id string, not a wikilink)
	 */
	parentProjectId: string | null;
	stages: Prince2Stage[];
	workPackages: WorkPackage[];
	startDate?: IsoDate;
	endDate?: IsoDate;
	filePath: string;
	createdAt: IsoDateTime;
	updatedAt: IsoDateTime;
	customFields: CustomFieldMap;
}

// ---------------------------------------------------------------------------
// PRINCE2 registers (templates stored as notes / sections)
// ---------------------------------------------------------------------------

/**
 * Kind of formal PRINCE2 register or document.
 */
export type Prince2RegisterKind =
	| "business-case"
	| "risk-register"
	| "issue-change-log"
	| "quality-register"
	| "work-package";

/**
 * Outline business case stored with a PRINCE2 project.
 */
export interface BusinessCase {
	project: WikiLink;
	summary: string;
	reasons: string;
	options: string;
	expectedBenefits: string;
	expectedDisbenefits: string;
	timescale: string;
	costs: string;
	investmentAppraisal: string;
	majorRisks: string;
}

/**
 * One row of the Risk Register.
 */
export interface RiskRegisterEntry {
	id: string;
	project: WikiLink;
	description: string;
	probability: "low" | "medium" | "high";
	impact: "low" | "medium" | "high";
	proximity?: IsoDate;
	response: string;
	owner?: WikiLink;
	status: "open" | "closed";
}

/**
 * One row of the Issue and Change Log.
 */
export interface IssueChangeLogEntry {
	id: string;
	project: WikiLink;
	type: "issue" | "change-request" | "off-spec";
	description: string;
	raisedBy?: WikiLink;
	raisedOn: IsoDate;
	status: "open" | "in-review" | "approved" | "rejected" | "closed";
	decision?: string;
}

/**
 * One row of the Quality Register.
 */
export interface QualityRegisterEntry {
	id: string;
	project: WikiLink;
	product: string;
	method: string;
	reviewer?: WikiLink;
	plannedDate?: IsoDate;
	actualDate?: IsoDate;
	result?: "pass" | "fail" | "pending";
}

// ---------------------------------------------------------------------------
// Scheduler DTOs (pure; no Obsidian types)
// ---------------------------------------------------------------------------

/**
 * Minimal task projection consumed by {@link Scheduler}.
 * Keeping this DTO free of Obsidian types lets the algorithm run in tests
 * and on a Web Worker later without dragging in the app API.
 */
export interface SchedulableTask {
	id: TaskId;
	/** Inclusive calendar-day duration; `0` = milestone. */
	durationDays: number;
	startDate: IsoDate | null;
	endDate: IsoDate | null;
	blockedBy: TaskId[];
	/** 1-based PRINCE2 stage index; omitted for Semplificato / unstaged work. */
	stageSequence?: number;
	/** End-of-stage milestone that blocks every task in later stages. */
	isStageBoundary?: boolean;
}

/**
 * New dates proposed for a single task after auto-schedule / cascade.
 */
export interface ScheduledDates {
	taskId: TaskId;
	startDate: IsoDate;
	endDate: IsoDate;
}

/**
 * Result of a scheduling pass.
 */
export interface ScheduleResult {
	/** Topological order (blockers before dependents). Empty when a cycle exists. */
	order: TaskId[];
	/** Each inner array is a cycle path that returns to its first node. */
	cycles: TaskId[][];
	/** Proposed dates keyed by task id. */
	dates: Map<TaskId, ScheduledDates>;
}

/**
 * Options for {@link Scheduler.autoSchedule}.
 */
export interface AutoScheduleOptions {
	/** Earliest date any unconstrained task may start. */
	projectStart: IsoDate;
	/**
	 * When true (default), tasks are pulled as early as predecessors allow.
	 * When false, existing starts are only pushed forward on conflict (slip).
	 */
	asSoonAsPossible?: boolean;
}

// ---------------------------------------------------------------------------
// Command-pattern undo / redo
// ---------------------------------------------------------------------------

/**
 * Reversible mutation used by the undo/redo stack.
 */
export interface EngineCommand {
	/** Short English description shown in logs / future UI. */
	readonly description: string;
	execute(): void;
	undo(): void;
}

/**
 * Date mutation recorded so a cascade can be undone.
 */
export interface DatePatch {
	taskId: TaskId;
	previousStart: IsoDate | null;
	previousEnd: IsoDate | null;
	nextStart: IsoDate;
	nextEnd: IsoDate;
}

// ---------------------------------------------------------------------------
// Plugin settings
// ---------------------------------------------------------------------------

/**
 * Where a Dashboard project row lands when opened.
 * Mirrors the dual-surface IA from obsidian-pm (`overview` | tasks workspace).
 */
export type ProjectSurface = "overview" | "workspace";

/**
 * Default SubView mode inside the project delivery workspace.
 */
export type DefaultWorkspaceView = "table" | "gantt" | "kanban";

/**
 * Display pattern for calendar dates in the UI (ISO stored in YAML).
 */
export type DateDisplayFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

/**
 * Clock style for time-of-day display.
 */
export type TimeDisplayFormat = "24h" | "12h";

/**
 * Default Lucide icon when a project has no `icon` in frontmatter.
 */
export const DEFAULT_PROJECT_ICON = "clipboard-list";

/**
 * Default accent colour when a project has no `color` in frontmatter.
 */
export const DEFAULT_PROJECT_COLOR = "#f97316";

/**
 * Persisted plugin settings (`data.json`).
 */
export interface ProjectsEngineSettings {
	/**
	 * Project-id pattern. Tokens: `YYYY`, `YY`, `MM`, `DD`, and a run of `#`
	 * for the zero-padded counter (example: `PRJ-YYYY-###` → `PRJ-2026-001`).
	 */
	projectIdPattern: string;
	/** Next counter value interpolated into the `#` run. */
	projectIdCounter: number;
	/**
	 * Vault-relative projects root (example: `Projects`).
	 * Project folders and default Entity catalogues live under this root.
	 */
	projectsFolder: string;
	customersFolder: string;
	teamMembersFolder: string;
	projectTypesFolder: string;
	technologiesFolder: string;
	stakeholdersFolder: string;
	/**
	 * Legacy / fallback global tasks folder. New tasks are written under each
	 * project’s scaffolded Tasks subfolder; this path remains for older notes
	 * and as a scan hint for {@link loadAllTasks}.
	 */
	tasksFolder: string;
	/**
	 * Relative name of the Tasks subfolder created inside each project folder.
	 * @example `"Tasks"` → `Projects/PRJ-2026-001 - Name/Tasks/`
	 */
	scaffoldTasksFolder: string;
	/** Relative Initiation / kickoff docs folder inside each project. */
	scaffoldInitiationFolder: string;
	/** Relative Documents folder inside each project. */
	scaffoldDocumentsFolder: string;
	/**
	 * Relative Registers folder for PRINCE2 formal docs (under the project folder).
	 * When empty, falls back to `PRINCE2`.
	 */
	scaffoldRegistersFolder: string;
	/**
	 * Hours that constitute one **management day**.
	 * Default **8**. Used for budget days ↔ task hours conversion.
	 */
	hoursPerManday: number;
	/**
	 * Debounce for the in-memory entity indexer and graph-adjacent recalculation.
	 * Keeps the UI thread responsive on mobile.
	 */
	indexerDebounceMs: number;
	/**
	 * Dashboard click landing: project overview (governance home) or delivery workspace.
	 */
	projectSurface: ProjectSurface;
	/**
	 * Where the task editor opens — modal dialog or dedicated ItemView tab.
	 * Mirrors obsidian-pm `taskEditorSurface`.
	 */
	taskEditorSurface: "modal" | "tab";
	/** Initial Table / Gantt / Board mode when opening the workspace. */
	defaultView: DefaultWorkspaceView;
	/**
	 * Configurable project lifecycle statuses (add / rename / reorder / archive).
	 * At least one non-archived entry should remain for new projects.
	 */
	projectStatuses: ProjectStatusOption[];
	/** Calendar date display format (default Italian `DD/MM/YYYY`). */
	dateFormat: DateDisplayFormat;
	/** Clock display format (default `24h`). */
	timeFormat: TimeDisplayFormat;
	/** Default Gantt zoom when opening the timeline (dotpm `ganttGranularity`). */
	ganttGranularity: "day" | "week" | "month" | "quarter" | "year";
	/** Weekly header cell label style. */
	ganttWeekLabel: "weekNumber" | "dateRange" | "both";
	/** Draw tree lines between parent and child rows in the task table. */
	showSubtreeConnections: boolean;
	/** Table grid rules. */
	lineBorders: "none" | "horizontal" | "vertical" | "both";
	/** Show nested subtasks as cards on the Board (default: root tasks only). */
	kanbanShowSubtasks: boolean;
	/** Show a short description preview on Board cards. */
	kanbanShowDescriptionPreview: boolean;
	/** Cascade dependent dates when a task’s schedule changes. */
	autoSchedule: boolean;
	/** When auto-schedule is on, pull dependents earlier on early finish. */
	pullForwardOnEarlyFinish: boolean;
	/** Persist task editor changes when the leaf/modal closes. */
	saveTaskOnClose: boolean;
	/** Open release notes after plugin updates. */
	showReleaseNotes: boolean;
	/** Dynamic field schemas for the five configurable entity kinds. */
	customFieldSchemas: CustomFieldSchema[];
}

/**
 * Default settings applied on first load and as Object.assign baseline.
 *
 * §9 path layout: catalogues default under the projects root
 * (`Projects/Entities/…`), not at the vault root. Each project lives at
 * `Projects/{ID} - {Name}/` with Tasks / Initiation / Documents (and Registers
 * for PRINCE2) scaffolded inside.
 */
export const DEFAULT_SETTINGS: ProjectsEngineSettings = {
	projectIdPattern: "PRJ-YYYY-###",
	projectIdCounter: 1,
	projectsFolder: "Projects",
	customersFolder: "Projects/Entities/Customers",
	teamMembersFolder: "Projects/Entities/Team Members",
	projectTypesFolder: "Projects/Entities/Project Types",
	technologiesFolder: "Projects/Entities/Technologies",
	stakeholdersFolder: "Projects/Entities/Stakeholders",
	tasksFolder: "Projects/Tasks",
	scaffoldTasksFolder: "Tasks",
	scaffoldInitiationFolder: "Initiation",
	scaffoldDocumentsFolder: "Documents",
	scaffoldRegistersFolder: "Registers",
	hoursPerManday: 8,
	indexerDebounceMs: 250,
	projectSurface: "overview",
	taskEditorSurface: "modal",
	defaultView: "table",
	projectStatuses: DEFAULT_PROJECT_STATUSES.map((item) => ({ ...item })),
	dateFormat: "DD/MM/YYYY",
	timeFormat: "24h",
	ganttGranularity: "week",
	ganttWeekLabel: "weekNumber",
	showSubtreeConnections: true,
	lineBorders: "horizontal",
	kanbanShowSubtasks: false,
	kanbanShowDescriptionPreview: false,
	autoSchedule: true,
	pullForwardOnEarlyFinish: false,
	saveTaskOnClose: true,
	showReleaseNotes: true,
	customFieldSchemas: [],
};

/**
 * Resolve a project-status id to its display label (falls back to the raw id).
 */
export function projectStatusLabel(
	statuses: readonly ProjectStatusOption[],
	id: string,
): string {
	const hit = statuses.find((item) => item.id === id);
	return hit?.label ?? id;
}

/**
 * First non-archived status id, or `"active"` when the list is empty.
 */
export function defaultProjectStatusId(
	statuses: readonly ProjectStatusOption[],
): string {
	const open = statuses.find((item) => !item.archived);
	return open?.id ?? statuses[0]?.id ?? "active";
}

// ---------------------------------------------------------------------------
// Wikilink helpers (no Node path/url — string ops only)
// ---------------------------------------------------------------------------

/**
 * Normalise a note name or existing link into a canonical `[[Target]]` wikilink.
 *
 * @param nameOrLink - Bare title, path, or already-wrapped wikilink (optional alias).
 * @returns Canonical wikilink without an alias unless the input already had one.
 */
export function toWikiLink(nameOrLink: string): WikiLink {
	const trimmed = nameOrLink.trim();
	if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) {
		return trimmed;
	}
	return `[[${trimmed}]]`;
}

/**
 * Extract the target note name from a wikilink, stripping `[[ ]]` and any alias.
 *
 * @param link - Wikilink or bare name.
 */
export function wikiLinkTarget(link: WikiLink): string {
	const inner =
		link.startsWith("[[") && link.endsWith("]]") ? link.slice(2, -2) : link;
	const aliasAt = inner.indexOf("|");
	return (aliasAt === -1 ? inner : inner.slice(0, aliasAt)).trim();
}

/**
 * Extract the display label from a wikilink (alias if present, otherwise target).
 *
 * @param link - Wikilink or bare name.
 */
export function wikiLinkLabel(link: WikiLink): string {
	const inner =
		link.startsWith("[[") && link.endsWith("]]") ? link.slice(2, -2) : link;
	const aliasAt = inner.indexOf("|");
	return (aliasAt === -1 ? inner : inner.slice(aliasAt + 1)).trim();
}

/**
 * True when `value` looks like an Obsidian wikilink.
 */
export function isWikiLink(value: string): boolean {
	return value.startsWith("[[") && value.endsWith("]]") && value.length > 4;
}
