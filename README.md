# Projects Engine

Obsidian.md plugin for Project Portfolio, Governance, and Delivery Management in Markdown.

---

## Italiano

### Panoramica e valore

**Projects Engine** è un plugin Obsidian per gestire portafoglio, governance e delivery di progetto **direttamente nel vault**, senza database esterni. Ogni cliente, persona, tipo di progetto, tecnologia, commessa e task è una nota Markdown (pattern **Entity-as-a-Note**). I collegamenti sono wikilink nativi `[[Nota]]`: Graph View raggruppa i progetti per cliente, stack tecnologico e team.

Il wizard di creazione (desktop e mobile) raccoglie ID, nome, modello di governance, cliente, tipo, tecnologie, team, commesse, giorni assegnati, URL di progetto e canale Microsoft Teams. Il motore di scheduling tratta i task come un DAG: rileva i cicli e ricalcola in cascata le date quando un predecessore slitta, conservando la durata.

### Architettura delle entità e Graph View

| Entità | Frontmatter `pe_type` | Cartella predefinita |
| --- | --- | --- |
| Project | `project` | `Projects/` |
| Customer | `customer` | `Entities/Customers/` |
| Team Member | `team-member` | `Entities/Team Members/` |
| Project Type | `project-type` | `Entities/Project Types/` |
| Technology | `technology` | `Entities/Technologies/` |
| Task | `task` | `Projects/Tasks/` |

Nel YAML del progetto i riferimenti sono **wikilink tra virgolette** (`"[[Acme Corp]]"`). Il corpo della nota ripete gli stessi link in una sezione **Links**, così Graph View genera cluster anche quando l’indicizzazione delle proprietà YAML è limitata. Non servono plugin di terze parti per il grafo.

### Guida alla governance

**Semplificato** — flusso operativo lineare: Backlog → In Progress → Review → Done. Adatto a delivery snella: time log, giorni effettivi vs budget, viste a tabella (su schermi stretti diventano card/accordion).

**PRINCE2** — organizzazione per Management Stage con Stage Boundary. Il progetto nasce con modelli per Business Case, Risk Register, Issue & Change Log, Quality Register e Work Package. I milestone di fine stage sono **blocchi formali** nello scheduler: il lavoro dello stage successivo non parte finché il boundary non è chiuso.

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

Campi task rilevanti per lo scheduler: `blocked_by`, `blocking`, date di inizio/fine, `duration` in giorni calendario, `time_logs: [{ date, duration, member, note }]`.

Campi personalizzati (Settings): schemi su Customer, Team Member, Project Type e Project Technology. Tipi: text, number, date, select, multi-select, person, checkbox, url.

### Installazione manuale e build locale

Requisiti: Node.js 18+, Obsidian 1.5.0+ (desktop o mobile). `isDesktopOnly` è `false`.

**Installazione da release**

1. Scaricare `main.js`, `manifest.json` e `styles.css` dalla release GitHub.
2. Copiarli in `Vault/.obsidian/plugins/projects-engine/`.
3. Abilitare **Projects Engine** in Impostazioni → Community plugins.

**Build locale**

```bash
npm install
npm run build
```

In sviluppo (`npm run dev`) il bundle è ricalcolato a ogni modifica. Copiare `main.js`, `manifest.json` e `styles.css` nella cartella plugin del vault, oppure clonare il repo direttamente lì.

Comandi Obsidian:

- **Create project** — apre il wizard (ribbon valigetta).
- **Open Teams channel for current project** — avvia `teams_channel_url`.
- Undo/Redo delle mutazioni di schedule in memoria (Command Pattern).

---

## English

### Overview and value

**Projects Engine** is an Obsidian plugin for project portfolio, governance, and delivery **inside the vault** — no external database. Every customer, person, project type, technology, work order, and task is a Markdown note (**Entity-as-a-Note**). Relationships are native `[[wikilinks]]`, so Graph View clusters work by customer, technology stack, and team.

The creation wizard (desktop and mobile) captures ID, name, governance model, customer, type, technologies, team, work orders (commesse), assigned days, project URL, and a Microsoft Teams channel. The scheduling engine models tasks as a DAG: it detects cycles and cascades date changes when a blocker slips, preserving duration.

### Entity architecture and Graph View

| Entity | Frontmatter `pe_type` | Default folder |
| --- | --- | --- |
| Project | `project` | `Projects/` |
| Customer | `customer` | `Entities/Customers/` |
| Team Member | `team-member` | `Entities/Team Members/` |
| Project Type | `project-type` | `Entities/Project Types/` |
| Technology | `technology` | `Entities/Technologies/` |
| Task | `task` | `Projects/Tasks/` |

Project YAML stores **quoted wikilinks** (`"[[Acme Corp]]"`). The note body repeats those links in a **Links** section so Graph View still clusters entities when YAML property indexing is limited. No third-party graph plugin is required.

### Governance guide

**Semplificato** — linear operational flow: Backlog → In Progress → Review → Done. Aimed at lean delivery: time logs, actual days vs budget, table views that fall back to cards/accordions on small screens.

**PRINCE2** — management stages with stage boundaries. New projects include templates for Business Case, Risk Register, Issue & Change Log, Quality Register, and Work Packages. End-of-stage milestones are **formal scheduler blocks**: later-stage work cannot start until the boundary task finishes.

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

Scheduler-relevant task fields: `blocked_by`, `blocking`, start/end dates, calendar-day `duration`, and `time_logs: [{ date, duration, member, note }]`.

Custom fields (Settings): schemas for Customer, Team Member, Project Type, and Project Technology. Types: text, number, date, select, multi-select, person, checkbox, url.

### Manual install and local build

Requirements: Node.js 18+, Obsidian 1.5.0+ (desktop or mobile). `isDesktopOnly` is `false`.

**Install from a release**

1. Download `main.js`, `manifest.json`, and `styles.css` from the GitHub release.
2. Copy them to `Vault/.obsidian/plugins/projects-engine/`.
3. Enable **Projects Engine** in Settings → Community plugins.

**Local build**

```bash
npm install
npm run build
```

During development (`npm run dev`) the bundle rebuilds on change. Copy `main.js`, `manifest.json`, and `styles.css` into the vault plugin folder, or clone this repository there.

Obsidian commands:

- **Create project** — opens the wizard (briefcase ribbon icon).
- **Open Teams channel for current project** — launches `teams_channel_url`.
- Undo/Redo for in-memory schedule mutations (Command Pattern).
