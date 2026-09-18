# Projects Engine

Obsidian.md plugin for Project Portfolio, Governance, and Delivery Management in Markdown.

Version **1.0.6** · Plugin id `projects-engine` · Mobile-compatible (`isDesktopOnly: false`)

Navigation and view chrome are inspired by [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) (MIT); domain features and branding remain Projects Engine. See `NOTICE`.

---

## Italiano

> **Generato con Cursor** — questo repository è stato sviluppato con [Cursor](https://cursor.com).

### Panoramica e valore

**Projects Engine** gestisce portafoglio, governance e delivery **dentro il vault**, senza database esterni. Ogni cliente, persona, stakeholder, tipo di progetto, tecnologia e task è una nota Markdown (**Entity-as-a-Note**). I collegamenti sono wikilink nativi `[[Nota]]`: Graph View raggruppa i lavori per cliente, stack tecnologico, team e stakeholder.

La navigazione segue un funnel coerente: **Projects (lista) → Overview (home governance) → Edit (leaf) → Workspace (Table / Gantt / Board)**, più **Task** (modale o tab) e **Release notes**, nello stesso spirito di [obsidian-pm](https://github.com/dotpm/obsidian-pm), senza copiarne branding o Local API.

Il plugin include:

- wizard di creazione progetto (desktop e mobile) con Teams URL
- campi personalizzati configurabili sulle cinque entità catalogo
- editor task (sotto-task annidati, dipendenze, time log, Undo/Redo)
- governance **Semplificato** e **PRINCE2**
- Dashboard progetti, Overview, Edit progetto (leaf), Workspace unificato (Table / Kanban / Gantt), editor Task (modale o tab), Release notes
- scheduling DAG con cycle detection e cascade delle date

### Architettura delle entità e Graph View

| Entità | Frontmatter `pe_type` | Cartella predefinita |
| --- | --- | --- |
| Project | `project` | `Projects/{ID} - {Name}/` |
| Customer | `customer` | `Projects/Entities/Customers/` |
| Team Member | `team-member` | `Projects/Entities/Team Members/` |
| Project Type | `project-type` | `Projects/Entities/Project Types/` |
| Technology | `technology` | `Projects/Entities/Technologies/` |
| Stakeholder | `stakeholder` | `Projects/Entities/Stakeholders/` |
| Task list template | `task-list-template` | `Projects/Entities/Task List Templates/` |
| Task | `task` | `Projects/{ID} - {Name}/Tasks/` |

Nel YAML i riferimenti sono **wikilink tra virgolette** (`"[[Acme Corp]]"`). Ogni nota PE con `pe_type` riceve anche **`tags`** Obsidian (`projects-engine`, il `pe_type`, e dove noto `pe/<project-id>`) più le proprietà YAML, così Properties / Tags / Bases / filtri Graph funzionano nativamente. Uno **Stakeholder** può puntare a un Customer (`customer`) e essere referenziato da uno o più Project (`stakeholders`); l’associazione vale a livello progetto, cliente, o entrambi (wikilink nei due sensi). Il corpo della nota ripete i link in una sezione **Links**, così Graph View genera cluster anche quando l’indicizzazione YAML è limitata. Le note create da Overview → Documents usano lo stesso schema (`project: "[[…]]"` + **Links** → Project; task e stage idem). Non servono plugin di terze parti per il grafo.

### Campi personalizzati

In **Impostazioni → Projects Engine** si definiscono schemi dinamici per cinque entità:

1. Customer  
2. Team Member  
3. Project Type  
4. Project Technology  
5. Stakeholder  

Tipi supportati: **text**, **number**, **date**, **select**, **multi-select**, **person**, **checkbox**, **url**. I valori sono persistiti nel frontmatter sotto `custom_fields` e resi nei form di creazione/modifica entità (touch-friendly).

### Wizard di creazione progetto

Modale mobile-ready che raccoglie e valida:

- **Project ID** — pattern/contatore in Settings (es. `PRJ-YYYY-###`)
- **Nome**, **governance** (`Semplificato` | `PRINCE2`)
- **Customer** e **Project type** — autocomplete fuzzy (crea nota se manca)
- **Technologies**, **Team** (ruolo opzionale), **Stakeholders** (progetto e/o cliente)
- **Commesse** (chip multipli), **budget in giorni (giornate)**, **Project URL**
- **`teams_channel_url`** — URL Teams / deep link `msteams://`, con pulsante di avvio rapido
- **Task list template** (opzionale) — assegna un template Entity-as-a-Note; applicato in `Tasks/` dopo lo scaffold

Le scritture usano solo `vault.process` (sicure con Obsidian Sync / iCloud).

### Modello tempo (ore ↔ giorni)

- **Budget di progetto** (`assigned_days`): **giorni / giornate** di gestione. In UI: giorni e ore sulla stessa riga (es. `5 d · 40 h`).
- **Stime task e time log** (`estimate_hours`, `duration` nei log): **ore** (anche frazionarie, es. `0.5`, `1.25`).
- Conversione: **1 giorno = 8 ore** (impostabile in Settings → Hours per day). L’interfaccia utente è in **inglese**.

### Formato data e ora

In Settings → **Date format** / **Time format** il formato vale per editor task (due / scheduled / start / end / time log), campi custom date, tabelle, Kanban e Gantt. Default: **DD/MM/YYYY** + **24 ore**. In YAML resta ISO.

### Status progetto e colonne Board

In Settings → **Project statuses** si aggiungono, rinomina, riordinano (drag) e archivia status. Visibili in portfolio e modificabili da Overview / Edit project.

In Settings → **Board → Task board columns** si configurano le colonne Kanban / status task (stesso modello: add / rename / reorder / colour / archive). Default: Backlog → Done; Blocked / Cancelled archiviati. Note con status sconosciuti restano leggibili e finiscono nella prima colonna attiva finché non le sposti.

### Governance

**Semplificato** — flusso lineare **Backlog → In Progress → Review → Done** (personalizzabile). Board Kanban lean, time log, giorni effettivi vs budget, vista tabella con fallback card/accordion su schermi stretti (&lt;720px).

**PRINCE2** — Management Stages con Stage Boundary. Alla creazione (o da Portafoglio) vengono generati i registri: Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages. I milestone di fine stage (`is_stage_boundary`) sono **blocchi formali** nello scheduler: lo stage successivo non parte finché il boundary non è chiuso.


### Template di task list

1. **Crea** un template: Settings → Task list templates → **Create template**, oppure comando *Create task list template*. Nota Entity-as-a-Note con `pe_type: task-list-template` e albero YAML `tasks` (gerarchia via `children`).
2. **Assegna** al progetto: nel wizard di creazione o in Edit project, campo *Task list template* (fuzzy). YAML: `task_list_template: "[[Nome]]"`.
3. **Applica**: in creazione, se assegnato, genera le note sotto `Tasks/` dopo lo scaffold. In Edit, usa **Apply template…** (conferma se `Tasks/` non è vuota). Ogni task ha tags/properties Graph-ready.

I progetti senza template restano invariati.

### Task, dipendenze e scheduling

- Sotto-task ricorsivi a profondità arbitraria (`parent_id` / `child_ids`); **Delete task** rimuove l’intero sottoalbero (con conferma)
- Dipendenze intra- e cross-project: `blocked_by` / `blocking`
- Cycle detection prima del salvataggio; Notice se si chiude un ciclo
- Time log `[{ date, duration, member, note }]` con `duration` in **ore**; estimate in **ore** (`estimate_hours`) con mirror legacy `estimate_mandays`
- Auto-schedule e cascade: se un blocker slitta, i dipendenti vengono ripianificati conservando la durata
- Undo/Redo (Command Pattern) su date, dipendenze e status board; persistenza via `vault.process`

### Viste: Projects → Overview → Edit → Workspace (+ Task / Release notes)

**Projects (Dashboard)** — elenco progetti con filtri combinabili **Governance** + **Customer**, ricerca, chip status, budget giorni·ore su una riga, menu contestuale (overview / workspace / **Edit project** / table / board / Gantt). Sotto i 720px: card/accordion. Toolbar `+ new project` e CRUD entità. Margini allineati a Overview / Workspace.

**Overview (Dashboard del progetto)** — home del progetto (stile dotpm), legata al tab **Dashboard** nello switcher (a sinistra di Table). Sezioni nell’ordine **Governance → Status → Task summary → search + task list → Documents → Linked Entities → Actions**. Albero documenti (esclusa `Tasks/`): **New note** crea una nota Markdown in una sottocartella (Documents, Initiation, …) già collegata al progetto per Graph View (`project` in YAML + sezione **Links**); menu contestuale sulle note (Open, new leaf, reveal, rename, delete, copy path/URL). Eliminazione task dall’editor (e dalla tabella) con conferma; i sotto-task annidati vengono eliminati insieme al padre.

**Edit project** — leaf dedicata (parità obsidian-pm), non solo modale.

**Workspace** — leaf task-only con switcher condiviso **Dashboard | Table | Gantt | Board | Eisenhower** (Dashboard torna all’Overview):
- **Table** — gerarchia, status, priority, assignee, due/scheduled (formato Settings), estimate/remaining ore, filtri status/priority
- **Board (Kanban)** — colonne da Settings (default Backlog / In Progress / Review / Done); DnD HTML5 + pointer-capture; toggle sotto-task e anteprima descrizione; fallback status su mobile
- **Eisenhower** — matrice 2×2 Important × Urgent; campi YAML `important` / `urgent`; DnD tra quadranti
- **Gantt** — barre, zoom Day/Week/Month, curve SVG dipendenze; date nel formato Settings; click apre l’editor

**Task** — editor in **tab** (default) o modale; date/ora seguono Settings; Important/Urgent editabili. **Release notes** — comando dedicato.

In Settings: **Open projects in** (Overview | Workspace), **Default workspace view**, **Open task editor in**, **Project statuses**, **Task board columns** (Board), **Hours per day**, **Date format** / **Time format**. UI in inglese.

### Deep link Obsidian (URI del Dashboard / Overview)

Il plugin registra l’azione protocollo `projects-engine`. Aprendo un URL `obsidian://…` si apre la **vista plugin corretta** (Overview o Workspace), **non** solo il file `.md` nell’editor Markdown.

Formato:

```text
obsidian://projects-engine?vault=<NomeVault>&id=<ProjectID>&view=overview
obsidian://projects-engine?vault=<NomeVault>&path=<percorso-relativo-vault>&view=overview
obsidian://projects-engine?vault=<NomeVault>&id=<ProjectID>&view=workspace&mode=table
```

Parametri:

| Parametro | Descrizione |
| --- | --- |
| `vault` | Nome del vault (gestito da Obsidian prima del plugin) |
| `id` | Frontmatter `id` del progetto (es. `PRJ-2026-001`) |
| `path` | Percorso relativo al vault della nota progetto |
| `view` | `overview` (default) oppure `workspace` |
| `mode` | Solo con `view=workspace`: `table` \| `gantt` \| `kanban` \| `eisenhower` |

Esempio Overview:

```text
obsidian://projects-engine?vault=Work&id=PRJ-2026-001&view=overview
```

Da Overview / Workspace: icona **link** sulla chrome del progetto (**Copy Obsidian URL**), oppure il pulsante **Copy Obsidian URL** nella sezione Actions.

Esempio di nota progetto:

```yaml
---
pe_type: project
id: PRJ-2026-001
name: Migrazione Cloud Alpha
governance: PRINCE2
status: backlog
customer: "[[Acme Corp]]"
project_type: "[[Cloud Migration]]"
technologies:
  - "[[Docker]]"
  - "[[Kubernetes]]"
team:
  - member: "[[Jane Doe]]"
    role: Project Manager
stakeholders:
  - "[[CIO Acme]]"
work_orders:
  - COM-2026-01
assigned_days: 40
actual_days: 0
project_url: https://dev.azure.com/example
teams_channel_url: https://teams.microsoft.com/l/channel/example
created: 2026-09-14T00:00:00.000Z
updated: 2026-09-14T00:00:00.000Z
---
```

Esempio di nota Stakeholder:

```yaml
---
pe_type: stakeholder
name: CIO Acme
customer: "[[Acme Corp]]"
projects:
  - "[[PRJ-2026-001 Migrazione Cloud Alpha]]"
---
```

Campi task rilevanti: `blocked_by`, `blocking`, `start_date`, `end_date`, `duration_days`, `time_logs`, `estimate_hours` (preferito; legacy `estimate_mandays`), `priority`, `is_milestone`, `is_stage_boundary`.

### Come installare il plugin in Obsidian

Requisiti: Obsidian **1.5.0+** (desktop e mobile). Node.js 18+ solo per build da sorgente.

Id: `projects-engine` · Nome: **Projects Engine** · Versione: `1.0.6`

#### 1. Installazione utente (copia dei file)

1. Crea `<vault>/.obsidian/plugins/projects-engine/`
2. Copia `main.js`, `manifest.json`, `styles.css` (da una [release GitHub](https://github.com/ItalianJoker/Obsidian-Project-Engine/releases) o dalla build locale)
3. **Ricarica Obsidian**
4. **Impostazioni → Community plugins** — disattiva Restricted mode se attivo
5. Abilita **Projects Engine**

#### 2. Installazione con BRAT

1. Installa e abilita [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. **Add beta plugin** → `ItalianJoker/Obsidian-Project-Engine`
3. Abilita **Projects Engine** e ricarica se necessario

#### 3. Build locale (sviluppatori)

```bash
git clone https://github.com/ItalianJoker/Obsidian-Project-Engine.git
cd Obsidian-Project-Engine
npm install
npm run build
npm test
```

Copia `main.js`, `manifest.json`, `styles.css` in `<vault>/.obsidian/plugins/projects-engine/`, poi ricarica e abilita. In sviluppo: `npm run dev`. I test Vitest coprono i moduli puri (`engine/`, `services/`) senza l’API Obsidian completa.

#### 4. Mobile (iOS / Android)

Dopo la sync del vault, abilita **Projects Engine anche sull’app mobile** (Impostazioni → Community plugins): iOS/Android non ereditano automaticamente l’elenco plugin del desktop.

### Comandi

| Comando | Azione |
| --- | --- |
| Open projects pane | Dashboard progetti (ribbon valigetta) |
| Open overview for current project | Home governance del progetto attivo |
| Open workspace for current project | Workspace Table/Gantt/Board |
| Open Gantt for current project | Workspace in modalità Gantt |
| Create project | Wizard di creazione |
| Create task for active project | Editor task sul progetto/task attivo |
| Create customer / team member / project type / technology / stakeholder | CRUD Entity-as-a-Note |
| Edit active entity note | Modifica l’entità aperta |
| Open Teams channel for current project | Avvia `teams_channel_url` |
| Undo / Redo last schedule change | Stack Command Pattern |

### Vincoli noti

- Scheduling su **giorni calendario UTC** (non calendario lavorativo)
- Gantt: niente resize barre via drag; click apre l’editor (zoom a preset Day/Week/Month)
- Kanban DnD: su alcuni WebView iOS usare l’handle; i pulsanti status restano disponibili
- Undo/Redo a profondità limitata (stack in memoria)

### Dipendenze e stack librerie

| Pacchetto | Ruolo | Note |
| --- | --- | --- |
| `obsidian` (dev) | Tipi API host | Externalizzato da esbuild; runtime fornito da Obsidian |
| `esbuild` (dev) | Bundle produzione `main.js` | Nessun builtin Node nel bundle |
| `typescript` (dev) | Typecheck (`tsc --noEmit`) | `noUnusedLocals` / `noUnusedParameters` |
| `vitest` (dev) | Suite moduli puri | Stub `tests/mocks/obsidian.ts` |

Nessuna dipendenza runtime npm: il plugin usa solo l’API Obsidian e API web native.

### Contesto AI e linee guida sviluppatori

- **Architettura:** Entity-as-a-Note → Indexer / Scheduler puri → viste Obsidian (`views/`, `ui/`). Scrivere solo via `vault.process`.
- **Invarianti:** chiavi YAML, default Settings, firme pubbliche e side-effect I/O invariati salvo migrazione esplicita.
- **Policy librerie:** niente nuove dipendenze senza necessità; preferire API native; non rimuovere export “orfani” se sono superficie pubblica / migrazione.
- **Test:** `npm test` deve restare verde; estendere Vitest sui moduli puri, non indebolire assertion.

---

## English

> **Generated with Cursor** — this repository was built with [Cursor](https://cursor.com).

### Overview and value

**Projects Engine** manages portfolio, governance, and delivery **inside the vault** — no external database. Every customer, person, stakeholder, project type, technology, and task is a Markdown note (**Entity-as-a-Note**). Relationships are native `[[wikilinks]]`, so Graph View clusters work by customer, technology stack, team, and stakeholder.

Navigation follows a coherent funnel: **Projects (list) → Overview (governance home) → Edit (leaf) → Workspace (Table / Gantt / Board)**, plus **Task** (modal or tab) and **Release notes**, inspired by [obsidian-pm](https://github.com/dotpm/obsidian-pm), without copying its branding or Local API. See `NOTICE`.

The plugin ships with:

- a touch-friendly project creation wizard (including Teams URL)
- configurable custom fields on the five catalogue entities
- a task editor (nested subtasks, dependencies, time logs, Undo/Redo)
- **Semplificato** and **PRINCE2** governance
- Projects dashboard, Overview, Project Edit (leaf), unified Workspace (Table / Kanban / Gantt), Task editor (modal or tab), Release notes
- DAG scheduling with cycle detection and date cascade

### Entity architecture and Graph View

| Entity | Frontmatter `pe_type` | Default folder |
| --- | --- | --- |
| Project | `project` | `Projects/{ID} - {Name}/` |
| Customer | `customer` | `Projects/Entities/Customers/` |
| Team Member | `team-member` | `Projects/Entities/Team Members/` |
| Project Type | `project-type` | `Projects/Entities/Project Types/` |
| Technology | `technology` | `Projects/Entities/Technologies/` |
| Stakeholder | `stakeholder` | `Projects/Entities/Stakeholders/` |
| Task list template | `task-list-template` | `Projects/Entities/Task List Templates/` |
| Task | `task` | `Projects/{ID} - {Name}/Tasks/` |

YAML stores **quoted wikilinks** (`"[[Acme Corp]]"`). Every PE note with `pe_type` also gets Obsidian **`tags`** (`projects-engine`, the `pe_type`, and when known `pe/<project-id>`) plus YAML properties so Properties / Tags / Bases / Graph filters work natively. A **Stakeholder** may wikilink a Customer (`customer`) and be referenced from one or more Projects (`stakeholders`); association is valid at project level, customer level, or both. The note body repeats links in a **Links** section so Graph View still clusters when YAML property indexing is limited. Notes created from Overview → Documents use the same pattern (`project: "[[…]]"` + **Links** → Project; tasks and stages likewise). No third-party graph plugin is required.

### Custom fields

Under **Settings → Projects Engine**, define dynamic schemas for five entities:

1. Customer  
2. Team Member  
3. Project Type  
4. Project Technology  
5. Stakeholder  

Supported types: **text**, **number**, **date**, **select**, **multi-select**, **person**, **checkbox**, **url**. Values are stored under YAML `custom_fields` and rendered on entity create/edit forms (touch-friendly).

### Project creation wizard

Mobile-ready modal that collects and validates:

- **Project ID** — settings pattern/counter (e.g. `PRJ-YYYY-###`)
- **Name**, **governance** (`Semplificato` | `PRINCE2`)
- **Customer** and **Project type** — fuzzy autocomplete (creates the note if missing)
- **Technologies**, **Team** (optional role), **Stakeholders** (project and/or customer)
- **Work orders** (multi chips), **budget in days**, **Project URL**
- **`teams_channel_url`** — Teams URL / `msteams://` deep link with quick-launch button
- **Task list template** (optional) — assign an Entity-as-a-Note template; applied into `Tasks/` after scaffold

All content writes go through `vault.process` only (safe with Obsidian Sync / iCloud).

### Time model (hours ↔ days)

- **Project budget** (`assigned_days`): **days** (management days). Shown with hours on one line (e.g. `5 d · 40 h`).
- **Task estimates and time logs** (`estimate_hours`, log `duration`): **hours** (fractions OK, e.g. `0.5`, `1.25`).
- Conversion: **1 day = 8 hours** (configurable in Settings → Hours per day).

### Date & time format

Settings → **Date format** / **Time format** apply to the task editor (due / scheduled / start / end / time logs), custom-field dates, tables, Kanban, and Gantt. Defaults: **DD/MM/YYYY** + **24-hour**. YAML still stores ISO.

### Configurable project statuses & Board columns

Settings → **Project statuses**: add, rename, reorder (drag), and archive. Visible on the portfolio and editable from Overview / Edit project.

Settings → **Board → Task board columns**: configure Kanban / task status columns (same model: add / rename / reorder / colour / archive). Defaults: Backlog → Done; Blocked / Cancelled archived. Notes with unknown status ids still load and appear in the first active column until moved.

### Governance

**Semplificato** — linear flow **Backlog → In Progress → Review → Done** (customisable). Lean Kanban, time logs, actual vs budget days, table view with card/accordion fallback below 720px.

**PRINCE2** — Management Stages with Stage Boundaries. On create (or from Portfolio) the plugin scaffolds Business Case, Risk Register, Issue & Change Log, Quality Register, and Work Packages. End-of-stage milestones (`is_stage_boundary`) are **formal scheduler blocks**: later stages cannot start until the boundary finishes.


### Task list templates

1. **Create** a template: Settings → Task list templates → **Create template**, or the *Create task list template* command. Entity-as-a-Note with `pe_type: task-list-template` and a YAML `tasks` tree (hierarchy via `children`).
2. **Assign** to a project: Create project wizard or Edit project → *Task list template* (fuzzy). YAML: `task_list_template: "[[Name]]"`.
3. **Apply**: on create (when assigned), materialises notes under `Tasks/` after scaffold. On edit, use **Apply template…** (confirms if `Tasks/` already has notes). Generated tasks include Obsidian tags + properties + Graph Links.

Projects without a template are unchanged.

### Tasks, dependencies, and scheduling

- Recursively nested subtasks (`parent_id` / `child_ids`); **Delete task** removes the whole subtree (with confirmation)
- Intra- and cross-project dependencies: `blocked_by` / `blocking`
- Cycle detection before save; Notice if a loop would close
- Time logs `[{ date, duration, member, note }]` with `duration` in **hours**; estimates in **hours** (`estimate_hours`) with legacy `estimate_mandays` mirror
- Auto-schedule and cascade: when a blocker slips, dependents are replaned with duration preserved
- Undo/Redo (Command Pattern) for dates, dependencies, and board status; persisted via `vault.process`

### Views: Projects → Overview → Edit → Workspace (+ Task / Release notes)

**Projects (Dashboard)** — searchable list with combinable **Governance** + **Customer** filters, status chips, budget as days · hours on one line, context menu (overview / workspace / **Edit project** / table / board / Gantt). Below 720px: card/accordion. Toolbar: `+ new project` and entity CRUD. Pleasant left/right/top padding aligned with Overview / Workspace.

**Overview (project Dashboard)** — project home (dotpm-like), bound to the **Dashboard** tab in the chrome switcher (left of Table). Sections in order **Governance → Status → Task summary → search + task list → Documents → Linked Entities → Actions**. Documents tree (excludes `Tasks/`): **New note** creates a Markdown note in a chosen project subfolder (Documents, Initiation, …) already Graph-linked to the project (YAML `project` wikilink + body **Links** section); right-click context menu on notes (Open, new leaf, reveal, rename, delete, copy path/URL). Delete task from the editor (and table row) with confirmation; nested subtasks are deleted with the parent.

**Edit project** — dedicated leaf (obsidian-pm parity), not modal-only.

**Workspace** — task-only leaf with shared switcher **Dashboard | Table | Gantt | Board | Eisenhower** (Dashboard returns to Overview):
- **Table** — hierarchy, status, priority, assignee, due/scheduled (Settings format), estimate/remaining hours, status/priority filters
- **Board (Kanban)** — columns from Settings (default Backlog / In Progress / Review / Done); HTML5 + pointer-capture DnD; Show subtasks / description preview toggles; mobile status fallback
- **Eisenhower** — 2×2 Important × Urgent matrix; YAML `important` / `urgent`; drag between quadrants
- **Gantt** — bars, Day/Week/Month zoom, SVG dependency curves; dates use Settings format; click opens the editor

**Task** — editor in a **tab** (default) or modal; date/time fields follow Settings; Important/Urgent editable. **Release notes** — dedicated command.

Settings: **Open projects in** (Overview | Workspace), **Default workspace view**, **Open task editor in**, **Project statuses**, **Task board columns** (Board), **Hours per day**, **Date format** / **Time format**. English UI throughout.

### Obsidian URL deep link (Dashboard / Overview)

The plugin registers the protocol action `projects-engine`. Opening an `obsidian://…` URL lands on the **correct plugin view** (Overview or Workspace) — **not** only the raw project `.md` in the Markdown editor.

Format:

```text
obsidian://projects-engine?vault=<VaultName>&id=<ProjectID>&view=overview
obsidian://projects-engine?vault=<VaultName>&path=<vault-relative-path>&view=overview
obsidian://projects-engine?vault=<VaultName>&id=<ProjectID>&view=workspace&mode=table
```

Parameters:

| Parameter | Description |
| --- | --- |
| `vault` | Vault name (handled by Obsidian before the plugin) |
| `id` | Project frontmatter `id` (e.g. `PRJ-2026-001`) |
| `path` | Vault-relative path to the project note |
| `view` | `overview` (default) or `workspace` |
| `mode` | With `view=workspace` only: `table` \| `gantt` \| `kanban` \| `eisenhower` |

Example Overview URL:

```text
obsidian://projects-engine?vault=Work&id=PRJ-2026-001&view=overview
```

From Overview / Workspace chrome: use the **link** icon (**Copy Obsidian URL**), or the **Copy Obsidian URL** button under Actions.

### Frontmatter data model

Example project note:

```yaml
---
pe_type: project
id: PRJ-2026-001
name: Cloud Migration Alpha
governance: PRINCE2
status: backlog
customer: "[[Acme Corp]]"
project_type: "[[Cloud Migration]]"
technologies:
  - "[[Docker]]"
  - "[[Kubernetes]]"
team:
  - member: "[[Jane Doe]]"
    role: Project Manager
stakeholders:
  - "[[CIO Acme]]"
work_orders:
  - COM-2026-01
assigned_days: 40
actual_days: 0
project_url: https://dev.azure.com/example
teams_channel_url: https://teams.microsoft.com/l/channel/example
created: 2026-09-14T00:00:00.000Z
updated: 2026-09-14T00:00:00.000Z
---
```

Example Stakeholder note:

```yaml
---
pe_type: stakeholder
name: CIO Acme
customer: "[[Acme Corp]]"
projects:
  - "[[PRJ-2026-001 Cloud Migration Alpha]]"
---
```

Scheduler-relevant task fields: `blocked_by`, `blocking`, `start_date`, `end_date`, `duration_days`, `time_logs`, `estimate_hours` (preferred; legacy `estimate_mandays`), `priority`, `is_milestone`, `is_stage_boundary`.

### How to install the plugin in Obsidian

Requirements: Obsidian **1.5.0+** (desktop and mobile). Node.js 18+ only for from-source builds.

Id: `projects-engine` · Name: **Projects Engine** · Version: `1.0.6`

#### 1. End-user install (copy the plugin files)

1. Create `<vault>/.obsidian/plugins/projects-engine/`
2. Copy `main.js`, `manifest.json`, `styles.css` (from a [GitHub release](https://github.com/ItalianJoker/Obsidian-Project-Engine/releases) or a local build)
3. **Reload Obsidian**
4. **Settings → Community plugins** — turn off Restricted mode if needed
5. Enable **Projects Engine**

#### 2. Install with BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. **Add beta plugin** → `ItalianJoker/Obsidian-Project-Engine`
3. Enable **Projects Engine** and reload if needed

#### 3. Local build (developers)

```bash
git clone https://github.com/ItalianJoker/Obsidian-Project-Engine.git
cd Obsidian-Project-Engine
npm install
npm run build
npm test
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/projects-engine/`, then reload and enable. For development: `npm run dev`. Vitest covers pure modules (`engine/`, `services/`) without the full Obsidian API.

#### 4. Mobile (iOS / Android)

After vault sync, **enable Projects Engine on the mobile app as well** (Settings → Community plugins): iOS/Android do not inherit the desktop enabled-plugin list.

### Commands

| Command | Action |
| --- | --- |
| Open projects pane | Projects dashboard (briefcase ribbon) |
| Open overview for current project | Governance home for the active project |
| Open workspace for current project | Table / Gantt / Board workspace |
| Open Gantt for current project | Workspace in Gantt mode |
| Create project | Creation wizard |
| Create task for active project | Task editor for active project/task |
| Create customer / team member / project type / technology / stakeholder | Entity-as-a-Note CRUD |
| Edit active entity note | Edit the open entity |
| Open Teams channel for current project | Launch `teams_channel_url` |
| Undo / Redo last schedule change | Command Pattern stack |

### Known constraints

- Scheduling uses **UTC calendar days** (not a working-day calendar)
- Gantt: no bar drag-resize; click opens the editor (preset Day/Week/Month zoom)
- Kanban DnD: some iOS WebViews need the handle; status buttons remain available
- Undo/Redo is depth-limited (in-memory stack)

### Dependencies & Libraries Stack

| Package | Role | Notes |
| --- | --- | --- |
| `obsidian` (dev) | Host API types | Externalised by esbuild; runtime provided by Obsidian |
| `esbuild` (dev) | Production `main.js` bundle | No Node builtins in the browser bundle |
| `typescript` (dev) | Typecheck (`tsc --noEmit`) | `noUnusedLocals` / `noUnusedParameters` |
| `vitest` (dev) | Pure-module test suite | Stub at `tests/mocks/obsidian.ts` |

No runtime npm dependencies — the plugin uses the Obsidian API and native web APIs only.

### Quickstart

```bash
npm install
npm test
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/projects-engine/`, reload Obsidian, enable **Projects Engine**.

### AI Context & Developer Guidelines

- **Architecture:** Entity-as-a-Note → pure Indexer / Scheduler → Obsidian views (`views/`, `ui/`). Persist only via `vault.process`.
- **Invariants:** YAML keys, Settings defaults, public signatures, and I/O side-effects stay identical unless an explicit migration ships.
- **Library policy:** no new deps without need; prefer native APIs; do not blind-delete unused exports that may be public / migration surface (Watchlist).
- **Tests:** keep `npm test` 100% green; extend Vitest on pure modules; never weaken assertions.
- **Safety-first:** empty branches / unreachable guards only when proven; dynamic/UI stubs stay on the Watchlist.

### License

MIT — see [LICENSE](LICENSE). Navigation/UI architecture portions adapted from [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm) (MIT © 2026 Stepan Kropachev and dotpm contributors); see [NOTICE](NOTICE).
