# Changelog

All notable changes to Projects Engine are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.3] — 2026-10-14

### Added

- **Show archived projects** — toggle at the bottom of the Projects homepage listing archived projects with **Unarchive** (and Open).
- **Manage Entities** — homepage section (renamed from View entity); create stays inside the catalogue (+ New); each entity card has **Delete Entity** with confirmation.

### Changed

- Removed the duplicate homepage **Create entity** row — entity creation lives once under Manage Entities.

### Fixed

- **Manual archive folder moves** — active vs archived lists follow the configured Projects / Archived folders; Sync & Rebuild Note Metadata (and homepage refresh) normalises YAML `archived` to match location after OS / file-explorer moves.

## [1.4.2] — 2026-10-14

### Added

- **Unarchive project** — Project Dashboard action for archived projects; moves the folder back to the configured Projects folder, clears `archived`, collision-safe.
- **Quick Archive** — compact archive control next to **Open** on the Projects homepage table (same confirm + archive path as Project Dashboard).

## [1.4.1] — 2026-10-14

### Fixed

- **Sync & Rebuild Note Metadata** — recursively owns notes under each project tree (nested folders / OS-moved files); infers `project-document` or `task`, fills missing `project` / `project_id` / tags / Graph Links without wiping existing properties. Notice includes updated count.

### Added

- **Add subtask** — compact `+` control on each table row (Global Dashboard table, project Dashboard task table, Workspace Table); title prompt creates a child under that parent in the same project.

## [1.4.0] — 2026-10-14

### Added

- **Task notes** — optional descriptive `notes` field on Create/Edit task; expandable in-place preview (file icon) on Table, Board, Eisenhower, and Gantt without cluttering the main line. Legacy notes missing the key load safely.
- **Subtask visual hierarchy** — clearer indentation, tree-guide border, and smaller type/badges for nested tasks across Table, Board, Eisenhower, Gantt, and Global Dashboard.
- **Archived projects folder** — Settings path (default `Projects_Archived`); **Archive project** action on Project Dashboard moves the project folder (collision-safe) and hides it from active lists.
- **Sync & Rebuild Note Metadata** — Settings button scans configured plugin folders, normalises missing `pe_type` / `tags`, rebuilds the index; notice `Metadata synchronization complete: X files checked`.
- **Hide completed** — filter chip on Global Dashboard (table), project Dashboard task table, and Workspace Table; hides locked Done status.
- **Scheduled reminders** — Settings **Reminder: minutes before scheduled time** (default 15); Obsidian Notice when a task’s Scheduled date-time is within the lead window (once per occurrence; skips Done / date-only / archived projects).

### Changed

- Settings label **Projects folder** (was “Projects root”); all folder settings normalised with Obsidian `normalizePath()`.
- **Edit project** opens and saves in the current leaf — no new tab; Project Dashboard refreshes in place after save.

## [1.3.4] — 2026-10-14

### Added

- **Default role for Non PM** setting — text field near Default PM; applied only on **Create project** when Non PM is checked (unchecked keeps role **PM**). Edit project flow unchanged.

## [1.3.3] — 2026-10-14

### Added

- **Remove ITSM Item** on the Project Dashboard — delete control on each association (same chrome as Add ITSM Item); confirm dialog; persists via `vault.process`.
- **Default PM** setting — pick a Team Member; new projects auto-add that member with role **PM** (unset = no auto-add).

### Fixed

- **Global Dashboard project label** is clickable text (not a pill badge); still opens the Project Dashboard.
- **Global Dashboard margins** match single-project Task Workspace chrome (content flush under shared `.pe-chrome` padding).
- **Edit project Overview** breadcrumb padding aligns with other edit sections.
- **Edit / Create project** flag toggles (Non PM / Technical intervention) refresh budget fields in place — scroll position is preserved.

## [1.3.2] — 2026-10-14

### Fixed

- Release build includes **Linked Entities → Work orders** card padding fix from [#37](https://github.com/ItalianJoker/Obsidian-Project-Engine/pull/37) (merged after the v1.3.1 asset cut).

## [1.3.1] — 2026-10-13

### Added

- **Add ITSM Item** on Project Dashboard — create Ticket / Change / Problem associations without opening Edit project (same button pattern as New note); persists via `vault.process`.

### Fixed

- **ITSM section** horizontal padding matches Linked Entities on the Project Dashboard.
- **Projects** portfolio title aligns with the ID column text.
- **Linked Entities → Work orders** card padding matches Customer / Project type / Technologies / Team / Stakeholders.
- **Global Dashboard New Task** project picker is a `<select>` dropdown (no button chips).

### Changed

- **Global Dashboard** uses the same Task chrome as the single-project Task section (search, All/Filter, Table | Board | Eisenhower) via shared SubViews; project badges and overdue highlight retained.

## [1.3.0] — 2026-10-13

### Added

- **Global Tasks Dashboard** — aggregate tasks across projects; shared filters; project name badge opens Project Dashboard; overdue highlight; New Task with project selector.
- **Budget modes** — Non PM (`is_non_pm`) relabels Budget → Assigned (Days); Technical intervention (`is_technical_intervention`) shows Time & Materials (No Budget) and hides days input.
- **ITSM associations** — Ticket / Change / Problem CRUD on Create/Edit; Dashboard cards with copyable ID badges.
- **Note templates** — Settings → Templates folder (default `Templates`); New project note template dropdown with `{{project}}`, `{{title}}`, `{{date}}`.
- **Documentation** — README Architecture map, root `.cursorrules`, expanded TSDoc on models/helpers.

### Fixed

- Team member **role** load/persist binding (roles no longer dropped on Edit); role badges on Project Dashboard.
- Edit project action footer uses flex layout (no float/fixed/absolute).
- Projects toolbar title padding aligned with the project grid.
- Safe legacy migration for missing `role`, flags, and `itsm_items`; budget progress guards division-by-zero.

### Changed

- Modal/form footers standardised (`pe-form-footer`).
- Days number inputs use `min="0"`.

## [1.2.5] — 2026-09-20

Table edit icon enlargement and hyperlink task title styling. See `RELEASE_NOTES.md`.

## [1.2.0] — 2026-09-20

View Entity dashboard, Stakeholder email, Team → Stakeholder unification. See `RELEASE_NOTES.md`.
