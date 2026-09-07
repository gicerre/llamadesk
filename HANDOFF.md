# HANDOFF — LlamaDesk

> Documento di ripresa lavori. Aggiornato al **7 settembre 2026**, fine Fase 3.
> Chi riprende (persona o assistente) dovrebbe leggere **solo questo file** per
> rimettersi in pari, e poi `docs/ARCHITECTURE.md` e `docs/DATA_MODEL.md` per i
> dettagli.

---

## 1. Stato in tre righe

Applicazione desktop Windows (Tauri 2 + React 19), local-first, zero telemetria.
Fasi 1, 2 e 3 completate: architettura, dati, Danger Zone, navigator, ricerca,
note, tag, backup, quick workspace, sfondi, cattura rapida. **Il codice Rust non
è mai stato compilato** (vedi § 3): è l'unica cosa che manca per vedere l'app girare.

| | |
|---|---|
| Versione | `0.1.0` (mai rilasciata) |
| File sorgente | 107 (32 moduli Rust) |
| Comandi Tauri registrati | 58 |
| Test | 51 Rust (mai eseguiti) + 16 frontend (verdi) |
| Repository git | **non ancora inizializzato** |

---

## 2. Come riprendere

```powershell
cd C:\Users\gcerr\Desktop\Personale\personal_projects\LlamaDesk

# 1. Prerequisiti mancanti sulla macchina (una volta sola)
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
# riavviare il terminale

# 2. Verifica che tutto regga
npm install
npm run lint ; npm run typecheck ; npm run test
cd src-tauri ; cargo test ; cd ..

# 3. Avvio
npm run dev          # app completa (Tauri + Vite)
npm run dev:vite     # solo UI nel browser, il layer IPC ricade su mock
```

Node 20.19.4 e npm 10.8.2 sono già presenti e funzionanti.

---

## 3. ⚠️ Il rischio numero uno

**Rust non è installato su questa macchina**, quindi nessuna riga di backend è
mai stata compilata. Il primo `cargo build` produrrà molto probabilmente errori
di tipo o di borrow checker. Non è un problema di progettazione: è lavoro di
rifinitura che va fatto con il compilatore davanti.

Cosa è stato fatto per contenere il rischio:

- **`npm run check:sql`** estrae ogni stringa SQL dai sorgenti `.rs`, applica lo
  schema vero su SQLite in memoria e prova a preparare ogni query: **156 query,
  tutte valide**. Gli errori SQL — la classe di bug più probabile e più
  fastidiosa da scoprire a runtime — sono già esclusi. Gira in CI senza toolchain Rust.
- Lo schema è stato eseguito davvero (cascade delete, CHECK, CTE ricorsive verificate).
- La logica pura del frontend ha i suoi test.

**Primo compito della prossima sessione**: installare Rust, lanciare
`cargo test`, sistemare quello che esce. Poi `npm run dev`.

Punti dove mi aspetto attrito, in ordine di probabilità:

1. `src-tauri/src/shortcuts.rs` — confronto `Shortcut` nel registro; se
   `Shortcut` non implementa `PartialEq`, confrontare `.id()`.
2. `src-tauri/src/tray.rs` — `show_menu_on_left_click` è stato rinominato fra le
   minor di Tauri 2; se non compila, usare `menu_on_left_click`.
3. `src-tauri/src/services/backup.rs` — la closure `id_of` è `FnMut` e viene
   chiamata più volte dentro la stessa `params![]`; se il borrow checker
   protesta, estrarre gli id in variabili locali prima della macro.
4. Versioni dei crate: `rusqlite 0.32` è certa; i `tauri-plugin-*` sono a `"2"`.

---

## 4. Che cosa esiste già

### Fase 1 — fondamenta
Config (Vite 8 / TS 6 / Tailwind 4 / React 19), design system CSS con
`.glass-panel` e squircle, motion system a tre molle, UI kit (Button, GlassPanel,
Input, SearchInput, Switch, Badge, Modal con focus trap, EmptyState, Spinner,
PromptDialog), i18n EN/IT con test che fallisce se le lingue divergono, logo SVG
generato proceduralmente (superellisse n=4.5) + set icone Windows, migratore
transazionale con backup pre-migrazione, seed del primo avvio, tray, chiusura
nella tray, onboarding animato.

### Fase 2 — il cuore
Repository (containers/items/search/usage), CRUD completo della gerarchia,
ordinamento frazionario per il drag & drop, duplicazione ricorsiva di
sottoalberi in transazione, **motore Danger Zone** (9 test), navigator ad
albero, breadcrumb con *climate shift*, ApplicationCard con dnd-kit,
Command Palette collegata alla ricerca reale con frecency, Environment Switcher,
health check dei link dormienti.

### Fase 3 — il contorno che serve
Backup/restore JSON (10 test), Quick Workspaces trasversali con scadenza,
note e tag polimorfici con pulizia degli orfani, sfondi (gradienti inclusi +
immagini importate e copiate in AppData), impostazioni a 6 tab con registratore
di scorciatoie ed editor dei prompt, **cattura rapida** da appunti su
`Ctrl+Shift+L`.

---

## 5. Decisioni già prese — non rimetterle in discussione a freddo

Ognuna ha una ragione precisa. Cambiarle si può, ma sapendo cosa si perde.

| Decisione | Perché |
|---|---|
| **Una sola tabella `containers`** per project/workspace/environment/context/group | Riordino, spostamento, duplicazione, breadcrumb ed ereditarietà diventano **un** algoritmo invece di cinque. Le regole di annidamento stanno in `allowed_child_kinds`: dati, non schema. |
| **`danger_level NULL` = eredita**, vince l'override più vicino alla foglia | È ciò che permette a un singolo link di sfilarsi dalla protezione del suo ambiente, o di aggiungerne una dove non c'era. Testato in entrambe le direzioni. |
| **Il frontend non scrive mai SQL** | La logica critica sta in Rust dove `cargo test` la raggiunge. `open_url` (URL arbitrario) è stato **rimosso**: era un bypass della Danger Zone. |
| **`open_link` rifiuta senza conferma** | La protezione non è una decorazione del frontend. |
| **Sentinella `"inherit"`** invece di `Option<Option<T>>` | JSON non distingue "campo assente" da "campo null" attraverso serde: senza sentinella non si potrebbe più togliere un override. |
| **Niente FTS5**, ricerca `LIKE` + punteggio in Rust | Centinaia di link, non milioni: scansione sotto il millisecondo e nessun indice da mantenere sincronizzato. Punto di innesto se servirà: `db/repo/search.rs`. |
| **`sort_order` è un REAL** | Uno spostamento = una UPDATE, con ribilanciamento automatico. |
| **Wallpaper interno = motore del glassmorphism** | Su Windows/WebView2 `backdrop-filter` **non** può sfocare il desktop dietro la finestra. Senza questo strato i pannelli in vetro sarebbero grigi e piatti. |
| **Modalità import come stringa** `merge`/`replace` | Un booleano sarebbe stato ambiguo su un'operazione distruttiva. |

## 6. Vincoli non negoziabili

Sono la ragione per cui il progetto esiste. Valgono anche per chi riprende.

1. **Nessuna chiamata di rete.** Mai. Nessun client HTTP in `Cargo.toml` — c'è un
   job CI (`privacy-guard`) che fa fallire la build se ne compare uno.
2. **Nessuna telemetria**, analitica o crash reporting.
3. **Nessun dato hardcoded.** L'app nasce vuota.
4. **Nessuna integrazione esterna per i calendari.** Un calendario è un URL.
5. **I dati stanno in `%APPDATA%`**, mai nella cartella di installazione.
6. **Gli appunti si leggono solo su richiesta esplicita** dell'utente (scorciatoia).

---

## 7. Da fare, in ordine

### Subito (blocca tutto il resto)
- [ ] Installare Rust + MSVC Build Tools
- [ ] `cargo test` → sistemare gli errori di compilazione
- [ ] `npm run dev` → primo avvio reale, verificare: onboarding, creazione
      progetto → ambiente → applicazione → link, apertura con conferma critical,
      Ctrl+Space, Ctrl+Shift+L, tray, chiusura nella tray
- [ ] `git init` + primo commit (il `.gitignore` è già pronto)

### Fase 4 proposta
- [ ] **Profili come contesti di lavoro veri** — ⚠️ *proposta in sospeso, mai
      approvata*: oggi il profilo separa solo i dati; potrebbe portarsi dietro
      sfondo, scorciatoia e lingua, così passare da "Lavoro" a "Personale"
      cambia visibilmente il clima dell'app. Va deciso.
- [ ] Lo **switcher di profilo in sidebar è decorativo**: il pulsante c'è ma non
      apre nulla. Serve il menu per creare/rinominare/cambiare profilo.
- [ ] Drag & drop dell'**albero** (oggi funziona solo sulle applicazioni dentro
      un contenitore; `move_container` lato Rust esiste già ed è pronto)
- [ ] Dashboard con **widget riordinabili** e configurabili (la tabella
      `dashboard_widgets` esiste ed è popolata dal seed, ma la UI ignora ancora
      la configurazione)
- [ ] Conferma di **cancellazione con impatto**: `container_delete_impact`
      esiste e restituisce i numeri veri, ma la UI cancella senza chiedere
- [ ] `ts-rs` per generare i tipi TS dalle struct Rust ed eliminare il drift
- [ ] Screenshot nel README (`docs/screenshots/` è vuota)
- [ ] Primo tag `v0.1.0` → la pipeline di release è già scritta e produce
      `.exe` NSIS + `.msi`

### Debiti noti, non urgenti
- La modalità "trasparenza di sistema" (Acrylic nativo) è presente come
  impostazione ma **non ancora implementata** lato Rust.
- `bundles.open_delay_ms` è per-workspace nello schema, ma l'apertura usa
  ancora il ritardo globale delle impostazioni.
- `reorder_bundle_links` esiste lato Rust, ma la UI dei workspace non ha
  ancora il drag & drop.

---

## 8. Comandi di verifica

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript strict
npm run test          # Vitest + validazione delle 156 query SQL
npm run check:sql     # solo la validazione SQL (utile senza toolchain Rust)
npm run icons         # rigenera logo e set di icone
npm run build         # installer .exe e .msi

cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

---

## 9. Dove guardare per capire una cosa

| Domanda | File |
|---|---|
| Come è fatto il database | `src-tauri/src/db/migrations/0001_init.sql` (è la fonte di verità) |
| Perché è fatto così | `docs/DATA_MODEL.md` |
| Come si parlano frontend e backend | `src/lib/ipc.ts` ↔ `src-tauri/src/commands/` |
| Come funziona la protezione della produzione | `src-tauri/src/services/danger.rs` (i test raccontano le regole) |
| Come si anima qualcosa | `src/lib/motion.ts` |
| Regole del vetro e delle forme | `src/styles/index.css` |
| Filosofia e vincoli | `CONTRIBUTING.md` § "Non-negotiable rules" |
