# LlamaDesk 2.0 — riprogettazione

> Decisioni prese il **15 settembre 2026**. Documento completo e illustrato
> (mock, concept del logo, apertura): https://claude.ai/artifact/26DQdBcsc6mbfUdf6djCsT
> Questo file ne è la versione di riferimento nel repository: se i due
> divergono, vale questo.
>
> Lo stato precedente è recuperabile con `git checkout legacy-v1`.
> Il lavoro avviene sul branch `redesign`.

---

## 1. Decisioni prese

| # | Tema | Scelta |
|---|---|---|
| D1 | Profilo | **Lente su una libreria comune.** I workspace esistono una volta; ogni profilo sceglie quali vede, ordine e predefinito, e ha preferiti, recenti, tema e strumenti propri. |
| D2 | Protezione | **Una password di blocco per profilo** (hash Argon2id) + flag `protetto` ereditato. Uno sblocco vale per la sessione, blocco automatico. Blocco di riservatezza, **nessuna cifratura** del database. |
| D3 | Gerarchia interna | **Sottoprogetti come ambiti** (schede) dentro la pagina del progetto. Le Folder diventano **Sezioni**. |
| D4 | Ambienti | **Nessun concetto di ambiente.** DEV/TEST/PROD sono sezioni come le altre, **annidabili senza limite**, con **vista a fuoco**. "Chiedi conferma" resta come **proprietà ereditata** (evoluzione della Danger Zone). |
| D5 | Navigazione | **Switcher del workspace in cima alla sidebar**; sotto, solo i progetti del workspace attivo e i loro sottoprogetti. |
| D6 | Home | **Home del workspace a struttura fissa**: Continua → Progetti → Preferiti del workspace → Risorse sciolte. La dashboard a widget viene rimossa. |
| D7 | Quick Workspaces | Diventano **"Avvio"**: sequenza di azioni lanciata da un pulsante su progetto, sottoprogetto o sezione. |
| D8 | Stile | **Superfici solide e neutre**, Mica di Windows 11 solo sulla sidebar. Via sfondi, vetro ovunque, molle con rimbalzo. |
| D9 | Apertura link | Browser predefinito; per gruppo o link si possono scegliere **browser rilevato, profilo del browser, nuova finestra**. |
| D10 | Logo | **Concept C — "Collo a L"**: L maiuscola, asta = collo, in cima testa e orecchie, piede = scrivania in blu Titicaca. |
| D11 | Dati | **Schema nuovo pulito**, nessuna conversione (il DB conteneva solo dati di prova). Backup automatico del file. |
| D12 | Git | Commit dello stato precedente, tag `legacy-v1`, branch `redesign`. ✅ fatto |

Tutto ciò che segue applica le raccomandazioni del documento completo per i
punti non elencati sopra.

---

## 2. Modello concettuale

Tre famiglie, ognuna con un posto fisso nell'interfaccia:

| Famiglia | Oggetti | Dove vive nella UI |
|---|---|---|
| **Contenitori** — per orientarsi | Workspace, Progetto, Sottoprogetto, Sezione | switcher, sidebar (solo progetto + sottoprogetti), percorso nella barra del titolo, schede |
| **Risorse** — per aprire | Link, Link group, Percorso locale | contenuto delle pagine |
| **Azioni** — per agire | Apri, Apri tutti, Apri con…, Terminale qui, Mostra in Esplora, Copia path, Avvia… | clic, hover, menu contestuale, palette, intestazione |

Definizioni per l'utente:

- **Profilo**: chi sta usando LlamaDesk. Si cambia raramente.
- **Workspace**: un ambito di vita o lavoro con identità visiva (Lavoro, Personale).
- **Progetto**: una cosa su cui lavori. **Può stare in più workspace ed è sempre la stessa entità.**
- **Sottoprogetto**: una parte del progetto con i suoi strumenti (spesso un repository). Appartiene a un solo progetto.
- **Sezione**: raggruppamento dentro workspace, progetto, sottoprogetto o altra sezione. Annidabile senza limite. Nessuna cover.
- **Link group**: più URL che si aprono insieme. È l'unico oggetto con la forma "a pila".
- **Percorso locale**: file, cartella, repository o percorso di rete. **Il tipo è rilevato dal disco**, non scelto né salvato.

"Cartella" nella UI indica solo le directory del filesystem, mai le sezioni.

---

## 3. Relazioni

```
Profilo  ↔  Workspace          N↔N  (profile_workspaces: ordine, predefinito, ultima pagina)
Workspace ↔ Progetto            N↔N  (edges: ordine e "fissato in Home" per workspace)
Progetto → Sottoprogetto        1→N
{Workspace|Progetto|Sottoprogetto|Sezione} → Sezione   1→N, annidamento libero
{Workspace|Progetto|Sottoprogetto|Sezione} → Risorsa   1→N
Link group → Link               1→N  (ogni link ha `enabled`)
```

Regole:

- **Solo il Progetto** ha più padri. Risorse e sezioni non si condividono.
- `Subproject.workspaceIds` è **derivato**, mai salvato.
- Preferiti per **profilo**; ordine sulla **relazione**.
- Eliminare un workspace: i progetti condivisi restano negli altri, quelli esclusivi vengono eliminati; la conferma mostra entrambi i numeri.
- Menu del progetto: **"Rimuovi da <workspace>"** e **"Elimina ovunque…"** come azioni distinte.
- Progetto senza colore proprio: usa l'accento del workspace da cui lo si guarda.

---

## 4. Ereditarietà

| Proprietà | Ereditata | Regola |
|---|---|---|
| Protetto | sì | OR lungo tutti i percorsi (anche fra i workspace di un progetto condiviso); un figlio può aggiungere, mai togliere |
| Password | no | una sola, nel profilo |
| Chiedi conferma | sì | vince l'override più vicino (`NULL` = eredita; `none` / `confirm` / `type_name`) |
| Strumento preferito (IDE, terminale, browser) | sì | profilo → workspace → progetto → sottoprogetto → sezione → risorsa, vince il più vicino |
| Modalità di apertura link | sì | dal gruppo ai link, override sul singolo link |
| Accento colore | ripiego | workspace corrente se il progetto non ha colore |
| Archiviato | effetto | nasconde i discendenti senza scriverlo su di loro |
| Visibilità nei profili | effetto | un progetto è visibile se lo è almeno uno dei suoi workspace |
| Icona, cover, descrizione, tag | no | la ricerca però considera nomi e tag degli antenati |

---

## 5. Modello dati (schema 2)

```
nodes
  id TEXT PK (UUIDv7)
  kind            workspace | project | subproject | section | link | link_group | path
  name, description, aliases
  icon            "lucide:<nome>" | "asset:<id>" | NULL (icona del tipo)
  color_main, color_secondary          -- secondary NULL = derivato
  cover_asset_id, cover_focus_x, cover_focus_y   -- solo workspace/project
  is_protected    INTEGER
  caution         NULL | none | confirm | type_name
  url             -- solo link
  path            -- solo path
  enabled         -- link dentro un gruppo
  open_mode, browser_tool_id, browser_profile    -- NULL = eredita
  created_by_profile_id, created_at, updated_at, archived_at, deleted_at

edges             parent_id, child_id (PK), sort_order REAL, is_pinned
allowed_children  workspace  → project, section, link, link_group, path
                  project    → subproject, section, link, link_group, path
                  subproject → section, link, link_group, path
                  section    → section, link, link_group, path
                  link_group → link
launch_steps      owner_id, sort_order, target_id, action_id, tool_id

profiles          id, name, description, avatar_asset_id, color_main, color_secondary,
                  lock_hash, lock_auto_minutes, created_at, updated_at
profile_workspaces profile_id, workspace_id, sort_order, is_default, last_route, last_opened_at
favorites         profile_id, node_id, action_id NULL, sort_order, created_at
usage_events      profile_id, node_id, action_id, tool_id, via_workspace_id, at
tool_preferences  scope_id (profilo o nodo), tool_kind, tool_id
tools             id, kind, name, exe_path, args_template, source (detected|custom), is_hidden, detected_at
assets            id, sha256, mime, width, height, created_at   -- file in %APPDATA%\assets
tags, node_tags   tag globali come la libreria (un workspace condiviso mostra gli stessi tag a tutti), FK vera su nodes
settings, profile_settings   invariati
```

Vincoli applicati in Rust (e con `CHECK` dove possibile): colonne specifiche per
tipo, un solo padre per ogni `kind` tranne `project`, regole di
`allowed_children`, niente cicli fra sezioni, stesso profilo di visibilità.

Recenti: un evento si registra quando un'**azione apre qualcosa** (non per
modifiche né per semplice navigazione). Conservati 90 giorni, esclusi
dall'export.

---

## 6. Navigazione e schermate

```
Apertura (solo avvio a freddo, ≤ ~950 ms)
 └── Home workspace                /w/:ws
      ├── Progetto · Panoramica    /w/:ws/p/:p
      │    └── Sottoprogetto       /w/:ws/p/:p/s/:s
      │         └── Sezione a fuoco   …/n/:section   (qualunque profondità)
      ├── Preferiti                /w/:ws/preferiti
      ├── Recenti                  /w/:ws/recenti
      └── Archiviati               /w/:ws/archivio
Impostazioni                       /impostazioni
Sovrapposti: palette, pannello di dettaglio, menu contestuali, blocco, toast, cattura rapida
```

- **Barra del titolo**: avanti/indietro, percorso con menu dei fratelli su ogni tratto, ricerca (`Ctrl+K`), lucchetto di sessione, controlli finestra Windows a destra.
- **Sidebar** (236px, riducibile a 56px con `Ctrl+B`, automatica sotto 1000px): switcher, Home, Preferiti, Recenti, Progetti (progetto + sottoprogetti), profilo in fondo.
- **Pagina progetto**: intestazione (cover che si compatta, nome, stato di condivisione, strumento predefinito, Avvia, ⋯) → schede Panoramica + sottoprogetti → contenuto.
- **Contenuto di un ambito**: risorse senza sezione, poi sezioni figlie aperte e comprimibili; le sotto-sezioni più profonde sono righe compatte che aprono la **vista a fuoco**. Mai più di un livello di sezioni visibile insieme.
- **Pannello di dettaglio** (`Ctrl+I`): unico posto per modificare nome, icona, colori, cover, tag, protezione, conferma, strumenti.

Home del workspace: Continua (azioni recenti, una riga) → Progetti (fissati prima) → Preferiti di questo workspace → Risorse del workspace. Le fasce vuote non si disegnano. Personalizzazione: nascondere fasce, riordinare/fissare progetti.

---

## 7. Command palette

- `Ctrl+K` in-app; globale `Ctrl+Alt+Space` porta l'app in primo piano con la palette.
- `Invio` = azione principale, `Tab` = pannello azioni, `Ctrl+Invio` = vai alla posizione.
- Oggetto + verbo: "camunda term" → terminale in Camunda; "cursor" → contesto corrente con Cursor.
- Query vuota: ultime azioni, suggerimenti per la pagina, comandi globali.
- Prefissi facoltativi: `>` comandi, `@` workspace/progetti, `#` tag.
- Cerca in nome, alias, descrizione, tag, URL, percorso, nomi degli antenati. Fuzzy + frecency + bonus workspace corrente. **In Rust**, con filtro dei protetti.

---

## 8. Azioni e strumenti

Registro unico (TS per presentazione, Rust per esecuzione):

```ts
interface ActionDef {
  id: string;
  label: (target, tool?) => string;
  icon: IconName;
  requires: Capability[];          // url | urls | path | file | directory | repo | container
  tool?: 'ide' | 'terminal' | 'browser';
  weight: 'primary' | 'quick' | 'menu' | 'more';
  surfaces: ('click' | 'hover' | 'context' | 'palette' | 'header')[];
  confirm?: 'caution' | 'destructive';
  recordsUsage: boolean;
}
```

`execute_action(target_id, action_id, tool_id?, confirmed?)` in Rust verifica
sempre: visibilità e sblocco, conferma, esistenza di percorso / validità URL,
presenza dello strumento; avvia con `Command` e argomenti separati (mai stringhe
di shell); registra l'uso; restituisce l'esito per il toast.

Primarie: Link → Apri · Link group → Apri tutti (N) · File → Apri · Cartella →
Esplora risorse · Repository → IDE predefinito · Contenitori → Vai.
Menu contestuale ≤ 8 voci + "Altro ▸"; distruttive in fondo e separate.

Rilevamento locale (percorsi noti, registro `App Paths`, `PATH`, `vswhere`,
Toolbox JetBrains, `Local State` / `profiles.ini` per i profili dei browser):
Windows Terminal, PowerShell 7, Windows PowerShell, CMD, Git Bash, WSL · VS Code,
Cursor, JetBrains, Visual Studio, Zed, Sublime, Notepad++ · Chrome, Edge,
Firefox, Brave. Strumenti personalizzati: eseguibile + argomenti con `{path}`.

Fuori dalla prima versione: esegui script, copia comando, git status, risorse
"applicazione". Il branch Git si legge da `.git/HEAD`.

---

## 9. Protezione (D2)

- Prima protezione → "Imposta una password di blocco".
- Contenitore bloccato: nome e lucchetto visibili, contenuto sostituito da pannello di sblocco nella pagina (il resto dell'app resta usabile).
- Sblocco: vale per tutta la sessione del profilo. Tre errori → attesa progressiva.
- Blocco automatico: 10 min di inattività (regolabile / mai), finestra nella tray, blocco della sessione Windows; `Ctrl+L` manuale.
- Da bloccati: niente contenuti protetti in ricerca, recenti, preferiti, Continua; una riga "N elementi protetti · Sblocca".
- **Rust non restituisce nodi protetti a sessione bloccata.** Stato di sblocco solo in memoria.
- Password dimenticata: reimpostazione con avvertenza, rimuove la protezione da tutto.

---

## 10. Design system

- **Neutri** con leggera inclinazione blu-verde. Chiaro: fondo `#F3F5F4`, incavo `#E9EDEC`, superficie `#FFFFFF`, testo `#14191B / #465055 / #768084`. Scuro: `#101415 / #0C0F10 / #171B1D`, testo `#E6EBEA / #A6B0B2 / #737D81`.
- **Brand** Titicaca `#1D7384` (scuro `#5BB6C6`), grafite icona `#1E2427`. Il brand vive in logo e apertura; dentro l'app l'accento è quello del workspace.
- **Semantici**: attenzione `#9A6212`, pericolo/conferma `#A83E2C`, riuscito `#2F7D4F`. Mai solo colore.
- **Preset workspace** (12): Cobalto `#3C62C4`, Laguna `#1D7384`, Salvia `#4F7F5B`, Muschio `#6B7A2E`, Ocra `#A8741A`, Argilla `#B0553A`, Rubino `#A23B4F`, Prugna `#7A4B8C`, Ardesia `#4E5D6C`, Notte `#2E3A59`, Sabbia `#8C7B62`, Grafite `#3A3F44`. Calibrati in OKLCH, schiariti nel tema scuro.
- **Accento del workspace** solo su: switcher, selezione, focus, pulsante primario, schede attive, tinta di intestazione/cover ≤ 10%, pulsante "Apri N".
- **Tipografia**: Segoe UI Variable (Text ≤ 14px, Display ≥ 20px), Cascadia Code per dati. Scala 26/16/14/13/11/12-mono.
- **Spaziatura** griglia 4px: 2·4·8·12·16·20·24·32·48. **Raggi** 4·6·9·12·16. **Elevazione** 0 fondo · 1 righe · 2 menu/palette · 3 dialoghi.
- **Densità**: Normale (righe 48, sidebar 32) · Compatta (40 / 28). Colonne risorse ≥ 320px; oltre 1680px il pannello di dettaglio si aggancia.
- **Cover** solo Workspace e Progetto (Home, intestazione progetto, miniatura card).
- **Componenti**: primitive Radix UI; icone Lucide a tratto.

Motion (curve `cubic-bezier(.2,0,0,1)` / `(.3,0,1,1)`, solo transform e opacity,
niente rimbalzi): hover 120ms · menu 140 · schede 160 · pagina 180 · dialoghi
180 · sidebar 200 · cambio workspace 240 (sfuma accento) · apertura risorsa 300.
"Riduci movimento" → dissolvenze da 100ms, apertura saltata.

---

## 11. Brand e apertura (D10)

- Simbolo "Collo a L" su tessera grafite (simbolo al 72%); versione piccola sotto i 32px con orecchie unite da una tacca.
- Logo system: icona app, simbolo, logo completo, wordmark, monocromatico, versioni su chiaro/scuro, piccola.
- Apertura (solo a freddo): scrivania si stende → collo si alza (0–380ms) → testa, orecchie, wordmark (300–650) → il simbolo rimpicciolisce verso la barra del titolo, la shell compare, Titicaca sfuma nell'accento del workspace (650–950). Nessun allungamento artificiale; nessuno spinner.
- Finestra senza lampo bianco (colore di sfondo nella config Tauri).

---

## 12. Piano

| Fase | Contenuto | Finita quando |
|---|---|---|
| 0 · Preparazione ✅ | commit + tag `legacy-v1` + branch `redesign`, questo documento | — |
| 1 · Modello dati ✅ | schema 2, `ts-rs`, repository generico nodi/relazioni, regole, ordinamento, spostamento, condivisione, eliminazione con impatto, archivio, preferiti, uso, ereditarietà (protezione, conferma, strumenti) | `cargo test` copre condivisione, annidamento, cicli, ereditarietà, cancellazione di workspace con progetti condivisi |
| 2 · Design system e shell ✅ | token, kit, barra del titolo (verifica Snap Layouts), sidebar, switcher, percorso con fratelli, avanti/indietro, toast, Mica, simbolo provvisorio | navigazione fra workspace/progetti vuoti in entrambi i temi a 100/125/150% |
| 3 · Contenuti ✅ | Home, pagina progetto con ambiti e sezioni, vista a fuoco, righe risorsa, pannello di dettaglio, creazione unica con riconoscimento, drag & drop interno e da Esplora risorse, stati vuoti ed errori | esempio SpecialHub ricostruibile a mano |
| 4 · Azioni e strumenti | registro, `execute_action`, rilevamento, preferenze ereditate, menu contestuali, azioni rapide, apertura gruppi con browser/profilo/finestra | IntelliJ/terminale da un repository; gruppo aperto in un profilo Chrome |
| 5 · Command palette | fuzzy, oggetto + verbo, pannello azioni, suggerimenti, rilancio recenti, scorciatoia globale | "camunda term" in due tasti |
| 6 · Protezione e conferma | password, sessione, auto-lock, stati bloccati, filtro nelle query, dialoghi di conferma ereditata | contenuti bloccati assenti da ricerca/recenti/preferiti e rifiutati da Rust |
| 7 · Brand e apertura | simbolo definitivo, set icone, wordmark, apertura con transizione, passata motion | icona riconoscibile a 16px; apertura < 1s |
| 8 · Personalizzazione e rifinitura | selettori icona/colore/cover, densità, impostazioni, Avvio, backup v2, cattura rapida, accessibilità e tastiera, finestre piccole e ultrawide | flussi completi da tastiera; checklist manuale spuntata |

Vincoli non negoziabili invariati (vedi `HANDOFF.md` § 6): nessuna rete, nessuna
telemetria, app che nasce vuota, dati in `%APPDATA%`, appunti solo su richiesta.

---

## 13. Stato di avanzamento

### Fase 1 — modello dati (15 settembre 2026) ✅

- Migrazione `0003_schema_v2.sql`: sostituisce lo schema v1 (verificato anche su una copia del
  database reale, nessuna violazione di foreign key).
- Rust: `db/repo/{nodes, workspaces, profiles, library}`, `services/{hierarchy, resolve,
  ordering}`, `db::atomic` (SAVEPOINT componibile). Rimossi repository, servizi e comandi v1.
- Tipi TypeScript generati in `src/types/generated` (`cargo test`); la CI fallisce se non sono
  committati.
- **76 test Rust verdi**, clippy `-D warnings` e `cargo fmt` puliti, 80 query SQL valide,
  lint/typecheck/vitest/prettier verdi.
- Differenza rispetto al § 5: i **tag sono globali**, non per profilo.

API esposta (39 comandi):

| Area | Comandi |
|---|---|
| Avvio e impostazioni | `bootstrap`, `complete_onboarding`, `get_settings`, `set_setting`, `set_profile_setting`, `get_profile_overrides`, `profile_scoped_keys` |
| Profili | `list_profiles`, `activate_profile`, `create_profile`, `update_profile`, `profile_delete_impact`, `delete_profile` |
| Scorciatoie | `apply_global_shortcut`, `get_shortcut_status` |
| Workspace del profilo | `list_workspaces`, `workspace_profiles`, `set_workspace_visibility`, `reorder_workspace`, `set_default_workspace`, `remember_workspace_route` |
| Libreria | `get_node_view`, `list_children`, `create_node`, `update_node`, `move_node`, `share_node`, `unshare_node`, `set_node_pinned`, `archive_node`, `node_delete_impact`, `delete_node`, `restore_deletion`, `duplicate_node`, `set_node_tags`, `list_tags` |
| Preferiti e recenti | `toggle_favorite`, `list_favorites`, `list_recents` |

Pronte ma non ancora chiamate (arrivano con la Fase 4): `library::record_usage`,
`resolve::tool_preference`.

### Fase 2 — design system e shell (15 settembre 2026) ✅

Frontend v1 rimosso e riscritto sulla nuova API.

- **Design system**: token in `src/styles/index.css` (neutri, brand, semantici, accento del
  workspace calcolato in OKLCH, elevazioni, raggi, tipografia Segoe UI Variable, densità);
  motion in `src/lib/motion.ts`. Kit in `src/components/ui/` su primitive Radix: Button, Tooltip,
  Kbd, Menu, Dialog, campi (testo, colore, scelta segmentata, interruttore), stati vuoti, errori,
  scheletri, toast. Simbolo provvisorio del concept C in `components/brand/BrandMark.tsx`.
- **Shell**: barra del titolo con simbolo, riduzione sidebar (`Ctrl+B`), avanti/indietro
  (`Alt+←/→`, tasti del mouse), percorso con menu dei fratelli e compressione dei livelli
  intermedi, campo di ricerca (disabilitato fino alla Fase 5), controlli finestra Windows.
  Sidebar con switcher del workspace (`Ctrl+1…9`), Home/Preferiti/Recenti, progetti e
  sottoprogetti, menu del profilo.
- **Pagine**: benvenuto (primo workspace), Home del workspace (progetti e risorse sciolte),
  progetto con schede dei sottoprogetti e sezioni, vista a fuoco delle sezioni, Preferiti,
  Recenti, Impostazioni essenziali, pagina non trovata. Dialoghi condivisi per creare
  workspace/progetti/sottoprogetti/sezioni, eliminare con impatto e **Annulla**, "Rimuovi da
  questo workspace" per i progetti condivisi, nuovo profilo.
- **Finestra**: trasparente con **Mica** su Windows 11 (verificato sull'app vera), tinta solida
  altrove; il tema della finestra segue quello dell'app; finestra minima 760×520.
- **Dati**: TanStack Query con invalidazione dopo ogni modifica; stato di sessione e interfaccia
  in Zustand; `lib/ipc.ts` tipizzato sui tipi generati. Nel browser (`npm run dev:vite`) un
  backend simulato con i dati d'esempio; `?vuoto` parte da zero, `?tema=scuro|chiaro`.
- **Verifiche**: lint, typecheck, prettier, 22 test frontend, 76 test Rust, clippy puliti.
  Controllate a schermo: pagina progetto in chiaro al 100%, Home in scuro al 125%, benvenuto al
  150% (anteprima nel browser); benvenuto e Impostazioni nell'app Tauri reale.

Aperti:
- **Snap Layouts**: con la barra del titolo personalizzata Windows 11 non mostra il menu dei
  layout passando su Ingrandisci. Non ancora affrontato; `Win+Z` e il trascinamento ai bordi
  funzionano.
- Le risorse (link, gruppi, percorsi) si vedono ma non si creano né si aprono: Fasi 3 e 4.
- Il campo di ricerca è visibile ma disabilitato fino alla Fase 5.

### Fase 3 — contenuti (15 settembre 2026) ✅

- **Backend**: `services/paths.rs` riconosce file, cartelle, repository (branch letto da
  `.git/HEAD`, anche nei worktree), percorsi mancanti o non raggiungibili (limite di 1,5 s) ed
  espande `%VARIABILI%`; comando asincrono `inspect_paths`. `create_link_group` crea un gruppo
  con i suoi link in un solo passo (o tutto o niente). 84 test Rust.
- **Righe delle risorse**: link con monogramma colorato dal dominio (nessuna favicon, nessuna
  rete), gruppi "a pila" con il numero di link e l'anteprima dei nomi, percorsi con il glifo del
  tipo rilevato, branch, dimensione; percorso mancante tratteggiato con "Individua…".
- **Aggiungi** (`Ctrl+N` o pulsante primario): si incolla un indirizzo (link), piu' indirizzi
  (gruppo, oppure link separati), uno o piu' percorsi (tipo mostrato prima di creare) o un nome
  (sezione o sottoprogetto); scelta della destinazione fra l'ambito e le sue sezioni; "File…" e
  "Cartella…" con i selettori di sistema.
- **Pannello di dettaglio** (`Ctrl+I`, clic su una risorsa, `Esc` per chiudere): nome, indirizzo o
  percorso, descrizione, alias, link del gruppo (attivi/esclusi, ordine, aggiunta, rimozione),
  colore e icona, tag, "chiedi conferma" con il valore ereditato, workspace del progetto
  (collega/rimuovi) e "fissato in Home", eliminazione. Salvataggio all'uscita dal campo.
- **Trascinamento**: righe riordinabili e spostabili fra ambito e sezioni (anche sul titolo di una
  sezione), `Alt+↑/↓` da tastiera; file e cartelle trascinati da Esplora risorse diventano
  percorsi nel contenitore sotto il puntatore.
- **Home**: Continua (azioni recenti), Progetti con i fissati in testa e menu "Fissa in Home",
  Preferiti in questo workspace, risorse e sezioni del workspace. `Ctrl+D` preferito, `F5`
  ricontrolla i percorsi.
- **Verifiche**: lint, typecheck, prettier, 32 test frontend, 84 test Rust, clippy puliti. Nel
  browser (backend simulato) provati pannello di dettaglio, creazione di un gruppo da due
  indirizzi, riordino con `Alt+↑` e trascinamento di una riga in una sezione.

Non verificato nell'app Tauri reale: trascinamento da Esplora risorse, selettori "File…" /
"Cartella…" e "Individua…" (esistono solo lì).

### Fase 4 — azioni e strumenti (15 settembre 2026) ✅

- **Rilevamento strumenti** (`services/tools.rs`): percorsi d'installazione noti, cartelle
  JetBrains (installer e Toolbox), Visual Studio 2022; Windows Terminal, PowerShell 7, Windows
  PowerShell, CMD, Git Bash, WSL, VS Code, Cursor, Zed, Sublime, Notepad++, IDE JetBrains, Chrome,
  Edge, Firefox, Brave. Profili dei browser da `Local State` (Chromium) e `profiles.ini`
  (Firefox). Solo lettura del disco, all'avvio in background e con "Cerca di nuovo". Uno
  strumento disinstallato resta in tabella (le preferenze tornano valide se lo si reinstalla).
  Strumenti personalizzati: eseguibile + argomenti con `{path}` / `{urls}`. Verificato su questo
  PC (terminali, VS Code, Cursor, tre browser con i profili).
- **Azioni** (`services/actions.rs`): `open`, `open_with`, `terminal`, `reveal`, `open_remote`.
  Pianificazione pura (testabile) separata dall'esecuzione. Rust applica sempre: visibilità nel
  profilo, **conferma** (la più severa fra elemento e link del gruppo; "digita il nome" verificato
  anche lato Rust, errore `confirmation_required`), URL solo http/https/mailto, percorso
  esistente, **eseguibili e script mai avviati** con "Apri" (`.exe`, `.bat`, `.ps1`, `.lnk`…),
  strumento del tipo giusto e installato. Processi avviati con argomenti separati, mai una shell
  (`cmd /c` solo per gli script `.cmd` di Toolbox, senza finestra). Gruppi: schede distanziate
  di `openDelayMs`, oppure un solo avvio del browser scelto con profilo e nuova finestra.
  Remoto: `origin` letto da `.git/config`, credenziali tolte dall'indirizzo. L'uso si registra
  dopo l'apertura riuscita (strumento solo se scelto esplicitamente).
- **Preferenze**: strumento per tipo sul profilo e su qualunque nodo, ereditato lungo il
  workspace da cui si arriva; ripiego sul primo disponibile.
- **Frontend**: registro delle azioni (`features/actions/registry.ts`, azione principale da ciò
  che dice il disco: repository → IDE, cartella → Esplora risorse, file → Apri); **clic e Invio
  eseguono**, **Spazio** apre il pannello; menu contestuale e "…" con lo stesso contenuto
  (strumento effettivo, "Apri con ▸", copia, modifica, preferito, elimina); pulsanti rapidi al
  passaggio del mouse; dialogo di conferma; toast con strumento e profilo; Continua e Recenti
  ripetono l'azione identica. Pannello: barra "Apri", sezione **Apertura** (browser, profilo,
  nuova finestra) per link e gruppi, sezione **Strumenti** per contenitori e percorsi.
  Impostazioni › **Strumenti**: predefiniti del profilo, elenco con nascondi/elimina, ricerca,
  aggiunta manuale.
- **Verifiche**: 101 test Rust, 37 test frontend, clippy/lint/typecheck/prettier puliti. Nel
  browser: menu contestuale di un repository, conferma di un gruppo PROD e comparsa nei Recenti,
  Impostazioni › Strumenti, sezione Apertura.

API aggiunta (10 comandi): `list_tools`, `refresh_tools`, `browser_profiles`,
`add_custom_tool`, `delete_custom_tool`, `set_tool_hidden`, `set_tool_preference`,
`tool_preferences`, `prepare_action`, `execute_action`.

Non verificato nell'app Tauri reale: avvio effettivo di IDE, terminali e browser con profilo.
Scelto: senza browser salvato, "nuova finestra" e profilo usano il browser preferito (Windows
non espone "nuova finestra" per il browser predefinito). Rinviato: lettura del browser
predefinito dal registro, `vswhere`, `App Paths`/`PATH`.

### Fase 5 — command palette (15 settembre 2026) ✅

- **Ricerca in Rust** (`services/search.rs`, comando `search_library`): legge a ogni richiesta
  la libreria visibile al profilo (nodi non eliminati né archiviati, raggiungibili dai suoi
  workspace) con tag e uso. Punteggio per campo — nome e alias (anche lettere sparse:
  "shb"), tag, nomi degli antenati, indirizzo o percorso, descrizione — con ogni parola che
  deve trovare posto; poi uso (frequenza e ultimi 7 giorni), tipo e workspace corrente.
  Maiuscole e accenti ignorati; intervalli evidenziati sul nome. Un progetto condiviso
  compare una volta, con il percorso del workspace corrente.
- **Oggetto + verbo**: l'ultima parola può essere un verbo — `term`, `ide`, `esplora`,
  `remoto` o il nome di uno strumento (`cursor`, `idea`, `chrome`…). Il risultato porta
  l'azione; su un contenitore si usa il suo primo percorso ("camunda term"). Solo il verbo:
  i percorsi della pagina aperta per primi. `@` limita ai contenitori, `#tag` filtra, `>`
  passa ai comandi. Circa 30 ms per richiesta su 3.400 elementi (build release).
- **Palette** (`Ctrl+K`, campo nella barra del titolo, scorciatoia globale che porta avanti la
  finestra): a vuoto le ultime azioni (ripetibili) e tre comandi; poi risultati con percorso e
  azione proposta, comandi corrispondenti in coda. `Invio` esegue (azione proposta, azione
  principale o apertura del contenitore), `Tab` elenca le altre azioni con tutti gli
  strumenti, `Ctrl+Invio` va alla posizione (pagina del contenitore + pannello di dettaglio),
  `Esc` o `Maiusc+Tab` tornano indietro. Comandi: aggiungi, nuovo progetto/workspace/profilo,
  modifica pagina, Home, Preferiti, Recenti, Impostazioni, barra laterale, tema, densità,
  cerca strumenti, ricontrolla percorsi.
- **Verifiche**: 108 test Rust, 40 test frontend, clippy/lint/typecheck/prettier puliti. Nel
  browser: palette vuota, "special term", "back cursor", "grafana", `>tema`, pannello azioni.

Rinviato alla Fase 6: la ricerca non nasconde ancora i contenuti protetti (non esiste ancora
lo stato di blocco). Nell'anteprima nel browser la ricerca è un'imitazione semplificata.

### Fase 6 — protezione (15 settembre 2026) ✅

- **Password per profilo** (`services/protection.rs`): Argon2id con i parametri OWASP (19 MiB,
  2 passaggi), sale dal generatore del sistema operativo, almeno 4 caratteri; per cambiarla
  serve quella attuale. L'hash non esce mai da Rust. In sviluppo `argon2`/`blake2` si compilano
  ottimizzati (altrimenti la verifica richiederebbe secondi).
- **Sessione in memoria** (`LockBook` in `AppState`): lo sblocco vale per il profilo finché non
  si blocca con `Ctrl+L` o il lucchetto nella barra del titolo, si chiude o si riduce la finestra
  nella tray, si cambia profilo, si riavvia, o si resta inattivi oltre `lock_auto_minutes`
  (predefinito 10, "mai" possibile; l'interfaccia segnala l'attività al massimo ogni 20 s e
  ricontrolla lo stato ogni 30 s). Tre errori, poi attese di 30 s raddoppiate fino a 5 minuti,
  durante le quali la password non viene nemmeno verificata.
- **Il cancello** (`Gate`): a sessione bloccata un nodo protetto — per flag proprio o ereditato
  lungo *qualunque* strada — arriva senza contenuto (`NodeView.locked`, niente figli, tag,
  indirizzo, percorso, descrizione, alias); nelle liste resta nome e lucchetto. Rifiutati con
  `locked`: creazione dentro, modifica, spostamento, condivisione, fissaggio, archiviazione,
  eliminazione, duplicazione, tag, preferito, preferenze di strumento, azioni. Esclusi da ricerca,
  preferiti e recenti. Proteggere senza password risponde `no_lock`.
- **Password dimenticata / da togliere**: toglie la password e la protezione da tutto ciò che il
  profilo vede, con avvertenza e conteggio.
- **Interfaccia**: pannello "«nome» è protetto" con sblocco al posto del contenuto (workspace,
  progetto, sottoprogetto, sezione, pannello di dettaglio); interruttore **Proteggi** nel
  pannello (la prima volta chiede la password e poi protegge); dialoghi di sblocco, password e
  rimozione; Impostazioni › **Protezione** (stato, blocca ora, cambia, blocco automatico,
  rimozione, nota "riservatezza, non cifratura"); riga "N elementi protetti nascosti · Sblocca"
  in palette, Preferiti e Recenti; un'azione su un elemento bloccato apre lo sblocco.
- **Verifiche**: 116 test Rust (tentativi e attese, cambio password, inattività, cancello anche
  lungo un'altra strada, rimozione limitata al profilo, ricerca), 40 test frontend, clippy, lint,
  typecheck, prettier puliti. Nel browser (password dell'anteprima: `llama`): pannello bloccato,
  password errata, sblocco, `Ctrl+L`, Impostazioni, Recenti.

Scelte e limiti:
- Un profilo senza password vede i contenuti protetti come bloccati e può sbloccarli solo
  impostando una propria password: i profili sono lenti della stessa persona (D1), non utenti
  separati. Il blocco è di riservatezza (D2), come dice l'interfaccia.
- Rinviato: blocco quando si blocca la sessione di Windows (richiede le notifiche WTS della
  finestra nativa). Non verificato nell'app Tauri reale: blocco alla chiusura nella tray.

### Fase 7 — brand e apertura (15 settembre 2026) ✅

- **Simbolo definitivo** "Collo a L" in `src/components/brand/geometry.json`: rettangoli con
  raggi per angolo (dove due forme si toccano l'angolo è vivo, così collo, testa, orecchie e
  scrivania formano un contorno continuo), centratura ottica, versione piccola fino a 32 px con le
  orecchie unite da una tacca. Componenti `BrandMark` (tema, monocromatico, tessera),
  `Wordmark`, `Logo`.
- **Icone**: `scripts/brand.mjs` rasterizza la stessa geometria (nessuna dipendenza) in
  `source.png`, poi `tauri icon`, poi un `icon.ico` proprio con la versione piccola a 16–32 px e
  la normale a 40–256; simbolo all'80% della tessera (94% nelle piccole) dopo la prova a
  16/24/32/48/64/128 px. Rimossi il vecchio generatore (glifo a nodi viola) e `squircle.mjs`.
- **Logo system** in `docs/brand/` (icona, simbolo chiaro/scuro/piccolo/monocromatico, logo
  chiaro/scuro) e guida in `docs/BRAND.md`.
- **Nessun lampo**: la finestra resta nascosta finché il frontend non ha dipinto il primo
  fotogramma (`window_ready`); ripiego a 3 s; niente se si parte nella tray.
- **Apertura** (`src/app/Opener.tsx`): scrivania, collo, testa, orecchie, nome, poi volo del
  simbolo sul segnaposto della barra del titolo mentre il fondo dissolve e l'accento passa da
  Titicaca al workspace. Solo a freddo, con l'impostazione attiva, senza "riduci movimento";
  la shell si carica sotto. Comando palette "Rivedi l'animazione di apertura".
- **Verifiche**: 116 test Rust, 40 test frontend, lint/typecheck/prettier/clippy puliti; anteprima
  delle icone a sei dimensioni su fondo chiaro e scuro; nel browser inizio e fine dell'apertura.

Da verificare nell'app reale: fotogrammi intermedi dell'apertura (una scheda di browser in
background sospende le animazioni), icona nella barra delle applicazioni e nella tray.
