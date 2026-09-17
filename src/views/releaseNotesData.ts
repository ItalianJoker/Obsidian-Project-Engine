/**
 * Bundled release-notes body for {@link ReleaseNotesView}.
 *
 * Kept as a TS module so the browser build does not need Node `fs` to read
 * RELEASE_NOTES.md at runtime. Update alongside RELEASE_NOTES.md for releases.
 */

/** Markdown shown in the Release notes leaf (summary; full file remains in repo). */
export const RELEASE_NOTES_MARKDOWN = `
## 1.0.5

### Features

- **PRINCE2 operational registers** — Risk, Issue & Change, Quality, and Lessons with lean Markdown templates in the project scaffold.
- **Overview widgets** — register summaries on the project Dashboard/Overview.
- **Settings toggle** — show or hide PRINCE2 register widgets from Settings.

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
