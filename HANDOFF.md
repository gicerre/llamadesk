# HANDOFF — LlamaDesk

> Documento di ripresa lavori. Aggiornato al **16 settembre 2026**.
> Chi riprende (persona o assistente) legge **questo file** per rimettersi in pari, poi
> `docs/REDESIGN.md` per il perché delle scelte e `docs/ARCHITECTURE.md` /
> `docs/DATA_MODEL.md` per i dettagli tecnici.

---

## 1. Stato in tre righe

LlamaDesk 2.0 è **completa come funzioni**: la riprogettazione decisa in `docs/REDESIGN.md`
(fasi 1–8) è stata realizzata e committata sul branch `redesign`. Compila, i test passano,
l'app gira: database in `%APPDATA%\com.llamadesk.app`, libreria, azioni, palette, protezione,
Avvio, backup, cover, primo avvio guidato. Manca la **prova sul campo nell'app installata**
(`docs/CHECKLIST.md`) e la pubblicazione della prima beta `0.0.1`.

| | |
|---|---|
| Branch di lavoro | `develop` (allineato a `redesign`; la versione 1 è congelata su `main`, tag `legacy-v1`) |
| Ultimo commit | documentazione per la beta pubblica |
| Non committato | primo avvio guidato (profilo, tour, primo workspace) e avatar dei profili |
| Test | 128 Rust, 45 frontend, tutti verdi |
| Schema database | v4 (`0004_profile_avatar.sql`; la v2 è `0003_schema_v2.sql`), nessuna conversione dalla v1 |

---

## 2. Come riprendere

```powershell
# Prerequisiti (una volta sola)
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

npm install
npm run dev          # app vera (Tauri + Vite)
npm run dev:vite     # solo interfaccia nel browser, con la libreria d'esempio
```

Nell'anteprima nel browser: `?vuoto` parte da zero, `?lingua=en|it` forza la lingua,
`?tema=scuro|chiaro` forza il tema, la password di blocco è `llama`. Serve per il disegno, non per provare ciò che tocca Windows.

Il prefisso per cargo in questa macchina: `export PATH="$USERPROFILE/.cargo/bin:$PATH"`.

---

## 3. L'applicazione oggi

- **Libreria**: workspace → progetto → sottoprogetto → sezioni annidabili; progetti condivisi fra
  workspace (stessa entità); link, gruppi di link e percorsi locali con il tipo letto dal disco;
  trascinamento, tag, preferiti, recenti, cestino con annulla, duplicazione di sottoalberi.
- **Aprire**: rilevamento di terminali, IDE e browser (con profili), strumento preferito
  ereditato, azioni (apri, apri con, terminale, mostra, repository remoto), gruppi di link con
  browser/profilo/nuova finestra, **Avvio** come sequenza su un contenitore.
- **Trovare**: palette `Ctrl+K` con ricerca sfocata in Rust, oggetto + verbo ("camunda term"),
  prefissi `>` `@` `#`, pannello azioni con `Tab`.
- **Sicurezza**: "chiedi conferma" ereditabile applicata nel backend; **protezione** con password
  per profilo (Argon2id), blocco manuale, alla tray, al cambio profilo e per inattività.
- **Dati**: backup automatico giornaliero, copie manuali, ripristino verificato al riavvio.
- **Aspetto**: barra del titolo personalizzata, Mica, temi, densità, accento del workspace,
  cover con punto focale, 104 icone, animazione di apertura.

Il dettaglio fase per fase, con ciò che è stato verificato e dove, è in `docs/REDESIGN.md` § 13.

---

## 4. Com'è fatta, in breve

- Il frontend **non scrive SQL**: chiama comandi Tauri tipizzati (`src/lib/ipc.ts` è l'unico
  file che parla con il backend). I tipi TypeScript li genera `cargo test` da `src/domain`.
- Le regole che non devono essere aggirabili stanno in `src-tauri/src/services/`: gerarchia,
  ereditarietà, azioni, strumenti, ricerca, protezione, Avvio, backup, cover, percorsi.
- La gerarchia è **una tabella** (`nodes` + `edges`); le regole di annidamento sono dati
  (`allowed_children`).
- Lo stato del server sta in TanStack Query e si invalida dopo ogni modifica; lo stato di
  interfaccia in piccoli store Zustand.

---

## 5. Decisioni già prese — non rimetterle in discussione a freddo

Le dodici decisioni della riprogettazione (D1–D12) sono in `docs/REDESIGN.md` § 1. Le più
strutturali:

- **D1** il profilo è una *lente* su una libreria comune, non un contenitore separato;
- **D2** una password di blocco per profilo, protezione ereditata, **nessuna cifratura**;
- **D3/D4** niente "ambienti" come livello fisso: DEV/TEST/PROD sono sezioni normali, annidabili
  senza limite, con vista a fuoco;
- **D6** la Home del workspace è fissa e curata (niente dashboard a widget);
- **D7** i "Quick Workspaces" della v1 sono diventati **Avvio**;
- **D9** browser predefinito con opzioni avanzate (browser, profilo, nuova finestra);
- **D11** schema nuovo, nessuna conversione dai dati v1.

---

## 6. Vincoli non negoziabili

1. **Nessuna chiamata di rete.** Nessun client HTTP fra le dipendenze Rust; la CI fallisce se
   compare.
2. **Nessuna telemetria**, nessun aggiornamento automatico.
3. **Nessun dato precaricato**: l'app nasce vuota.
4. **I dati stanno in `%APPDATA%\com.llamadesk.app`**, mai nella cartella d'installazione.
5. **Niente succede senza che l'utente lo chieda**: appunti letti solo con la scorciatoia,
   percorsi ispezionati solo per ciò che è a schermo, programmi avviati solo da uno strumento
   noto e con argomenti separati (mai una stringa di shell), eseguibili mai aperti con "Apri".

---

## 7. Da fare, in ordine

1. **Checklist manuale nell'app installata** (`docs/CHECKLIST.md`): tutte le voci `[ ]`,
   soprattutto apertura reale di IDE/terminali/browser, cover, cattura rapida, backup e
   ripristino, blocco alla tray, icone e animazione di apertura.
2. **Prima beta pubblica `0.0.1`**: seguire `docs/RELEASE.md` — merge di `redesign` in `main`,
   versione allineata nei tre file, tag `v0.0.1`, note dal `CHANGELOG.md`, checksum nella
   release. Gli installer non sono firmati: dirlo chiaramente.
3. **Correzioni che emergono dalla checklist**, una alla volta, con il test che serve.
4. **Snap Layouts** (valutazione in `docs/REDESIGN.md` § 13): sottoclasse della finestra in Rust
   che risponde `HTMAXBUTTON` a `WM_NCHITTEST` sopra il pulsante Ingrandisci.
5. **Debiti noti, non urgenti**:
   - le cover non entrano nel backup (stanno accanto al database);
   - la ricerca rilegge la libreria a ogni richiesta (30 ms su 3.400 nodi): se un giorno diventa
     lenta, serve un indice in memoria invalidato dalle scritture;
   - nessuna firma del codice: SmartScreen avvisa;
   - profilo senza password: vede i contenuti protetti come bloccati ma può impostarne una e
     sbloccarli (i profili sono lenti della stessa persona, non utenti separati).

---

## 8. Comandi di verifica

```bash
npm run lint && npm run typecheck && npm run test     # ESLint, TS strict, Vitest + query SQL
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
npm run build        # installer NSIS e MSI in src-tauri/target/release/bundle/
npm run icons        # rigenera icone e SVG del marchio da geometry.json
```

`cargo test` rigenera anche `src/types/generated`: se cambiano, vanno committati (la CI lo
controlla).

---

## 9. Dove guardare per capire una cosa

| Domanda | File |
|---|---|
| Indice di tutta la documentazione | `docs/README.md` |
| Perché è fatto così | `docs/REDESIGN.md` (decisioni, modello, piano, stato) |
| Come sono organizzati i livelli | `docs/ARCHITECTURE.md` |
| Come si lavora sul codice | `docs/DEVELOPMENT.md` |
| Che cosa c'è nel database | `docs/DATA_MODEL.md` + `src-tauri/src/db/migrations/0003_schema_v2.sql` |
| Che cosa vede chi usa l'app | `docs/USER_GUIDE.md`, `docs/GETTING_STARTED.md`, `docs/CONFIGURATION.md` |
| Come si disegna il marchio | `docs/BRAND.md`, `src/components/brand/geometry.json` |
| Che cosa resta da provare a mano | `docs/CHECKLIST.md` |
| Come si compila e si pubblica | `docs/BUILD.md`, `docs/RELEASE.md` |
| Che cosa è cambiato per chi usa l'app | `CHANGELOG.md` |
| Regole per chi contribuisce | `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` |
