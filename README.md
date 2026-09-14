# Projects Engine

Obsidian.md plugin for Project Portfolio, Governance, and Delivery Management in Markdown.

---

## Italiano

### Panoramica e valore

**Projects Engine** è un plugin Obsidian per gestire portafoglio, governance e delivery di progetto **direttamente nel vault**, senza database esterni. Ogni cliente, persona, stakeholder, tipo di progetto, tecnologia, commessa e task è una nota Markdown (pattern **Entity-as-a-Note**). I collegamenti sono wikilink nativi `[[Nota]]`: Graph View raggruppa i progetti per cliente, stack tecnologico, team e stakeholder.

Il wizard di creazione (desktop e mobile) raccoglie ID, nome, modello di governance, cliente, tipo, tecnologie, team, **stakeholder** (collegabili al progetto, al cliente, o a entrambi), commesse, giorni assegnati, URL di progetto e canale Microsoft Teams. Il motore di scheduling tratta i task come un DAG: rileva i cicli e ricalcola in cascata le date quando un predecessore slitta, conservando la durata.

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

Nel YAML del progetto i riferimenti sono **wikilink tra virgolette** (`"[[Acme Corp]]"`). Uno **Stakeholder** può puntare a un Customer (`customer`) e essere referenziato da uno o più Project (`stakeholders`); l’associazione vale a livello progetto, cliente, o entrambi (wikilink nei due sensi). Il corpo della nota ripete i link in una sezione **Links**, così Graph View genera cluster anche quando l’indicizzazione delle proprietà YAML è limitata. Non servono plugin di terze parti per il grafo.

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

Esempio di nota Stakeholder (collegata al cliente e a un progetto):

```yaml
---
pe_type: stakeholder
name: CIO Acme
customer: "[[Acme Corp]]"
projects:
  - "[[PRJ-2026-001 Migrazione Cloud Alpha]]"
---
```

Campi task rilevanti per lo scheduler: `blocked_by`, `blocking`, date di inizio/fine, `duration` in giorni calendario, `time_logs: [{ date, duration, member, note }]`.

Campi personalizzati (Settings): schemi su Customer, Team Member, Project Type, Project Technology e **Stakeholder**. Tipi: text, number, date, select, multi-select, person, checkbox, url.

### Come installare il plugin in Obsidian

Requisiti: Obsidian 1.5.0 o successiva (desktop e mobile). Il plugin **non** è desktop-only (`isDesktopOnly: false` in `manifest.json`). Per la build da sorgente serve Node.js 18+.

Id plugin: `projects-engine`. Nome visualizzato: **Projects Engine**. Versione: `1.0.0`.

#### 1. Installazione utente (copia dei file)

1. Crea la cartella del plugin nel vault (se non esiste):
   `<vault>/.obsidian/plugins/projects-engine/`
2. Copia in quella cartella questi tre file:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   (da una [release GitHub](https://github.com/ItalianJoker/Obsidian-Project-Engine/releases) oppure dalla build locale descritta sotto).
3. **Ricarica Obsidian** (comando “Reload app without saving”, oppure chiudi e riapri l’app).
4. Apri **Impostazioni → Community plugins**. Se i plugin della community sono disattivati (Restricted mode / modalità sicura), attivali.
5. Abilita **Projects Engine** nell’elenco dei plugin installati.

#### 2. Installazione con BRAT (beta da GitHub)

Finché il plugin non è nel catalogo ufficiale Community plugins, [BRAT](https://github.com/TfTHacker/obsidian42-brat) può installarlo dal repository:

1. Installa e abilita **BRAT** da Impostazioni → Community plugins → Sfoglia.
2. In BRAT scegli **Add beta plugin**, poi inserisci:
   `ItalianJoker/Obsidian-Project-Engine`
3. Abilita **Projects Engine** in Impostazioni → Community plugins.
4. Ricarica Obsidian se il plugin non compare subito.

#### 3. Installazione da codice sorgente (sviluppatori)

Stesso passo di copia della sezione 1, dopo una build di produzione:

```bash
git clone https://github.com/ItalianJoker/Obsidian-Project-Engine.git
cd Obsidian-Project-Engine
npm install
npm run build
```

`npm run build` esegue il typecheck TypeScript e genera `main.js`. Copia quindi `main.js`, `manifest.json` e `styles.css` in:

`<vault>/.obsidian/plugins/projects-engine/`

Poi ricarica Obsidian e abilita il plugin come nella sezione 1. In sviluppo, `npm run dev` rigenera il bundle a ogni modifica.

#### 4. Mobile (iOS / Android)

Dopo la sincronizzazione del vault (Obsidian Sync, iCloud, o altro), apri l’app Obsidian sul telefono o tablet. I tre file del plugin devono essere presenti in `.obsidian/plugins/projects-engine/`. **Abilita Projects Engine anche nell’app mobile** (Impostazioni → Community plugins): su iOS/Android i plugin non si attivano da soli solo perché lo sono sul desktop.

### Funzionalità operative (oltre la foundation)

- **Campi personalizzati:** rendering dinamico (text, number, date, select, multi-select, person, checkbox, url) nei form di creazione/modifica entità; valori in `custom_fields` nel frontmatter.
- **Task:** sotto-task annidati a profondità arbitraria, dipendenze `blocked_by` / `blocking` (intra e cross-project) con rilevamento cicli, time log, estimate vs actual / remaining mandays, Undo/Redo collegato allo stack Command Pattern (persistenza via `vault.process`).
- **Governance:** board Semplificato (Backlog → In Progress → Review → Done); per PRINCE2 note registro (Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages) e Management Stage con milestone di Stage Boundary.
- **Portafoglio:** vista workspace tabellare con fallback card/accordion su schermi stretti; Kanban lean per Semplificato; CRUD entità (Customer, Team Member, Project Type, Technology, Stakeholder) con wikilink bidirezionali.
- **Gantt interattivo:** timeline a barre con zoom Day/Week/Month, hint di dipendenza SVG, filtri per progetto; apribile da ribbon, comando e toolbar Portafoglio.
- **Kanban DnD:** trascinamento HTML5 (desktop) e pointer-capture (touch) tra colonne Semplificato; pulsanti status come fallback mobile; persistenza via `vault.process` + Undo.

### Comandi

- **Open portfolio view** — vista portafoglio / board (icona valigetta nella ribbon).
- **Open Gantt timeline** — timeline Gantt (icona calendario nella ribbon).
- **Create project** — apre il wizard.
- **Create task for active project** — editor task sulla nota progetto/task attiva.
- **Create customer / team member / project type / technology / stakeholder** — CRUD Entity-as-a-Note.
- **Edit active entity note** — modifica l’entità aperta.
- **Open Teams channel for current project** — avvia `teams_channel_url`.
- **Undo / Redo last schedule change** — stack Command Pattern (date, dipendenze, status board).

---

## English

### Overview and value

**Projects Engine** is an Obsidian plugin for project portfolio, governance, and delivery **inside the vault** — no external database. Every customer, person, stakeholder, project type, technology, work order, and task is a Markdown note (**Entity-as-a-Note**). Relationships are native `[[wikilinks]]`, so Graph View clusters work by customer, technology stack, team, and stakeholder.

The creation wizard (desktop and mobile) captures ID, name, governance model, customer, type, technologies, team, **stakeholders** (linkable to the project, to a customer, or to both), work orders (commesse), assigned days, project URL, and a Microsoft Teams channel. The scheduling engine models tasks as a DAG: it detects cycles and cascades date changes when a blocker slips, preserving duration.

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

Project YAML stores **quoted wikilinks** (`"[[Acme Corp]]"`). A **Stakeholder** note may wikilink a Customer (`customer`) and be referenced from one or more Projects (`stakeholders`); association is valid at project level, customer level, or both (wikilinks both ways). The note body repeats those links in a **Links** section so Graph View still clusters entities when YAML property indexing is limited. No third-party graph plugin is required.

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

Example Stakeholder note (linked to a customer and a project):

```yaml
---
pe_type: stakeholder
name: CIO Acme
customer: "[[Acme Corp]]"
projects:
  - "[[PRJ-2026-001 Cloud Migration Alpha]]"
---
```

Scheduler-relevant task fields: `blocked_by`, `blocking`, start/end dates, calendar-day `duration`, and `time_logs: [{ date, duration, member, note }]`.

Custom fields (Settings): schemas for Customer, Team Member, Project Type, Project Technology, and **Stakeholder**. Types: text, number, date, select, multi-select, person, checkbox, url.

### How to install the plugin in Obsidian

Requirements: Obsidian 1.5.0 or later (desktop and mobile). The plugin is **not** desktop-only (`isDesktopOnly: false` in `manifest.json`). A from-source build needs Node.js 18+.

Plugin id: `projects-engine`. Display name: **Projects Engine**. Version: `1.0.0`.

#### 1. End-user install (copy the plugin files)

1. Create the plugin folder in your vault (if it does not exist):
   `<vault>/.obsidian/plugins/projects-engine/`
2. Copy these three files into that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   (from a [GitHub release](https://github.com/ItalianJoker/Obsidian-Project-Engine/releases) or from the local production build below).
3. **Reload Obsidian** (command “Reload app without saving”, or quit and reopen the app).
4. Open **Settings → Community plugins**. If Community plugins are off (Restricted mode), turn them on.
5. Enable **Projects Engine** in the installed-plugin list.

#### 2. Install with BRAT (beta from GitHub)

Until the plugin is listed in the official Community plugins catalogue, [BRAT](https://github.com/TfTHacker/obsidian42-brat) can install it from this repository:

1. Install and enable **BRAT** from Settings → Community plugins → Browse.
2. In BRAT choose **Add beta plugin** and enter:
   `ItalianJoker/Obsidian-Project-Engine`
3. Enable **Projects Engine** in Settings → Community plugins.
4. Reload Obsidian if the plugin does not appear immediately.

#### 3. Install from source (developers)

Same copy step as section 1, after a production build:

```bash
git clone https://github.com/ItalianJoker/Obsidian-Project-Engine.git
cd Obsidian-Project-Engine
npm install
npm run build
```

`npm run build` typechecks TypeScript and emits `main.js`. Then copy `main.js`, `manifest.json`, and `styles.css` into:

`<vault>/.obsidian/plugins/projects-engine/`

Reload Obsidian and enable the plugin as in section 1. For development, `npm run dev` rebuilds the bundle on change.

#### 4. Mobile (iOS / Android)

After the vault syncs (Obsidian Sync, iCloud, or other), open the Obsidian app on the phone or tablet. The three plugin files must be present under `.obsidian/plugins/projects-engine/`. **Enable Projects Engine on the mobile app as well** (Settings → Community plugins): iOS/Android does not inherit the desktop enabled-plugin list automatically.

### Operational features (beyond the foundation)

- **Custom fields:** dynamic rendering (text, number, date, select, multi-select, person, checkbox, url) on entity create/edit forms; values stored under YAML `custom_fields`.
- **Tasks:** recursively nested subtasks, intra- and cross-project `blocked_by` / `blocking` with cycle detection, time logs, estimate vs actual / remaining mandays, Undo/Redo wired to the Command Pattern stack (persisted via `vault.process`).
- **Governance:** Semplificato status board (Backlog → In Progress → Review → Done); PRINCE2 register notes (Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages) plus Management Stages with Stage Boundary milestones.
- **Portfolio:** workspace tabular listing with card/accordion fallback on small screens; lean Kanban for Semplificato; entity CRUD (Customer, Team Member, Project Type, Technology, Stakeholder) with bidirectional wikilinks.
- **Interactive Gantt:** bar timeline with Day/Week/Month zoom, SVG dependency hints, per-project filter; open from ribbon, command, or Portfolio toolbar.
- **Kanban DnD:** HTML5 drag (desktop) and pointer-capture drag (touch) across Semplificato columns; status buttons as mobile fallback; persistence via `vault.process` + Undo.

### Commands

- **Open portfolio view** — portfolio / board leaf (briefcase ribbon icon).
- **Open Gantt timeline** — Gantt leaf (calendar ribbon icon).
- **Create project** — opens the wizard.
- **Create task for active project** — task editor for the active project/task note.
- **Create customer / team member / project type / technology / stakeholder** — Entity-as-a-Note CRUD.
- **Edit active entity note** — edit the open entity.
- **Open Teams channel for current project** — launches `teams_channel_url`.
- **Undo / Redo last schedule change** — Command Pattern stack (dates, dependencies, board status).
