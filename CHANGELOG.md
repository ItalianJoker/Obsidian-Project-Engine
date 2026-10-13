# Changelog

All notable changes to Projects Engine are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.1] — 2026-10-13

### Added

- **Add ITSM Item** on Project Dashboard — create Ticket / Change / Problem associations without opening Edit project (same button pattern as New note); persists via `vault.process`.

### Fixed

- **ITSM section** horizontal padding matches Linked Entities on the Project Dashboard.
- **Projects** portfolio title aligns with the ID column text.
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
