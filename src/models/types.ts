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
	| "prince2-register"
	/** Single Risk / Issue / Quality row note under Registers/. */
	| "prince2-register-entry"
	/** PRINCE2 Initiation / guidance templates (Project Brief, PID, …). */
	| "prince2-document"
	/**
	 * Reusable task-list blueprint (Entity-as-a-Note).
	 * Assigned to projects via YAML `task_list_template` wikilink.
	 */
	| "task-list-template";

/**
 * Governance model selected when a project is created.
 *
 * - `Semplificato` — linear operational flow (Backlog → In Progress → Review → Done).
 * - `PRINCE2` — management stages, stage-boundary milestones, and formal registers.
 */
export type GovernanceModel = "Semplificato" | "PRINCE2";

/**
 * Classic linear board status ids shipped as the default task-column set.
 * Kept for governance copy and migration of notes written before configurable columns.
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
 * Task board / editor status id.
 *
 * Concrete ids come from {@link ProjectsEngineSettings.taskStatuses}. Defaults
 * mirror the classic Semplificato columns plus `blocked` / `cancelled`
 * (archived by default so the Board stays four columns until the user enables them).
 */
export type TaskStatus = string;

/**
 * One configurable task-board column / status (Settings → Task board columns).
 * Same shape as {@link ProjectStatusOption}: add / rename / reorder / colour / archive.
 */
export interface TaskStatusOption {
	/** Stable id written to YAML `status`. */
	id: string;
	/** Label shown on Board columns, filters, and the task editor. */
	label: string;
	/** Optional accent colour (CSS hex) for column heads and status chips. */
	color?: string;
	/**
	 * When true the status is hidden from Board columns and new-task pickers
	 * but still resolves for existing notes (archive without remapping).
	 */
	archived?: boolean;
}

/**
 * Default task board columns — classic Backlog → Done, plus archived blocked/cancelled
 * so older notes keep resolving without expanding the Board until the user un-archives them.
 */
export const DEFAULT_TASK_STATUSES: TaskStatusOption[] = [
	{ id: "backlog", label: "Backlog", color: "#94a3b8" },
	{ id: "in-progress", label: "In Progress", color: "#a855f7" },
	{ id: "review", label: "Review", color: "#64748b" },
	{ id: "done", label: "Done", color: "#22c55e" },
	{ id: "blocked", label: "Blocked", color: "#ef4444", archived: true },
	{ id: "cancelled", label: "Cancelled", color: "#64748b", archived: true },
];

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
 * Free-form Markdown note created under a project folder (Documents, Initiation, …).
 *
 * Graph linking mirrors tasks/registers: YAML `project` wikilink plus a body
 * `## Links` entry so Obsidian Graph View clusters the note with its project.
 *
 * @remarks YAML `pe_type: project-document`
 */
export type ProjectDocumentPeType = "project-document";

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
	/**
	 * Eisenhower “Important” flag for the matrix view.
	 * Urgent is **not** stored — derived from {@link priority} via
	 * {@link isUrgentFromPriority} (`high` | `urgent` → Urgent).
	 * `null` means the YAML key is absent (treated as not important).
	 * @remarks YAML: `important`
	 */
	important: boolean | null;
	/**
	 * @deprecated Legacy YAML `urgent` from older PE versions. Ignored for
	 * matrix placement (Priority is the source of truth). Still parsed so
	 * notes load safely; new writes omit / strip this key.
	 * @remarks YAML: `urgent` (legacy only)
	 */
	urgent?: boolean | null;
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
 * `technologies`, `team[].member`, `stakeholders`, optional `task_list_template`.
 * Teams deep link: `teams_channel_url`.
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
	/**
	 * Optional task-list template note assigned to this project.
	 * @remarks YAML: `task_list_template` (wikilink to `pe_type: task-list-template`)
	 */
	taskListTemplate?: WikiLink;
	/**
	 * ISO timestamp of the last successful template apply (create or “Apply template…”).
	 * @remarks YAML: `task_list_template_applied`
	 */
	taskListTemplateApplied?: IsoDateTime;
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
// Task list templates (Entity-as-a-Note blueprints)
// ---------------------------------------------------------------------------

/**
 * Frontmatter discriminator for task-list template notes.
 *
 * @remarks YAML `pe_type: task-list-template`
 */
export const TASK_LIST_TEMPLATE_PE_TYPE = "task-list-template" as const;

/**
 * One node in a task-list template tree (arbitrary depth via {@link children}).
 *
 * Persisted under YAML `tasks` on the template note. When applied, each node
 * becomes a real `pe_type: task` note under the project’s `Tasks/` folder.
 */
export interface TaskListTemplateItem {
	/** Task title written to the generated note. */
	title: string;
	/** Optional status id from Settings task columns (default: first open status). */
	status?: TaskStatus;
	/** Optional priority (default: `none`). */
	priority?: TaskPriority;
	/** Optional planned effort in hours. */
	estimateHours?: number;
	/** Optional body notes copied onto the generated task. */
	notes?: string;
	/** Nested subtasks (parent/child wired on apply). */
	children?: TaskListTemplateItem[];
}

/**
 * Parsed task-list template (Entity-as-a-Note).
 *
 * @remarks YAML `pe_type: task-list-template`. Relationship: projects store
 * `task_list_template: "[[Template Name]]"`.
 */
export interface TaskListTemplate {
	name: string;
	description?: string;
	tasks: TaskListTemplateItem[];
	filePath: string;
	wikiLink: WikiLink;
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
 *
 * @remarks YAML `pe_type: prince2-register-entry`, `register_kind: risk-register`.
 * Stored as its own Markdown note under the project Registers folder.
 */
export interface RiskRegisterEntry {
	id: string;
	project: WikiLink;
	description: string;
	probability: "low" | "medium" | "high";
	impact: "low" | "medium" | "high";
	/** Combined attention level for Overview badges (`low` | `medium` | `high`). */
	severity?: "low" | "medium" | "high";
	/** Calendar date the risk was logged. @remarks YAML: `date` */
	date?: IsoDate;
	proximity?: IsoDate;
	response: string;
	owner?: WikiLink;
	status: "open" | "closed";
}

/**
 * One row of the Issue and Change Log.
 *
 * @remarks YAML `pe_type: prince2-register-entry`, `register_kind: issue-change-log`.
 */
export interface IssueChangeLogEntry {
	id: string;
	project: WikiLink;
	type: "issue" | "change-request" | "off-spec";
	description: string;
	raisedBy?: WikiLink;
	raisedOn: IsoDate;
	/** Attention level for Overview widgets. @remarks YAML: `priority` */
	priority?: "low" | "medium" | "high";
	/** Alias of raised-on for generic recent sorting. @remarks YAML: `date` */
	date?: IsoDate;
	status: "open" | "in-review" | "approved" | "rejected" | "closed";
	decision?: string;
}

/**
 * One row of the Quality Register.
 *
 * @remarks YAML `pe_type: prince2-register-entry`, `register_kind: quality-register`.
 */
export interface QualityRegisterEntry {
	id: string;
	project: WikiLink;
	product: string;
	method: string;
	reviewer?: WikiLink;
	plannedDate?: IsoDate;
	actualDate?: IsoDate;
	/** Mirror of result for generic widgets. @remarks YAML: `status` */
	status?: "pending" | "pass" | "fail";
	/** Logged / planned date for recent sorting. @remarks YAML: `date` */
	date?: IsoDate;
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
export type DefaultWorkspaceView = "table" | "gantt" | "kanban" | "eisenhower";

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
 * Stable Eisenhower quadrant ids (Important × Urgent matrix cells).
 *
 * - `iu` — Important + Urgent  
 * - `inu` — Important + Not urgent  
 * - `niu` — Not important + Urgent  
 * - `ninu` — Not important + Not urgent  
 */
export type EisenhowerQuadrantId = "iu" | "inu" | "niu" | "ninu";

/**
 * One Eisenhower quadrant’s user-facing labels (Settings → Eisenhower).
 */
export interface EisenhowerQuadrantLabel {
	/** Short heading shown on the quadrant card (example: `Do first`). */
	title: string;
	/** Legend under the title (example: `Important · Urgent`). */
	subtitle: string;
}

/**
 * Customisable labels for all four Eisenhower quadrants.
 */
export interface EisenhowerQuadrantLabels {
	/** Important + Urgent. */
	iu: EisenhowerQuadrantLabel;
	/** Important + Not urgent. */
	inu: EisenhowerQuadrantLabel;
	/** Not important + Urgent. */
	niu: EisenhowerQuadrantLabel;
	/** Not important + Not urgent. */
	ninu: EisenhowerQuadrantLabel;
}

/**
 * English defaults for the Eisenhower matrix quadrant labels.
 */
export const DEFAULT_EISENHOWER_LABELS: EisenhowerQuadrantLabels = {
	iu: { title: "Do first", subtitle: "Important · Urgent" },
	inu: { title: "Schedule", subtitle: "Important · Not urgent" },
	niu: { title: "Delegate", subtitle: "Not important · Urgent" },
	ninu: { title: "Eliminate", subtitle: "Not important · Not urgent" },
};

/**
 * Merge partial/saved Eisenhower labels onto English defaults (safe migrate).
 */
export function mergeEisenhowerLabels(
	partial?: Partial<EisenhowerQuadrantLabels> | null,
): EisenhowerQuadrantLabels {
	const mergeOne = (
		id: EisenhowerQuadrantId,
		fallback: EisenhowerQuadrantLabel,
	): EisenhowerQuadrantLabel => {
		const raw = partial?.[id];
		const title =
			typeof raw?.title === "string" && raw.title.trim()
				? raw.title.trim()
				: fallback.title;
		const subtitle =
			typeof raw?.subtitle === "string" && raw.subtitle.trim()
				? raw.subtitle.trim()
				: fallback.subtitle;
		return { title, subtitle };
	};
	return {
		iu: mergeOne("iu", DEFAULT_EISENHOWER_LABELS.iu),
		inu: mergeOne("inu", DEFAULT_EISENHOWER_LABELS.inu),
		niu: mergeOne("niu", DEFAULT_EISENHOWER_LABELS.niu),
		ninu: mergeOne("ninu", DEFAULT_EISENHOWER_LABELS.ninu),
	};
}

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
	 * Vault folder for Entity-as-a-Note task-list templates
	 * (`pe_type: task-list-template`).
	 * @example `"Projects/Entities/Task List Templates"`
	 */
	taskListTemplatesFolder: string;
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
	 * When empty, falls back to `Registers`.
	 */
	scaffoldRegistersFolder: string;
	/**
	 * When true (default), PRINCE2 project Overview/Dashboard shows Risk /
	 * Issue & Change / Quality register widgets (counts, recent entries, quick-add).
	 * When false, widgets are hidden; register notes remain in Registers/ and the
	 * Documents tree.
	 */
	showPrince2RegisterWidgets: boolean;
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
	/** Initial Table / Gantt / Board / Eisenhower mode when opening the workspace. */
	defaultView: DefaultWorkspaceView;
	/**
	 * Configurable project lifecycle statuses (add / rename / reorder / archive).
	 * At least one non-archived entry should remain for new projects.
	 */
	projectStatuses: ProjectStatusOption[];
	/**
	 * Configurable task board columns / statuses (add / rename / reorder / colour / archive).
	 * Board, filters, and the task editor read this list. At least one non-archived entry
	 * should remain for new tasks.
	 */
	taskStatuses: TaskStatusOption[];
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
	/**
	 * Display labels for the four Eisenhower matrix quadrants.
	 * Stable ids: `iu` / `inu` / `niu` / `ninu`. Title is the heading; subtitle
	 * is the Important × Urgent legend under it.
	 */
	eisenhowerLabels: EisenhowerQuadrantLabels;
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
	taskListTemplatesFolder: "Projects/Entities/Task List Templates",
	tasksFolder: "Projects/Tasks",
	scaffoldTasksFolder: "Tasks",
	scaffoldInitiationFolder: "Initiation",
	scaffoldDocumentsFolder: "Documents",
	scaffoldRegistersFolder: "Registers",
	showPrince2RegisterWidgets: true,
	hoursPerManday: 8,
	indexerDebounceMs: 250,
	projectSurface: "overview",
	taskEditorSurface: "modal",
	defaultView: "table",
	projectStatuses: DEFAULT_PROJECT_STATUSES.map((item) => ({ ...item })),
	taskStatuses: DEFAULT_TASK_STATUSES.map((item) => ({ ...item })),
	dateFormat: "DD/MM/YYYY",
	timeFormat: "24h",
	ganttGranularity: "week",
	ganttWeekLabel: "weekNumber",
	showSubtreeConnections: true,
	lineBorders: "horizontal",
	kanbanShowSubtasks: false,
	kanbanShowDescriptionPreview: false,
	eisenhowerLabels: {
		iu: { ...DEFAULT_EISENHOWER_LABELS.iu },
		inu: { ...DEFAULT_EISENHOWER_LABELS.inu },
		niu: { ...DEFAULT_EISENHOWER_LABELS.niu },
		ninu: { ...DEFAULT_EISENHOWER_LABELS.ninu },
	},
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

/**
 * Resolve a task-status id to its display label (falls back to the raw id).
 */
export function taskStatusLabel(
	statuses: readonly TaskStatusOption[],
	id: string,
): string {
	const hit = statuses.find((item) => item.id === id);
	return hit?.label ?? id;
}

/**
 * First non-archived task-status id, or `"backlog"` when the list is empty.
 */
export function defaultTaskStatusId(statuses: readonly TaskStatusOption[]): string {
	const open = statuses.find((item) => !item.archived);
	return open?.id ?? statuses[0]?.id ?? "backlog";
}

/**
 * Non-archived task statuses in Settings order (Board columns + create picker).
 */
export function activeTaskStatuses(
	statuses: readonly TaskStatusOption[],
): TaskStatusOption[] {
	return statuses.filter((item) => !item.archived);
}

/**
 * Well-known completion status ids (English + common renames / Italian Completato).
 * Used when Settings still carry classic ids or users rename the Done column.
 */
const COMPLETED_TASK_STATUS_IDS = new Set([
	"done",
	"completed",
	"complete",
	"completato",
]);

/**
 * Labels that count as “completed” when ids were renamed away from classic `done`.
 */
const COMPLETED_TASK_STATUS_LABEL = /^(done|complete[d]?|completato)$/i;

/**
 * Resolve the Settings-driven status id that means “Completed” / Done.
 *
 * Order:
 * 1. Known completion ids present in Settings (`done`, `completed`, …)
 * 2. Active status whose label is Done / Completed / Completato
 * 3. Last active Board column (classic Backlog → … → Done layout)
 * 4. Fallback `"done"`
 */
export function completedTaskStatusId(
	statuses: readonly TaskStatusOption[],
): string {
	for (const id of COMPLETED_TASK_STATUS_IDS) {
		if (statuses.some((item) => item.id === id)) {
			return id;
		}
	}
	const active = activeTaskStatuses(statuses);
	const byLabel = active.find((item) =>
		COMPLETED_TASK_STATUS_LABEL.test(item.label.trim()),
	);
	if (byLabel) {
		return byLabel.id;
	}
	return active[active.length - 1]?.id ?? statuses[statuses.length - 1]?.id ?? "done";
}

/**
 * Whether a task status id should show as checked / completed in table UIs.
 */
export function isCompletedTaskStatus(
	status: string,
	statuses: readonly TaskStatusOption[],
): boolean {
	const normalised = status.trim().toLowerCase();
	if (!normalised) {
		return false;
	}
	if (COMPLETED_TASK_STATUS_IDS.has(normalised)) {
		return true;
	}
	return status === completedTaskStatusId(statuses);
}

/**
 * Status to restore when unchecking the Completed checkbox (first non-completed
 * active column, typically Backlog).
 */
export function reopenTaskStatusId(statuses: readonly TaskStatusOption[]): string {
	const completed = completedTaskStatusId(statuses);
	const open = activeTaskStatuses(statuses).find((item) => item.id !== completed);
	if (open) {
		return open.id;
	}
	const any = statuses.find((item) => item.id !== completed);
	return any?.id ?? "backlog";
}

/**
 * Whether Priority maps to **Urgent** on the Eisenhower matrix.
 *
 * **Rule (documented in Settings help + task editor):**
 * - `high` or `urgent` priority → Urgent
 * - `none`, `low`, or `medium` → Not urgent
 *
 * There is no separate YAML `urgent` flag going forward.
 */
export function isUrgentFromPriority(priority: TaskPriority): boolean {
	return priority === "high" || priority === "urgent";
}

/**
 * Soft-default for the Important checkbox on brand-new drafts only.
 * Urgent always comes from Priority via {@link isUrgentFromPriority}.
 *
 * @deprecated Prefer setting `important: false` on new drafts and using
 * {@link resolveEisenhowerFlags}. Kept for tests / migration helpers.
 */
export function eisenhowerFromPriority(priority: TaskPriority): {
	important: boolean;
	urgent: boolean;
} {
	return {
		important: false,
		urgent: isUrgentFromPriority(priority),
	};
}

/**
 * Effective Eisenhower placement: Important from YAML (default false when
 * unset); Urgent always from Priority. Legacy YAML `urgent` is ignored.
 */
export function resolveEisenhowerFlags(task: {
	important: boolean | null;
	priority: TaskPriority;
	/** Legacy field — ignored for placement. */
	urgent?: boolean | null;
}): { important: boolean; urgent: boolean } {
	return {
		important: task.important === true,
		urgent: isUrgentFromPriority(task.priority),
	};
}

/**
 * Priority to write when a matrix drag requires a specific Urgent state.
 *
 * - Need Urgent and current is not → raise to `high`
 * - Need Not urgent and current is Urgent → lower to `medium`
 * - Otherwise keep the existing priority
 */
export function priorityForUrgentState(
	current: TaskPriority,
	wantUrgent: boolean,
): TaskPriority {
	const isUrgent = isUrgentFromPriority(current);
	if (wantUrgent && !isUrgent) {
		return "high";
	}
	if (!wantUrgent && isUrgent) {
		return "medium";
	}
	return current;
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
