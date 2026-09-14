# Release notes — Projects Engine 1.0.0

## Italiano

### Funzionalità

- Wizard di creazione progetto (modale touch-friendly): ID automatico da pattern/contatore (`PRJ-YYYY-###`), nome, governance Semplificato o PRINCE2, autocomplete fuzzy su note Cliente e Tipo, multi-select Tecnologie, Team (ruolo opzionale) e **Stakeholder** (progetto, cliente, o entrambi), chip per più commesse, giorni assegnati, URL di progetto, `teams_channel_url` con pulsante di avvio rapido.
- Persistenza Entity-as-a-Note: YAML con wikilink `[[Nota]]`, sezione Links nel corpo per Graph View.
- **CRUD entità** (Customer, Team Member, Project Type, Technology, Stakeholder) con form touch-friendly e sync wikilink bidirezionale (Stakeholder ↔ Customer / Project).
- **Campi personalizzati:** schema in Settings e rendering dinamico sui form entità; valori persistiti in `custom_fields`.
- **Gestione task:** sotto-task ricorsivi, dipendenze `blocked_by` / `blocking` (anche cross-project) con cycle detection, time log `{ date, duration, member, note }`, estimate vs actual / remaining mandays.
- Motore di scheduling DAG: topological sort, auto-schedule e cascade (durata conservata). I milestone di fine stage PRINCE2 sono blocchi formali.
- **Undo/Redo** (Command Pattern) collegato a date di schedule, dipendenze e spostamenti di status sulla board; scritture via `vault.process`.
- **Governance Semplificato:** flusso lineare Backlog → In Progress → Review → Done con board lean e tracking giorni.
- **Governance PRINCE2:** note registro (Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages), Management Stage / Stage Boundary con task milestone `is_stage_boundary`.
- **Vista portafoglio:** tabella progetti con fallback card/accordion (<720px), Kanban Semplificato, azioni PRINCE2 e shortcut CRUD.

### Architettura e prestazioni (mobile-first)

- `isDesktopOnly: false` — stesso codice su desktop, iOS e Android.
- Scritture atomiche solo con `vault.process` per evitare race con Obsidian Sync e iCloud.
- Indicizzatore in memoria debounce-ato (default 250 ms) per non saturare il thread UI.
- Bundle browser (`platform: "browser"`): vietati i builtin Node (`fs`, `path`, `crypto`, …); il build fallisce se vengono importati.
- UI: target touch minimi 44×44 px, modale a pieno schermo sotto i 720 px, tabelle dense con fallback a card/accordion.

### Vincoli noti

- Lo scheduling usa **giorni calendario UTC**, non un calendario lavorativo/festività.
- Undo/Redo è limitato in profondità (stack in memoria, default 50 comandi); non è uno storico illimitato delle note.
- I campi personalizzati del catalogo valgono sulle cinque entità Settings; la nota progetto non espone ancora uno schema custom dedicato oltre i campi nativi.
- `vault.process` richiede un file esistente: la creazione passa da `vault.create` vuoto e poi `process` per il contenuto.
- Spostamenti Kanban e cascade date usano comandi che avviano scritture asincrone: attendere il refresh della vista dopo Undo/Redo rapidi.
- Non include Gantt interattivo né drag-and-drop nativo Obsidian (i limiti API della vista ItemView non espongono DnD cross-column; lo spostamento status avviene tramite pulsanti ≥44×44 px).
- Compatibilità dichiarata da Obsidian 1.5.0.

---

## English

### Features

- Project creation wizard (touch-friendly modal): auto ID from a settings pattern/counter (`PRJ-YYYY-###`), name, Semplificato or PRINCE2 governance, fuzzy autocomplete on Customer and Project Type notes, multi-select Technologies, Team (optional per-project role), and **Stakeholders** (project, customer, or both), chip input for multiple work orders, assigned days, project URL, and `teams_channel_url` with a quick-launch button.
- Entity-as-a-Note persistence: YAML stores `[[wikilinks]]`, a Links section in the body feeds Graph View.
- **Entity CRUD** (Customer, Team Member, Project Type, Technology, Stakeholder) with touch-friendly forms and bidirectional wikilink sync (Stakeholder ↔ Customer / Project).
- **Custom fields:** schemas in Settings and dynamic rendering on entity forms; values persisted under `custom_fields`.
- **Task management:** recursively nested subtasks, intra- and cross-project `blocked_by` / `blocking` with cycle detection, time logs `{ date, duration, member, note }`, estimate vs actual / remaining mandays.
- DAG scheduler: topological sort, auto-schedule and cascade (duration preserved). PRINCE2 end-of-stage milestones are formal blocks.
- **Undo/Redo** (Command Pattern) wired to schedule dates, dependencies, and board status moves; writes go through `vault.process`.
- **Semplificato governance:** linear Backlog → In Progress → Review → Done with a lean board and day tracking.
- **PRINCE2 governance:** register notes (Business Case, Risk Register, Issue & Change Log, Quality Register, Work Packages), Management Stages / Stage Boundaries with `is_stage_boundary` milestone tasks.
- **Portfolio view:** project table with card/accordion fallback (<720px), Semplificato Kanban, PRINCE2 actions, and entity CRUD shortcuts.

### Architecture & Performance (Mobile-first)

- `isDesktopOnly: false` — one codebase for desktop, iOS, and Android.
- Atomic writes go only through `vault.process` to avoid races with Obsidian Sync and iCloud.
- Debounced in-memory indexer (default 250 ms) so vault storms do not saturate the UI thread.
- Browser bundle (`platform: "browser"`): Node builtins (`fs`, `path`, `crypto`, …) are banned; the build fails if they are imported.
- UI: 44×44 px minimum touch targets, full-viewport modal below 720 px, dense tables falling back to card/accordion layout.

### Known Constraints

- Scheduling uses **UTC calendar days**, not a working-day / holiday calendar.
- Undo/Redo is depth-limited (in-memory stack, default 50 commands); it is not an unbounded note history.
- Catalogue custom fields apply to the five Settings entity kinds; the project note does not yet expose a dedicated custom schema beyond native fields.
- `vault.process` requires an existing file: create uses an empty `vault.create` followed by `process` for content.
- Kanban moves and date cascades start asynchronous writes: wait for the view refresh after rapid Undo/Redo.
- No interactive Gantt and no native Obsidian cross-column drag-and-drop (ItemView API limits); status moves use ≥44×44 px buttons.
- Declared compatibility is Obsidian 1.5.0+.
