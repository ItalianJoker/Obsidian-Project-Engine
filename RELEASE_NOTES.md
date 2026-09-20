# Release notes — Projects Engine

## 1.2.5 — Table edit icon enlargement & hyperlink task title styling

**IT:** Nelle visualizzazioni a tabella, ingrandita l'icona di modifica del task di 1x1 pixel, azzerato il padding del titolo per allinearlo alla distanza della vista Gantt e rimosso l'overlay stile pulsante trasformandolo in un hyperlink pulito.

**EN:** In table views, enlarged the task edit icon by 1x1 pixel, eliminated title padding to match the Gantt view spacing, and replaced the button-like overlay with clean hyperlink styling.

### Improvements & Polish

- **Table edit icon (+1x1 px)** — Enlarged `.pe-task-table .pe-task-edit-icon` to 17x17px with a 12x12px SVG pencil specifically in table views (while keeping 16x16px / 11px in Gantt, Kanban, and Eisenhower).
- **Task title distance matching Gantt** — Rendered task titles in table view as accessible `<span>` elements (`titleAsButton: false`) and removed internal title padding (`padding: 0; margin: 0`), bringing the distance to the edit icon to exactly 6px (matching Gantt).
- **Hyperlink styling (no button overlay)** — Removed button pill background, border-radius, and fixed min-height from `.pe-task-title`, applying clean hyperlink hover styling (`color: var(--interactive-accent)` and underline) and accessible keyboard focus outlines.

---

## 1.2.4 — Task edit button sizing, vertical alignment & Gantt refinements

**IT:** Ridotta la dimensione del tasto di modifica del Task (altezza pari a una lettera maiuscola) e allineato verticalmente il testo al centro dell'icona nelle viste Gantt, Kanban ed Eisenhower; rimossi i punti elenco e perfezionati i padding nella vista Gantt.

**EN:** Resized the task edit button (scaled to cap-height) and vertically centered task titles with the icon across Gantt, Kanban, and Eisenhower views; removed bullet dots and refined padding in Gantt view.

### Improvements & Polish

- **Task edit button sizing** — Reduced `.pe-task-edit-icon` to 16x16px with an 11px SVG pencil, matching standard uppercase cap-height, and removed forced 44px touch target overrides.
- **Vertical title-icon alignment** — Removed `pe-touch-target` from card and timeline titles in Kanban, Eisenhower, and Gantt subviews. Enforced `align-items: center` and reset title min-heights so task names are precisely centered along the icon's horizontal axis.
- **Gantt view polish** — Removed tree bullet dots (`.pe-gantt-tree-dot`), balanced container padding to a uniform 16px, and aligned label column rows to 100% height with zero top/bottom padding for clean vertical centering within 40px timeline lanes.

---

## 1.2.3 — Table spacing optimization & New task button styling

**IT:** Ottimizzazione e uniformazione dei padding e spazi nelle tabelle (allineati allo spazio tra Assignee e Due); adeguato il pulsante "New task" allo stile visivo di "New note".

**EN:** Optimized and unified padding and spacing across table views (matching the spacing between Assignee and Due); restyled "New task" button to match "New note".

### Improvements & Polish

- **Table spacing & padding** — Unified all table cells across views (`.pe-table`, `.pe-project-list`, `.pe-task-tree-cell`) to `10px 12px` padding. Removed obsolete `min-width: 18rem` on Due and Scheduled columns, eliminating dead space and establishing equal ~24px spacing between all data controls.
- **Root task tree alignment** — Removed unnecessary 18px chevron spacer on root tasks without children, bringing checkbox and edit icon into consistent ~24px spacing.
- **New task button styling** — Replaced plain text "+ Add task" with a structured button matching "New note" (`.pe-docs-tree-add`), complete with Lucide `plus` icon, border, theme background, and rounded corners.

---

## 1.2.2 — Remove stray vertical line in task table

**IT:** Rimossa la linea verticale spuria che appariva prima dell'icona di modifica nelle righe della tabella dei task.

**EN:** Removed stray vertical line pseudo-element appearing before the edit icon on task table rows.

### Fixes

- **Task table tree rendering** — Removed leftover `.pe-task-tree-inner::before` connector line that erroneously rendered a stray vertical mark before the edit button on root tasks from the second row onwards.

---

## 1.2.1 — Entity auto-creation, no auto-open on entity create & task detail standardization

**IT:** Creazione automatica delle entità referenziate fuori dalla creazione del progetto; soppressione apertura automatica nota su creazione entità; uniformazione della vista dettaglio task con layout card e link interni.

**EN:** Auto-creation of referenced entities outside project creation; suppressed automatic note opening on entity creation; standardized task detail view with card layout and interactive internal links.

### Fixes & Improvements

- **Auto-create referenced entities** — Creating or saving a Stakeholder with a new Customer (or Customer with new Stakeholders) automatically creates the referenced note in the vault and writes bidirectional wikilinks in both YAML frontmatter and the `## Links` section.
- **No auto-open note on entity create** — Creating or editing an entity from any menu saves the note, refreshes the index, and notifies without forcing the Markdown file open in the Obsidian workspace.
- **Task detail standardization** — Standardized `TaskDetailModal` with the entity card design (`ViewEntityModal`), featuring status/priority badges, quick Edit and Open note actions, clickable Project chip, clickable Assignee chip, and interactive chip navigation for Parent task, Subtasks, Blocked by, and Blocking dependencies.
- **Table inline assignee auto-creation** — Setting an assignee directly from the task table inline input ensures the Stakeholder note exists in the vault.
- **Codebase refactoring** — Consolidated link target resolution onto canonical `wikiLinkTarget` and unified entity note creation on `ensureEntityNote`.

---

## 1.2.0 — View Entity in Dashboard, Stakeholder email & Team entity unification

**IT:** Nuova sezione "View entity" nella dashboard di progetto; eliminazione entità Team e unificazione su Stakeholder; aggiunto campo email a Stakeholder.

**EN:** New "View entity" section in project dashboard; Team entity elimination and unification into Stakeholder; added email field to Stakeholder.

### Features

- **View entity dashboard section** — Added "View entity" under "Create entity" on the project dashboard with actions for Customer, Stakeholder, Type, and Tech to view detailed entity cards, custom fields, and associations.
- **View entity modal** — Touch-friendly catalogue viewer with tabs, live search, entity counts, project association chips, and quick actions to edit or open notes in Obsidian.
- **Stakeholder email field** — Added email/mail support to Stakeholder notes, forms, and indexing.
- **Team entity unification** — Removed separate "Team" entity and unified all team member and assignee selections onto Stakeholder across projects, tasks, and time logs.

### Breaking Changes

- The standalone `team-member` entity kind is removed in favor of `stakeholder`. Existing notes and queries for `team-member` automatically route to `stakeholder`.

---

## 1.1.2 — Lucide calendar/clock buttons for Due/Scheduled pickers

**IT:** Pulsanti Lucide calendario/orologio per i picker Due/Scheduled su Dashboard/Table.

**EN:** Lucide calendar/clock buttons for Due/Scheduled pickers on Dashboard/Table.

### Fixes

- **Due/Scheduled Lucide pickers** — explicit Lucide `calendar` / `clock` buttons open the native date/time picker (`showPicker()` with focus+click fallback); natives stay visually hidden so dark themes no longer show a low-contrast empty square.

### Breaking Changes

- **None.**

---

## 1.1.1 — Task table header alignment + Due/Scheduled picker icons

**IT:** Allineamento header/righe tabella task; icone Due/Scheduled di nuovo visibili.

**EN:** Task table header/row alignment fixed; Due/Scheduled picker icons visible again.

### Fixes

- **Table header alignment** — thead columns match body (reorder/checkbox/actions cells kept visible) so labels no longer shift left on Dashboard and Table.
- **Due/Scheduled picker icons** — calendar/clock glyphs use muted text color again (v1.1.0 centering had made WebKit indicators invisible).

### Breaking Changes

- **None.**

---

## 1.1.0 — Centered Due/Scheduled picker icons

**IT:** Icone calendario/orologio centrate nei picker Due/Scheduled compatibili.

**EN:** Centered calendar/clock icons on compact Due/Scheduled day and time pickers.

### Fixes

- **Picker icon centering** — WebKit calendar-picker indicator centered in compact Due/Scheduled day and time controls; ISO edit segments and spin buttons hidden so only the glyph shows.

### Breaking Changes

- **None.**

---

## 1.0.9 — Task table controls polish

**IT:** Controlli reorder/checkbox più piccoli; Due/Scheduled senza clipping; evidenziazione scaduti su Dashboard/Table.

**EN:** Smaller reorder/checkbox controls; Due/Scheduled layout without clipping; expired date highlight on Dashboard/Table.

### Fixes

- **Reorder / checkbox density** — smaller ↑/↓ and Complete checkbox (no 44px touch-target floor); narrower check/reorder columns.
- **Due / Scheduled layout** — wider cells, nowrap controls, compact pickers sized to Settings date/time formats; horizontal scroll on Table subview.
- **Expired highlight** — incomplete rows with overdue Due/Scheduled get warning tint; date-only uses UTC calendar day, date-time uses local wall clock.

### Breaking Changes

- **None.**

---

## 1.0.8 — Completed tasks, detail/edit, Last Update

**IT:** Checkbox Completed funzionante con conferma e Done bloccato; dettaglio task al click sul nome e matita per edit; campi inline su Dashboard/Table; riordino sibling; colonna Last Update sul portfolio.

**EN:** Working Completed checkbox with confirm and locked Done; task detail on name click and pencil for edit; inline Dashboard/Table fields; sibling reorder; Last Update column on the portfolio list.

### Features

- **Completed checkbox** — enable Done toggle on Dashboard/Table; confirm before complete; Done status locked as required.
- **Task detail / edit** — name opens read-only detail; pencil opens edit; no auto-open of Markdown after save.
- **Inline task fields** — Status, Priority, Assignees, Due, Scheduled editable on Dashboard/Table; Search row spacing.
- **Sibling reorder** — up/down controls persist `sort_order` (and parent `child_ids`).
- **Last Update column** — portfolio Dashboard shows project last update from YAML `updated` (fallback file mtime).

### Breaking Changes

- **None.**

---

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
