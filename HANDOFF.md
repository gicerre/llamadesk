# HANDOFF — LlamaDesk

> **15 settembre 2026 — riprogettazione 2.0 avviata.** Le decisioni sono in
> [`docs/REDESIGN.md`](docs/REDESIGN.md), che da ora prevale su questo file per
> modello, UX e piano. Lo stato descritto qui sotto è la versione 1, congelata
> nel commit `6f2a01d` con tag `legacy-v1`. Il lavoro nuovo avviene sul branch
> `redesign`. **Fasi 1 (modello dati), 2 (design system e shell), 3
> (contenuti), 4 (azioni e strumenti), 5 (command palette), 6 (protezione), 7
> (brand e apertura) e 8 (personalizzazione e rifinitura) completate**: il piano di
> riprogettazione è chiuso: vedi `docs/REDESIGN.md` § 13. `npm run dev` apre la nuova interfaccia;
> `npm run dev:vite` la mostra nel browser con dati d'esempio (password di blocco
> dell'anteprima: `llama`). Prossimo passo: la checklist manuale `docs/CHECKLIST.md` nell'app installata, poi Snap Layouts.

> Documento di ripresa lavori. Aggiornato all'**11 settembre 2026**, fine
> sessione: Fase 4 quasi completa (vedi § 7).
> Chi riprende (persona o assistente) dovrebbe leggere **solo questo file** per
> rimettersi in pari, e poi `docs/ARCHITECTURE.md` e `docs/DATA_MODEL.md` per i
> dettagli.

---

## 1. Stato in tre righe

Applicazione desktop Windows (Tauri 2 + React 19), local-first, zero telemetria.
Fasi 1, 2 e 3 completate. **L'applicazione compila, i test passano e gira**:
database creato in `%APPDATA%\com.llamadesk.app`, migrazione applicata, seed
eseguito, onboarding superato. Il blocco principale dell'handoff precedente è
risolto.

| | |
|---|---|
| Versione | `0.1.0` (mai rilasciata) |
| File sorgente | 119 (34 moduli Rust) |
| Comandi Tauri registrati | 68 |
| Test | 67 Rust + 25 frontend, **tutti verdi** |
| Repository git | branch `develop`, ultimo commit `fbcd4de`. **Tutto il lavoro dell'8 e dell'11 settembre è ancora nel working tree, non committato**: per scelta dell'utente, non committare senza che lo chieda |

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

## 3. Primo avvio: com'è andata

`cargo check` è passato **al primo colpo, zero errori** e 4 warning (import
inutilizzato, una funzione morta, due costanti doppie): tutti risolti.
`cargo clippy -- -D warnings` e `cargo fmt --check` sono puliti, i 50 test
passano in 0,24 s.

Prova sul database reale: `user_version = 1`, `journal_mode = wal`,
`foreign_keys = 1`, 16 tabelle, 1 profilo "Personale 🦙" con lingua rilevata
dal sistema, 3 prompt built-in, 4 widget, 9 regole di annidamento. La catena
plug & play funziona esattamente come progettata.

### Che cosa ha rivelato l'uso vero

Il primo utilizzo reale ha fatto emergere due problemi che nessun test avrebbe
trovato, entrambi corretti l'8 settembre:

1. **4 applicazioni create, 0 link.** "Aggiungi applicazione" chiedeva solo il
   nome; l'URL si aggiungeva dalla matita in hover, che nessuno trova. Una
   applicazione senza link, cliccata, non faceva niente: l'azione principale
   dell'app era morta. Ora la creazione chiede nome **e primo indirizzo**
   (`ApplicationCreateDialog`), e una card senza link mostra "Aggiungi un link"
   e porta all'editor invece di restare muta.
2. **Ambienti creati in doppio** (due PROD e due TEST sotto lo stesso progetto,
   due vuoti). Ora il dialogo avvisa quando esiste già un fratello con lo stesso
   nome — avviso, non divieto: due "Cliente A" in rami diversi restano legittimi.

Corretto nella stessa sessione anche un difetto latente: la cattura rapida
ritrovava l'applicazione appena creata **cercandola per nome**, e con due
applicazioni omonime avrebbe attaccato il link a quella sbagliata. Ora
`createApplication` restituisce l'entità creata.

E il rischio più serio ora che i dati sono veri: **il cestino cancellava un
intero progetto senza chiedere niente**. `container_delete_impact` esisteva dalla
Fase 2 ma non era collegato; ora la conferma mostra quanti contenitori,
applicazioni e link stanno per sparire.

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

### Fase 4 (quasi completa) — profili, albero, dashboard
Overlay `profile_settings` (migrazione 0002, 6 test): tema, lingua, sfondo,
overlay, ritardo di apertura e soglia dormienti possono variare per profilo,
con ripiego sul valore globale. Selettore di profilo in sidebar (crea,
rinomina, cambia, **elimina** con conferma d'impatto) e selettore di ambito su
ogni impostazione personalizzabile. **Drag & drop dell'albero** della sidebar
(`navigator/NavigatorDnd.tsx` + logica pura in `treeDrop.ts`). **Dashboard a
widget** riordinabili e configurabili (`features/dashboard/`, backend in
`db/repo/widgets.rs` e `commands/dashboard.rs`).

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
| **Impostazioni per profilo come overlay** chiave/valore | Rendere personalizzabile una nuova preferenza è una riga in `PROFILE_SCOPED_KEYS`, non una migrazione. Le scorciatoie globali ne restano fuori per necessità tecnica, non per scelta estetica. |
| **Scrivere un'impostazione segue l'ambito visibile** | Se il profilo attivo sovrascrive una chiave, modificarla aggiorna l'override. Altrimenti cambieresti il tema e non succederebbe niente, perché un override invisibile continua a vincere. |

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

### Subito
- [x] ~~Installare Rust + MSVC Build Tools~~ (Rust 1.98.1, ma **non è nel PATH
      delle shell nuove**: usare `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`)
- [x] ~~`cargo test`~~ — 50/50 verdi
- [x] ~~Primo avvio reale~~ — onboarding, creazione della struttura, database OK
- [ ] **Verificare i flussi non ancora provati**: apertura di un link con
      conferma `critical`, "Apri tutto" con elementi protetti, Ctrl+Space,
      Ctrl+Shift+L, tray, chiusura nella tray, export/import JSON
- [ ] **Provare a mano quanto fatto l'11 settembre** — compila e i test
      passano, ma nessuna di queste cose è mai stata vista girare nell'app:
      - eliminazione di un profilo (anche di quello attivo, e stando sulla
        pagina di un suo contenitore: deve tornare alla dashboard);
      - drag & drop dell'albero: le tre fasce, un ambiente spostato fra due
        progetti, un gruppo da un progetto a un workspace, l'apertura
        automatica di un ramo chiuso, lo scorrimento della sidebar durante il
        trascinamento, il click che *non* deve navigare dopo un rilascio;
      - dashboard: "Personalizza", trascinamento dei widget, righe, larghezza
        piena (solo a finestra larga, `xl`), nascondi/rimetti, i 5 widget
        nuovi (workspace rapidi, calendari, progetti, note, tag → palette
        con la query già scritta).
- [ ] Ripulire i due ambienti duplicati rimasti nel database (ora la
      cancellazione chiede conferma e mostra le conseguenze)
- [x] ~~`git init` + primo commit~~

### Fase 4 proposta
- [x] ~~Profili come contesti di lavoro veri~~ — fatto con l'overlay
      `profile_settings`. Le due scorciatoie globali restano globali per
      necessità (una sola registrazione nell'OS per processo).
- [x] ~~Switcher di profilo in sidebar~~ — crea, rinomina, cambia profilo.
- [x] ~~Eliminazione di un profilo~~ — dall'icona cestino nello switcher, con
      conferma che mostra contenitori, applicazioni, link e workspace rapidi
      che spariscono. L'ultimo profilo non si elimina (l'azione non compare e
      Rust la rifiuta). Eliminando quello attivo si ricade sul primo rimasto,
      nella stessa transazione, e la conferma lo annuncia.
- [ ] Eventuale **scorciatoia di attivazione per profilo** (`Ctrl+Alt+1/2/3`):
      è la lettura sensata di "scorciatoia per profilo", ma è una feature a sé.
- [x] ~~Drag & drop dell'**albero**~~ — ogni riga ha tre fasce (prima /
      dentro / dopo); le fasce vietate dalle regole di annidamento si spengono,
      quindi a schermo non si promette mai un rilascio che Rust rifiuterebbe.
      Un solo contesto per Progetti e Workspace (un gruppo può passare
      dall'uno all'altro), ramo chiuso che si apre sostando, spostamento
      ottimistico. Logica pura in `navigator/treeDrop.ts` (9 test);
      `move_node` ora rifiuta anche un padre di un altro profilo (3 test).
- [x] ~~Dashboard con **widget riordinabili** e configurabili~~ — la
      dashboard si disegna da `dashboard_widgets`. **Un widget per tipo e per
      profilo**: "aggiungere" = renderlo visibile, così la configurazione
      sopravvive e non ci sono doppioni. `widgets::ensure_all` crea al volo i
      tipi mancanti (profili nuovi o ripristinati, tipi futuri) senza
      migrazioni. "Personalizza" permette di trascinare, nascondere,
      rimettere, scegliere le righe (3/6/9/12) e la larghezza piena. Resi
      tutti e 7 i tipi dello schema; nuove query `calendar_links` e
      `recent_notes`. La config passa sempre da `sanitize_config` (chiavi
      ammesse per tipo, valori nel dominio).
- [ ] `ts-rs` per generare i tipi TS dalle struct Rust ed eliminare il drift
- [ ] Screenshot nel README (`docs/screenshots/` è vuota)
- [ ] Primo tag `v0.1.0` → la pipeline di release è già scritta e produce
      `.exe` NSIS + `.msi`

### Sessione dell'11 settembre, in breve
- `scripts/check-sql.mjs` applicava solo la migrazione 0001 e falliva sulla
  0002: ora applica tutte le migrazioni in ordine.
- Il dialogo di cancellazione dei contenitori mostrava etichette sbagliate
  ("Preferiti" per le applicazioni): ora usa le chiavi `impact.*`.
- `openPalette` ora accetta una query iniziale; il pulsante di ricerca in
  sidebar la chiamava con l'evento del click, corretto.
- I drag & drop (albero e widget) sono **solo mouse**: nessun supporto da
  tastiera, come per le card delle applicazioni.
- `dataStore.error` non viene mostrato da nessuna parte: un rifiuto del
  backend si vede solo perché lo stato ottimistico torna indietro.

### Debiti noti, non urgenti
- La modalità "trasparenza di sistema" (Acrylic nativo) è presente come
  impostazione ma **non ancora implementata** lato Rust.
- `bundles.open_delay_ms` è per-workspace nello schema, ma l'apertura usa
  ancora il ritardo globale delle impostazioni.
- `reorder_bundle_links` esiste lato Rust, ma la UI dei workspace non ha
  ancora il drag & drop.
- La disposizione dei widget **non è nell'export JSON**: dopo un ripristino
  la dashboard riparte dai widget di default (`ensure_all` la ricrea, quindi
  niente si rompe, ma la personalizzazione si perde).

---

## 8. Comandi di verifica

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript strict
npm run test          # Vitest + validazione delle query SQL (190)
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
