# Projects Engine

Obsidian.md plugin for Project Portfolio, Governance, and Delivery Management in Markdown.

Version **1.0.0** · Plugin id `projects-engine` · Mobile-compatible (`isDesktopOnly: false`)

---

## Italiano

### Panoramica e valore

**Projects Engine** gestisce portafoglio, governance e delivery **dentro il vault**, senza database esterni. Ogni cliente, persona, stakeholder, tipo di progetto, tecnologia e task è una nota Markdown (**Entity-as-a-Note**). I collegamenti sono wikilink nativi `[[Nota]]`: Graph View raggruppa i lavori per cliente, stack tecnologico, team e stakeholder.

Il plugin include:

- wizard di creazione progetto (desktop e mobile) con Teams URL
- campi personalizzati configurabili sulle cinque entità catalogo
- editor task (sotto-task annidati, dipendenze, time log, Undo/Redo)
- governance **Semplificato** e **PRINCE2**
- vista portafoglio (tabella / card), Kanban con drag-and-drop, Gantt interattivo
- scheduling DAG con cycle detection e cascade delle date

### Architettura delle entità e Graph View

| Entità | Frontmatter `pe_type` | Cartella predefinita |
| --- | --- | --- |
| Project | `project` | `Projects/` |
| Customer | `customer` | `Entities/Customers/` |
| Team Member | `team-member` | `Entities/Team Members/` |
| Project Type | `project-type` | `Entities/Project Types/` |
| Technology | `technology` | `Entities/Technologies/` |
| Stakeholder | `stakeholder` | `Entities/Stakeholders/` |
| Task | `task` | `Projects/Tasks/` |

Nel YAML i riferimenti sono **wikilink tra virgolette** (`"[[Acme Corp]]"`). Uno **Stakeholder** può puntare a un Customer (`customer`) e essere referenziato da uno o più Project (`stakeholders`); l’associazione vale a livello progetto, cliente, o entrambi (wikilink nei due sensi). Il corpo della nota ripete i link in una sezione **Links**, così Graph View genera cluster anche quando l’indicizzazione YAML è limitata. Non servono plugin di terze parti per il grafo.

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
- **Commesse** (chip multipli), **giorni assegnati**, **Project URL**
- **`teams_channel_url`** — URL Teams / deep link `msteams://`, con pulsante di avvio rapido

Le scritture usano solo `vault.process` (sicure con Obsidian Sync / iCloud).

### Governance

**Semplificato** — flusso lineare **Backlog → In Progress → Review → Done**. Board Kanban lean, time log, giorni effettivi vs budget, vista tabella con fallback card/accordion su schermi stretti (&lt;720px).

**PRINCE2** — Management Stages con Stage Boundary. Alla creazione (o da Portafoglio) vengono generati i registri: Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages. I milestone di fine stage (`is_stage_boundary`) sono **blocchi formali** nello scheduler: lo stage successivo non parte finché il boundary non è chiuso.

### Task, dipendenze e scheduling

- Sotto-task ricorsivi a profondità arbitraria (`parent_id` / `child_ids`)
- Dipendenze intra- e cross-project: `blocked_by` / `blocking`
- Cycle detection prima del salvataggio; Notice se si chiude un ciclo
- Time log `[{ date, duration, member, note }]`; estimate vs actual / remaining mandays
- Auto-schedule e cascade: se un blocker slitta, i dipendenti vengono ripianificati conservando la durata
- Undo/Redo (Command Pattern) su date, dipendenze e status board; persistenza via `vault.process`

### Viste: Portafoglio, Kanban, Gantt

**Portafoglio** — elenco progetti tabellare; sotto i 720px diventa card/accordion. Toolbar per CRUD entità, nuovo progetto/task, Gantt.

**Kanban (Semplificato)** — colonne Backlog / In Progress / Review / Done. Drag-and-drop HTML5 (desktop) e pointer-capture da handle ≥44×44px (touch). Pulsanti status sempre disponibili come fallback mobile/accessibilità.

**Gantt** — timeline a barre con zoom **Day / Week / Month**, filtri per progetto, curve SVG per le dipendenze. Click su barra/etichetta apre l’editor task. Ribbon (icona calendario) e comando **Open Gantt timeline**.

### Modello dati (frontmatter)

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

Campi task rilevanti: `blocked_by`, `blocking`, `start_date`, `end_date`, `duration_days`, `time_logs`, `estimate_mandays`, `is_milestone`, `is_stage_boundary`.

### Come installare il plugin in Obsidian

Requisiti: Obsidian **1.5.0+** (desktop e mobile). Node.js 18+ solo per build da sorgente.

Id: `projects-engine` · Nome: **Projects Engine** · Versione: `1.0.0`

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
```

Copia `main.js`, `manifest.json`, `styles.css` in `<vault>/.obsidian/plugins/projects-engine/`, poi ricarica e abilita. In sviluppo: `npm run dev`.

#### 4. Mobile (iOS / Android)

Dopo la sync del vault, abilita **Projects Engine anche sull’app mobile** (Impostazioni → Community plugins): iOS/Android non ereditano automaticamente l’elenco plugin del desktop.

### Comandi

| Comando | Azione |
| --- | --- |
| Open portfolio view | Vista portafoglio / Kanban (ribbon valigetta) |
| Open Gantt timeline | Timeline Gantt (ribbon calendario) |
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

---

## English

### Overview and value

**Projects Engine** manages portfolio, governance, and delivery **inside the vault** — no external database. Every customer, person, stakeholder, project type, technology, and task is a Markdown note (**Entity-as-a-Note**). Relationships are native `[[wikilinks]]`, so Graph View clusters work by customer, technology stack, team, and stakeholder.

The plugin ships with:

- a touch-friendly project creation wizard (including Teams URL)
- configurable custom fields on the five catalogue entities
- a task editor (nested subtasks, dependencies, time logs, Undo/Redo)
- **Semplificato** and **PRINCE2** governance
- portfolio view (table / cards), Kanban with drag-and-drop, interactive Gantt
- DAG scheduling with cycle detection and date cascade

### Entity architecture and Graph View

| Entity | Frontmatter `pe_type` | Default folder |
| --- | --- | --- |
| Project | `project` | `Projects/` |
| Customer | `customer` | `Entities/Customers/` |
| Team Member | `team-member` | `Entities/Team Members/` |
| Project Type | `project-type` | `Entities/Project Types/` |
| Technology | `technology` | `Entities/Technologies/` |
| Stakeholder | `stakeholder` | `Entities/Stakeholders/` |
| Task | `task` | `Projects/Tasks/` |

YAML stores **quoted wikilinks** (`"[[Acme Corp]]"`). A **Stakeholder** may wikilink a Customer (`customer`) and be referenced from one or more Projects (`stakeholders`); association is valid at project level, customer level, or both. The note body repeats links in a **Links** section so Graph View still clusters when YAML property indexing is limited. No third-party graph plugin is required.

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
- **Work orders** (multi chips), **assigned days**, **Project URL**
- **`teams_channel_url`** — Teams URL / `msteams://` deep link with quick-launch button

All content writes go through `vault.process` only (safe with Obsidian Sync / iCloud).

### Governance

**Semplificato** — linear flow **Backlog → In Progress → Review → Done**. Lean Kanban, time logs, actual vs budget days, table view with card/accordion fallback below 720px.

**PRINCE2** — Management Stages with Stage Boundaries. On create (or from Portfolio) the plugin scaffolds Business Case, Risk Register, Issue & Change Log, Quality Register, and Work Packages. End-of-stage milestones (`is_stage_boundary`) are **formal scheduler blocks**: later stages cannot start until the boundary finishes.

### Tasks, dependencies, and scheduling

- Recursively nested subtasks (`parent_id` / `child_ids`)
- Intra- and cross-project dependencies: `blocked_by` / `blocking`
- Cycle detection before save; Notice if a loop would close
- Time logs `[{ date, duration, member, note }]`; estimate vs actual / remaining mandays
- Auto-schedule and cascade: when a blocker slips, dependents are replaned with duration preserved
- Undo/Redo (Command Pattern) for dates, dependencies, and board status; persisted via `vault.process`

### Views: Portfolio, Kanban, Gantt

**Portfolio** — tabular project listing; below 720px falls back to cards/accordions. Toolbar for entity CRUD, new project/task, Gantt.

**Kanban (Semplificato)** — Backlog / In Progress / Review / Done columns. HTML5 drag-and-drop (desktop) and pointer-capture from a ≥44×44px handle (touch). Status buttons always available as mobile/accessibility fallback.

**Gantt** — bar timeline with **Day / Week / Month** zoom, per-project filter, SVG dependency curves. Clicking a bar/label opens the task editor. Ribbon (calendar icon) and **Open Gantt timeline** command.

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

Scheduler-relevant task fields: `blocked_by`, `blocking`, `start_date`, `end_date`, `duration_days`, `time_logs`, `estimate_mandays`, `is_milestone`, `is_stage_boundary`.

### How to install the plugin in Obsidian

Requirements: Obsidian **1.5.0+** (desktop and mobile). Node.js 18+ only for from-source builds.

Id: `projects-engine` · Name: **Projects Engine** · Version: `1.0.0`

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
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/projects-engine/`, then reload and enable. For development: `npm run dev`.

#### 4. Mobile (iOS / Android)

After vault sync, **enable Projects Engine on the mobile app as well** (Settings → Community plugins): iOS/Android do not inherit the desktop enabled-plugin list.

### Commands

| Command | Action |
| --- | --- |
| Open portfolio view | Portfolio / Kanban leaf (briefcase ribbon) |
| Open Gantt timeline | Gantt leaf (calendar ribbon) |
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

### License

MIT — see [LICENSE](LICENSE).
