# Release notes — Projects Engine

## 1.0.7 — Template editor spacing

**IT:** Spacing più arioso nell’editor dei template di lista task (Settings).

**EN:** Clearer spacing on the task list template editor (Settings).

### Fixes

- **Template editor spacing** — improved vertical rhythm and field separation in the task list template editor UI.

### Breaking Changes

- **None.**

---

## 1.0.6 — Task list templates, Settings, Eisenhower

**IT:** Template di lista task assegnabili e personalizzabili; spacing Settings più chiaro; etichette Eisenhower personalizzabili; Urgent derivato solo da Priority (Important resta checkbox).

**EN:** Assignable customizable task list templates; clearer Settings spacing; custom Eisenhower quadrant labels; Urgent derived from Priority only (Important remains a checkbox).

### Features

- **Task list templates** — create templates (Settings / command), assign on Create / Edit project, apply on create or via Apply template….
- **Eisenhower** — custom quadrant titles/legends in Settings; Urgent from Priority (`high` | `urgent`); Important only as explicit flag (no YAML `urgent` for placement).
- **Settings spacing** — improved vertical rhythm in the settings pane.

### Breaking Changes

- **None** for existing notes. Eisenhower placement ignores legacy `urgent` YAML; Urgency follows Priority.

---

## 1.0.5 — PRINCE2 operational registers

**IT:** Registri operativi PRINCE2 (Risk, Issue & Change, Quality) con template lean nello scaffold; widget Overview + toggle in Settings. **Tag e proprietà YAML** nativi su ogni nota PE (`tags` + `pe_type` + **Links**) per Graph / Properties / Bases. Pass safety-first + copertura Vitest.

**EN:** PRINCE2 operational registers (Risk, Issue & Change, Quality) with lean scaffold templates; Overview widgets + Settings toggle. Native Obsidian **tags and YAML properties** on every PE note (`tags` + `pe_type` + **Links**) for Graph / Properties / Bases. Safety-first pass + Vitest coverage.

### Performance

- No behavioural runtime changes beyond additive frontmatter. Scheduler stage-boundary adjacency drops an unreachable null guard after the existing prefilter (identical edges).

### Dependencies

- Stack unchanged: `obsidian`, `esbuild`, `typescript`, `vitest` (dev-only). **No removals**; no new runtime deps. Removable candidates: **none proven safe**.

### Refactoring

- `buildAdjacency` implicit-boundary loop: remove dead `boundaryStage == null` continue (filter already guarantees non-null).
- README version strings aligned to **1.0.5**; Dependencies & Libraries Stack + AI Context guidelines (IT/EN).
- Central `ensurePeFrontmatterTags` in `buildMarkdownNote`; tasks/stages emit `## Links` for Graph View.

### Tests

- Extended Vitest: task subtree helpers; Eisenhower soft-defaults; register kind guard; PE tags injection; task Markdown Links. Existing suites remain green (no weakened assertions).

### Documentation

- README Quickstart + library/AI policy tables; RELEASE_NOTES Keep a Changelog sections for this patch; in-app release notes summary updated.
- Graph View docs: every PE note carries Obsidian `tags` + YAML properties (+ body **Links**).

### Breaking Changes

- **None.** Additive `tags` on write; existing notes gain tags on next PE save/rebuild of that note.

---

## 1.0.4 — Board columns, Eisenhower, safety suite

**IT:** Colonne Board configurabili in Settings; toggle `kanbanShowSubtasks` / anteprima descrizione collegati al Board; vista **Eisenhower** (importante × urgente) nello switcher (**Dashboard | Table | Gantt | Board | Eisenhower**). Pass di safety-first: suite Vitest sui moduli puri, cleanup a zero regressione, `npm test` in README.

**EN:** Configurable Board columns in Settings; Board wires `kanbanShowSubtasks` / description preview; **Eisenhower** matrix (important × urgent) in the chrome switcher (**Dashboard | Table | Gantt | Board | Eisenhower**). Safety-first pass: Vitest pure-module suite, zero-regression cleanup, `npm test` documented in README.

---

## 1.0.3 — Dashboard as first-class switcher surface

**IT:** Tab **Dashboard** a sinistra di Table nello switcher progetto (**Dashboard | Table | Gantt | Board**). Table/Gantt/Board restano viste solo-task; Dashboard è la home Overview. Ordine sezioni Dashboard: **Governance → Status → Task summary → search + task list → Documents → Linked Entities → Actions**.

**EN:** **Dashboard** tab left of Table in the project chrome switcher (**Dashboard | Table | Gantt | Board**). Table/Gantt/Board stay task-only; Dashboard is the Overview home. Dashboard section order: **Governance → Status → Task summary → search + task list → Documents → Linked Entities → Actions**.

---

## 1.0.2 — Create note, context menu, Edit spacing

**IT:** Da Overview → Documents: **New note** in Documents/Initiation/… con wikilink Graph (`project` YAML + sezione Links); menu contestuale sulle note; spacing Edit Project più arioso.

**EN:** From Overview → Documents: **New note** in Documents/Initiation/… with Graph wikilinks (YAML `project` + Links section); note context menu; clearer Edit Project vertical spacing.

---

## 1.0.1 — Obsidian URL deep links

**IT:** Deep link Obsidian (`obsidian://projects-engine?...`) apre Overview/Workspace del progetto; **Copy Obsidian URL** nella chrome di progetto.

**EN:** Obsidian deep links (`obsidian://projects-engine?...`) open the project Overview/Workspace leaf; **Copy Obsidian URL** on project chrome.

---

## 1.0.0 — Visual parity + containment (§8–§10 overwrite)

**IT / EN (summary):** Shared dotpm-like chrome; Overview task table; Gantt Day–Year + today marker; Kanban counts/due pills; project icon/color/parent/editable ID; `Projects/{ID} - {Name}/` + Entities under Projects root; scaffold + Delete project; task `due`/`scheduled` (optional time); Settings date/time format (default DD/MM/YYYY + 24h) wired through editors and views; budget days · hours on one line; auto-refresh; **English UI**; lean file-based scaffold (folders only, PRINCE2 registers when needed).

---

## 1.0.0 — Full product + UX rebase + Dotpm-parity overhaul (§7)

### Italiano

#### Usabilità (§7) — Dotpm-parity

- **Spacing / chrome** — densità toolbar/header/content allineata a obsidian-pm; meta/tag compacti (chip) che non dominano la vista.
- **Modello tempo** — stime task e time log in **ore** (anche frazionarie); budget progetto in **giorni**; conversione **1 g = 8 h** (Settings → Hours per day); chip duali su una riga (es. `5 d · 40 h`).
- **Formato data/ora** — Settings applicato a editor task, campi custom, tabelle, Kanban e Gantt (default DD/MM/YYYY + 24h). UI in inglese.
- **Filtri portfolio** — **Governance** e **Customer** combinabili, touch-friendly.
- **Status progetto** — palette configurabile in Settings (add/rename/reorder/archive); visibile in portfolio; editabile in Overview e Edit project.
- **Overview stile dotpm** — glyph, meta compact, metriche, CTA **Edit project** / Open workspace.
- **Task dashboard** — tabella con status, priority, assignee, estimate/remaining ore, filtri status/priority (non “solo una nota”).
- Form/chip/picker rifiniti (create/edit project e task).

#### Funzionalità / usabilità

- **Rebase UX** sullo schema di navigazione di [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) (MIT): **Projects (Dashboard) → Overview → Workspace**, con `ViewRouter`, switcher Table/Gantt/Board in una sola leaf, EmptyState, toolbar coerente.
- **Overview** di progetto: metriche, entità collegate, Teams/URL, governance Semplificato o PRINCE2 (stage/registri).
- **Workspace** unificato: Table (gerarchia), Board Kanban (DnD), Gantt (zoom + dipendenze SVG) come SubView.
- Settings: **Open projects in** (Overview | Workspace), **Default workspace view**.
- Dopo la creazione progetto, apertura automatica secondo la surface impostata.
- Identità: id `projects-engine`, nome Projects Engine. Attribuzione in `NOTICE` / `LICENSE`.
- **Wizard di creazione progetto** (modale touch-friendly): ID da pattern/contatore (`PRJ-YYYY-###`), nome, governance Semplificato o PRINCE2, autocomplete fuzzy su Cliente e Tipo, multi-select Tecnologie / Team (ruolo opzionale) / **Stakeholder** (progetto, cliente, o entrambi), chip per commesse, giorni assegnati, URL di progetto, `teams_channel_url` con avvio rapido.
- **Entity-as-a-Note** con wikilink `[[Nota]]`, sezione Links nel corpo per Graph View, CRUD per Customer, Team Member, Project Type, Technology, Stakeholder (sync bidirezionale Stakeholder ↔ Customer / Project).
- **Campi personalizzati** (Settings): schemi sulle cinque entità catalogo; tipi text, number, date, select, multi-select, person, checkbox, url; valori in `custom_fields`.
- **Editor task:** sotto-task ricorsivi, dipendenze `blocked_by` / `blocking` (anche cross-project) con cycle detection, time log `{ date, duration, member, note }`, estimate vs actual / remaining mandays.
- **Scheduler DAG:** topological sort, auto-schedule e cascade (durata conservata); milestone di fine stage PRINCE2 come blocchi formali.
- **Undo/Redo** (Command Pattern) su date, dipendenze e status board; scritture solo via `vault.process`.
- **Governance Semplificato:** Backlog → In Progress → Review → Done; board Kanban lean.
- **Governance PRINCE2:** Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages; Management Stage / Stage Boundary.
- **Kanban DnD:** HTML5 (desktop) e pointer-capture (touch) tra colonne; pulsanti status come fallback mobile.
- **Gantt interattivo:** barre da date/durata, zoom Day/Week/Month, curve SVG per dipendenze, filtro progetto.

#### Architettura e prestazioni (mobile-first)

- Chrome CSS theme-native (`pe-toolbar`, `pe-view-switcher`, `pe-root`); nessun branding dotpm.
- Dominio PE: Entity-as-a-Note, wizard, custom fields, scheduler DAG, `vault.process`, mobile-first.
- `isDesktopOnly: false` — stesso codice su desktop, iOS e Android.
- Scritture atomiche solo con `vault.process` (Obsidian Sync / iCloud).
- Indicizzatore in memoria debounce-ato (default 250 ms).
- Bundle browser (`platform: "browser"`): vietati i builtin Node (`fs`, `path`, `crypto`, …).
- UI: target touch ≥ 44×44 px; modale a pieno schermo sotto i 720 px; tabelle → card/accordion.

#### Vincoli noti

- Scheduling su **giorni calendario UTC**, non calendario lavorativo/festività.
- Undo/Redo a profondità limitata (stack in memoria, default 50 comandi).
- Campi personalizzati del catalogo sulle cinque entità Settings; la nota progetto non ha uno schema custom dedicato oltre i campi nativi.
- `vault.process` richiede un file esistente (create vuoto + process).
- **Gantt:** niente ridimensionamento barre via drag né editing inline delle date (click apre l’editor); zoom a preset Day/Week/Month.
- **Kanban DnD:** su alcuni WebView iOS può servire l’handle dedicato; i pulsanti status restano sempre disponibili come fallback.
- Compatibilità dichiarata da Obsidian 1.5.0+.

---

### English

#### Usability (§7) — Dotpm-parity

- **Spacing / chrome** — toolbar/header/content density closer to obsidian-pm; compact meta/tag chips that do not dominate the view.
- **Time model** — task estimates and time logs in **hours** (fractions OK); project budget in **days**; conversion **1 day = 8 h** (Settings → Hours per day); dual-unit chips on one line (e.g. `5 d · 40 h`).
- **Date/time format** — Settings formats apply to task create/edit, custom fields, tables, Kanban, and Gantt (default DD/MM/YYYY + 24h).
- **Portfolio filters** — combinable **Governance** and **Customer**, touch-friendly.
- **Project status** — configurable palette in Settings (add/rename/reorder/archive); shown on portfolio; editable on Overview and Edit project.
- **Dotpm-like Overview** — glyph, compact meta, metrics, **Edit project** / Open workspace CTAs.
- **Task dashboard** — table with status, priority, assignee, estimate/remaining hours, status/priority filters (not “just a note”).
- Polished forms/chips/pickers (create/edit project and task).

#### Features / usability

- **UX rebase** on the [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) (MIT) navigation model: **Projects (Dashboard) → Overview → Workspace**, with `ViewRouter`, Table/Gantt/Board switcher in one leaf, EmptyState, coherent toolbar.
- **Project Overview**: metrics, linked entities, Teams/URL, Semplificato or PRINCE2 governance (stages/registers).
- **Unified Workspace**: Table (hierarchy), Kanban board (DnD), Gantt (zoom + SVG deps) as SubViews.
- Settings: **Open projects in** (Overview | Workspace), **Default workspace view**.
- After project create, auto-open per the configured surface.
- Identity: id `projects-engine`, name Projects Engine. Attribution in `NOTICE` / `LICENSE`.
- **Project creation wizard** (touch-friendly modal): auto ID from settings pattern/counter (`PRJ-YYYY-###`), name, Semplificato or PRINCE2 governance, fuzzy autocomplete on Customer and Project Type, multi-select Technologies / Team (optional role) / **Stakeholders** (project, customer, or both), work-order chips, assigned days, project URL, and `teams_channel_url` with quick-launch.
- **Entity-as-a-Note** with `[[wikilinks]]`, Links section for Graph View, CRUD for Customer, Team Member, Project Type, Technology, Stakeholder (bidirectional Stakeholder ↔ Customer / Project sync).
- **Custom fields** (Settings): schemas on the five catalogue entities; types text, number, date, select, multi-select, person, checkbox, url; values under `custom_fields`.
- **Task editor:** recursive subtasks, intra- and cross-project `blocked_by` / `blocking` with cycle detection, time logs `{ date, duration, member, note }`, estimate vs actual / remaining mandays.
- **DAG scheduler:** topological sort, auto-schedule and cascade (duration preserved); PRINCE2 end-of-stage milestones as formal blocks.
- **Undo/Redo** (Command Pattern) for dates, dependencies, and board status; writes only through `vault.process`.
- **Semplificato governance:** Backlog → In Progress → Review → Done; lean Kanban board.
- **PRINCE2 governance:** Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages; Management Stages / Stage Boundaries.
- **Kanban DnD:** HTML5 (desktop) and pointer-capture (touch) across columns; status buttons as mobile fallback.
- **Interactive Gantt:** bars from dates/duration, Day/Week/Month zoom, SVG dependency curves, project filter.

#### Architecture & Performance (Mobile-first)

- Theme-native chrome CSS (`pe-toolbar`, `pe-view-switcher`, `pe-root`); no dotpm branding.
- PE domain: Entity-as-a-Note, wizard, custom fields, DAG scheduler, `vault.process`, mobile-first.
- `isDesktopOnly: false` — one codebase for desktop, iOS, and Android.
- Atomic writes only through `vault.process` (Obsidian Sync / iCloud).
- Debounced in-memory indexer (default 250 ms).
- Browser bundle (`platform: "browser"`): Node builtins (`fs`, `path`, `crypto`, …) banned.
- UI: ≥ 44×44 px touch targets; full-viewport modal below 720 px; dense tables → cards/accordions.

#### Known Constraints

- Scheduling uses **UTC calendar days**, not a working-day / holiday calendar.
- Undo/Redo is depth-limited (in-memory stack, default 50 commands).
- Catalogue custom fields apply to the five Settings entity kinds; the project note has no dedicated custom schema beyond native fields.
- `vault.process` requires an existing file (empty create + process).
- **Gantt:** no bar drag-resize or inline date editing (click opens the editor); zoom is preset-based (Day/Week/Month).
- **Kanban DnD:** some iOS WebViews may require the dedicated handle; status buttons remain available as fallback.
- Declared compatibility is Obsidian 1.5.0+.
