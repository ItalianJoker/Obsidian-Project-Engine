# Release notes — Projects Engine 1.0.0

## Italiano

### Funzionalità

- Wizard di creazione progetto (modale touch-friendly): ID automatico da pattern/contatore (`PRJ-YYYY-###`), nome, governance Semplificato o PRINCE2, autocomplete fuzzy su note Cliente e Tipo, multi-select Tecnologie e Team (ruolo opzionale), chip per più commesse, giorni assegnati, URL di progetto, `teams_channel_url` con pulsante di avvio rapido.
- Persistenza Entity-as-a-Note: YAML con wikilink `[[Nota]]`, sezione Links nel corpo per Graph View, modelli Semplificato / registri PRINCE2 nella nota.
- Motore di scheduling DAG: topological sort, rilevamento cicli con notifica, auto-schedule e cascade se un task bloccante slitta (durata conservata). I milestone di fine stage PRINCE2 sono blocchi formali.
- Time log tipizzati `{ date, duration, member, note }` e stack Undo/Redo (Command Pattern).
- Settings: pattern/contatore ID, cartelle entità, debounce indicizzatore, ore per manday, schemi di campi personalizzati (text, number, date, select, multi-select, person, checkbox, url) su quattro entità.

### Architettura e prestazioni (mobile-first)

- `isDesktopOnly: false` — stesso codice su desktop, iOS e Android.
- Scritture atomiche solo con `vault.process` per evitare race con Obsidian Sync e iCloud.
- Indicizzatore in memoria debounce-ato (default 250 ms) per non saturare il thread UI.
- Bundle browser (`platform: "browser"`): vietati i builtin Node (`fs`, `path`, `crypto`, …); il build fallisce se vengono importati.
- UI: target touch minimi 44×44 px, modale a pieno schermo sotto i 720 px, tabelle dense con fallback a card/accordion.

### Vincoli noti

- Foundation v1.0.0: tipi, scheduler, wizard, settings e scaffolding plugin. Non include ancora Gantt, board Kanban persistente, vista portafoglio completa né editor task ricorsivo in UI.
- Lo scheduling usa **giorni calendario UTC**, non un calendario lavorativo/festività.
- Undo/Redo copre le mutazioni di schedule in memoria; non è uno storico illimitato delle note.
- I campi personalizzati sono configurabili in Settings; il wizard progetto non li renderizza tutti dinamicamente sulla nota progetto (valgono per le quattro entità catalogo).
- `vault.process` richiede un file esistente: la creazione passa da `vault.create` vuoto e poi `process` per il contenuto.
- Compatibilità dichiarata da Obsidian 1.5.0.

---

## English

### Features

- Project creation wizard (touch-friendly modal): auto ID from a settings pattern/counter (`PRJ-YYYY-###`), name, Semplificato or PRINCE2 governance, fuzzy autocomplete on Customer and Project Type notes, multi-select Technologies and Team (optional per-project role), chip input for multiple work orders, assigned days, project URL, and `teams_channel_url` with a quick-launch button.
- Entity-as-a-Note persistence: YAML stores `[[wikilinks]]`, a Links section in the body feeds Graph View, and new notes include Semplificato or PRINCE2 register templates.
- DAG scheduler: topological sort, cycle detection with user notification, auto-schedule and cascade when a blocking task slips (duration preserved). PRINCE2 end-of-stage milestones are formal blocks.
- Typed time logs `{ date, duration, member, note }` and an Undo/Redo stack (Command Pattern).
- Settings: ID pattern/counter, entity folders, indexer debounce, hours per manday, and custom-field schemas (text, number, date, select, multi-select, person, checkbox, url) on four entity kinds.

### Architecture & Performance (Mobile-first)

- `isDesktopOnly: false` — one codebase for desktop, iOS, and Android.
- Atomic writes go only through `vault.process` to avoid races with Obsidian Sync and iCloud.
- Debounced in-memory indexer (default 250 ms) so vault storms do not saturate the UI thread.
- Browser bundle (`platform: "browser"`): Node builtins (`fs`, `path`, `crypto`, …) are banned; the build fails if they are imported.
- UI: 44×44 px minimum touch targets, full-viewport modal below 720 px, dense tables falling back to card/accordion layout.

### Known Constraints

- v1.0.0 is a foundation: types, scheduler, wizard, settings, and plugin scaffolding. It does not yet ship a Gantt, a persistent Kanban board, a full portfolio view, or a recursive task editor UI.
- Scheduling uses **UTC calendar days**, not a working-day / holiday calendar.
- Undo/Redo covers in-memory schedule mutations; it is not an unbounded note history.
- Custom fields are configurable in Settings; the project wizard does not yet render every catalogue custom field onto the project note itself (they apply to the four catalogue entities).
- `vault.process` requires an existing file: create uses an empty `vault.create` followed by `process` for content.
- Declared compatibility is Obsidian 1.5.0+.
