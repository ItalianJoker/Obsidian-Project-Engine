/**
 * Bundled release-notes body for {@link ReleaseNotesView}.
 *
 * Kept as a TS module so the browser build does not need Node `fs` to read
 * RELEASE_NOTES.md at runtime. Update alongside RELEASE_NOTES.md for releases.
 */

/** Markdown shown in the Release notes leaf (summary; full file remains in repo). */
export const RELEASE_NOTES_MARKDOWN = `
## 1.2.3

### Improvements & Polish

- **Table spacing & padding** — Unified cell padding (10px 12px) across tables, removed bloated min-width on Due/Scheduled, and aligned all data column gaps to 24px (matching Assignee to Due).
- **New task button styling** — Restyled "+ Add task" to a button matching "New note" with Lucide plus icon and theme styling.

## 1.2.2

### Fixes

- **Task table clean up** — Removed stray vertical line pseudo-element that was showing before the edit button on task rows.

## 1.2.1

### Fixes & Improvements

- **Auto-create referenced entities** — Creating or saving an entity (e.g. Customer in Stakeholder or Stakeholders in Customer) automatically creates the referenced notes in the vault and writes bidirectional wikilinks in both YAML and ## Links.
- **No auto-open note on entity create** — Creating or editing an entity from any menu saves cleanly without forcing the Markdown file open.
- **Task detail standardization** — Redesigned task detail view matching entity cards, with interactive internal link chips for Project, Assignee, Parent task, Subtasks, Blockers, and Time log members.
- **Table inline assignee auto-creation** — Setting an assignee inline in the task table automatically creates the Stakeholder note if new.

## 1.2.0

### Features

- **View entity dashboard section** — Added "View entity" under "Create entity" on the project dashboard (Customer, Stakeholder, Type, Tech) to inspect entity cards, custom fields, and associations.
- **View entity modal** — Touch-friendly catalogue viewer with tabs, live search, entity counts, project association chips, and quick actions to edit or open notes in Obsidian.
- **Stakeholder email field** — Added email/mail support to Stakeholder notes, forms, and indexing.
- **Team entity unification** — Removed separate "Team" entity and unified all team member and assignee selections onto Stakeholder across projects, tasks, and time logs.

## 1.0.9

### Fixes

- **Reorder / checkbox density** — smaller ↑/↓ and Complete checkbox; narrower check/reorder columns.
- **Due / Scheduled layout** — wider cells, nowrap controls, compact pickers; Table horizontal scroll.
- **Expired highlight** — overdue Due/Scheduled warning tint on incomplete rows.

## 1.0.8

### Features

- **Completed checkbox** — Done toggle with confirm; locked Done status column.
- **Task detail / edit** — name opens detail; pencil opens edit; no Markdown auto-open after save.
- **Inline fields + reorder** — Status/Priority/Assignees/Due/Scheduled inline; sibling up/down; Search spacing.
- **Last Update column** — portfolio list shows project last update (\`updated\` / mtime).

## 1.0.7

### Fixes

- **Template editor spacing** — clearer vertical rhythm on the task list template editor in Settings.

## 1.0.6

### Features

- **Task list templates** — assignable customizable templates from Settings / Create–Edit project / Apply template….
- **Settings spacing** — clearer vertical rhythm in the settings pane.
- **Eisenhower** — custom quadrant labels; Urgent from Priority only; Important as checkbox (legacy \`urgent\` YAML ignored for placement).

## 1.0.5

### Features

- **PRINCE2 operational registers** — Risk, Issue & Change, and Quality with lean Markdown templates in the project scaffold.
- **Overview widgets** — register summaries on the project Dashboard/Overview.
- **Settings toggle** — show or hide PRINCE2 register widgets from Settings.
- **Native Obsidian tags & properties** — every PE note with \`pe_type\` gets YAML \`tags\` (\`projects-engine\`, type, optional \`pe/<project-id>\` / register kind); tasks and stages use \`## Links\` for Graph View.

### Refactoring & tests

- **Safety-first (zero regression)** — unreachable stage-boundary null guard removed; README deps/AI guidelines + version **1.0.5**; Vitest coverage for task subtree helpers and Eisenhower defaults. **Breaking changes: none.**

## 1.0.4

### Features

- **Configurable Board columns** — task statuses add/rename/reorder/archive in Settings (Board + editor).
- **Board settings wired** — \`kanbanShowSubtasks\` and description preview apply on the Kanban Board.
- **Eisenhower matrix** — chrome switcher **Dashboard | Table | Gantt | Board | Eisenhower**; \`important\` / \`urgent\` on tasks (YAML); soft-default from priority for new drafts.

### Architecture & tests

- **Safety-first pass** — Vitest pure-module suite (\`npm test\`); zero-regression Scheduler/docs cleanup; no YAML key renames.

## 1.0.3

### Features

- **Dashboard switcher tab** — chrome order **Dashboard | Table | Gantt | Board**. Dashboard is the project Overview home; Table / Gantt / Board remain task-only Workspace views. Returning from Board/Gantt via Dashboard restores the project home (not only the task table).
- **Dashboard section order** — Governance → Status → Task summary → search + task list → Documents → Linked Entities → Actions.

## 1.0.2

### Features

- **New note from Overview Documents** — create a Markdown note in Documents, Initiation, or another project subfolder. Notes include YAML \`project: "[[…]]"\` and a body **Links** section so Graph View clusters them with the project.
- **Documents tree context menu** — Open, Open in new leaf, Reveal in navigation, Rename, Delete, Copy path, Copy Obsidian URL (Obsidian Menu API).
- **Edit Project spacing** — clearer vertical rhythm between field groups (and form footer separation).

## 1.0.1

### Features

- **Obsidian URL deep links** (\`obsidian://projects-engine?...\`) open the project Overview or Workspace leaf (not the raw Markdown editor).
- **Copy Obsidian URL** on project chrome for sharing / bookmarks.

## 1.0.0

### Features

- **Full view set** aligned with [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm): Projects Dashboard, Project Overview, Project Edit (leaf), Workspace (Table / Gantt / Board), Task editor (modal or tab), Release notes.
- **Navigation**: ribbon + commands + in-leaf \`ViewRouter\` (Overview ↔ Workspace ↔ Edit).
- Entity-as-a-Note (Customer, Team, Type, Technology, **Stakeholder**), custom fields, Semplificato / PRINCE2, Teams URL, hours↔days (1 day = 8 h), \`vault.process\`.
- English UI; Settings date/time format (default DD/MM/YYYY + 24h) applies to task editor, tables, board, and Gantt.
- Project budget shown as days and hours on one line (1 day = 8 h).

### Attribution

UI architecture adapted from obsidian-pm (MIT). Branding and domain remain **Projects Engine**.
`;
