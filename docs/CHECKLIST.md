# Checklist manuale — LlamaDesk 2.0

Da spuntare nell'app installata (`npm run dev` o l'installer), non nell'anteprima nel browser:
qui si provano le cose che toccano Windows, il disco e altri programmi. I test automatici
(`cargo test`, `npm test`) coprono regole e dati; questa lista copre ciò che si vede e si tocca.

Legenda: **[x]** verificato dall'assistente nell'app vera · **[~]** verificato solo
nell'anteprima nel browser · **[ ]** da verificare.

## Avvio e finestra

- [x] Primo avvio: database creato in `%APPDATA%\com.llamadesk.app`, pagina di benvenuto.
- [ ] Nessuna finestra vuota o bianca prima che l'interfaccia compaia.
- [ ] Animazione di apertura: scrivania, collo, testa, orecchie, nome, volo nella barra del titolo; meno di un secondo.
- [ ] Con "Riduci animazioni" di Windows attivo l'animazione non parte.
- [ ] Avvio con `--minimized` / "Avvia ridotto a icona": nessuna finestra, nessuna animazione.
- [x] Mica sulla sidebar e sulla barra del titolo (Windows 11).
- [ ] Icona dell'app nitida nella barra delle applicazioni, nell'area di notifica e in Start (16–48 px).
- [ ] Finestra a 760×520: sidebar ridotta da sola, pannello di dettaglio sopra la pagina.
- [ ] Finestra su monitor ultrawide: contenuto centrato, pannello di dettaglio affiancato.
- [ ] Snap: `Win+Z` e trascinamento ai bordi (il menu dei layout sul pulsante Ingrandisci non c'è, vedi REDESIGN § 13).

## Libreria

- [~] Creare workspace, progetto, sottoprogetto, sezione; rinominare dal pannello.
- [~] Aggiungere un link, un gruppo da più indirizzi, un percorso incollato.
- [ ] "File…", "Cartella…", "Individua…" con i selettori di Windows.
- [ ] Trascinare file e cartelle da Esplora risorse su un progetto o una sezione.
- [~] Riordinare con il mouse e con `Alt+↑/↓`; spostare una riga in un'altra sezione.
- [~] Condividere un progetto con un secondo workspace; "Rimuovi da questo workspace".
- [~] Eliminare con impatto e **Annulla** dal toast.

## Azioni e strumenti

- [x] Rilevamento: Windows Terminal, PowerShell 7, Git Bash, WSL, VS Code, Cursor, Chrome/Edge/Firefox con profili.
- [ ] Clic su un link: si apre nel browser predefinito.
- [ ] Gruppo di link: schede distanziate; con browser + profilo + nuova finestra, un solo avvio del browser giusto.
- [ ] Repository: clic → IDE preferito; "Apri con ▸" un altro IDE; terminale nella cartella.
- [ ] File `.exe`/`.ps1`: "Apri" rifiutato, "Mostra in Esplora risorse" funziona.
- [ ] "Apri il repository remoto" da un repository con `origin` GitHub/Azure DevOps.
- [ ] Elemento con "Chiedi conferma": dialogo; con "Digita il nome" il pulsante si abilita solo col nome.
- [~] Continua e Recenti ripetono l'azione con lo stesso strumento.
- [ ] Impostazioni › Strumenti: preferito per tipo, nascondi, strumento aggiunto a mano con `{path}`.

## Avvio (sequenze)

- [~] Tasto destro su una risorsa › Aggiungi all'Avvio; riordino e rimozione nel pannello.
- [ ] "Avvia" su un progetto reale: IDE, terminale e gruppo di link si aprono in ordine.
- [ ] Un passo con un percorso mancante non ferma gli altri e compare nel toast.

## Ricerca

- [~] `Ctrl+K`: palette vuota con Continua e comandi.
- [ ] Scorciatoia globale (`Ctrl+Alt+Space`) da un'altra app: LlamaDesk davanti con la palette aperta.
- [~] "camunda term", "back cursor", `>tema`, `@progetto`, `#tag`.
- [~] `Tab` sulle azioni, `Ctrl+Invio` alla posizione.

## Protezione

- [~] Proteggere un progetto la prima volta chiede la password.
- [~] `Ctrl+L`: contenuto sostituito dal pannello di sblocco; assente da ricerca, Recenti, Preferiti.
- [~] Tre password errate: attesa di 30 secondi con conto alla rovescia.
- [ ] Chiudere la finestra nell'area di notifica e riaprirla: bloccato.
- [ ] Blocco automatico dopo il tempo scelto senza usare l'app.
- [~] "Password dimenticata": avvertenza con conteggio, protezione tolta.

## Personalizzazione e dati

- [~] Icona dal selettore con ricerca ("banca", "viaggi").
- [ ] Cover: scelta di un'immagine, punto focale con un clic, rimozione; cover nella Home e nella scheda del progetto.
- [~] Profili: rinomina, colore, workspace visibili, eliminazione con impatto.
- [ ] Scorciatoie: cambiare la scorciatoia globale registrando una combinazione; errore leggibile se occupata.
- [ ] Cattura rapida (`Ctrl+Shift+L`) con un indirizzo copiato: "Aggiungi" già compilato.
- [ ] Dati: "Crea un backup ora", "Salva una copia in…", "Apri la cartella dei backup".
- [ ] Ripristino: l'app si riavvia con i dati del backup; `llamadesk.before-restore.db` accanto.
- [ ] Il giorno dopo compare un backup automatico; ne restano al massimo sette.

## Tastiera e accessibilità

- [ ] `Tab` dal primo fotogramma: "Vai al contenuto" compare e porta alla pagina.
- [ ] Frecce fra le righe (anche su due colonne), `Invio` apre, `Spazio` dettagli.
- [ ] Tutti i flussi sopra completabili senza mouse (menu contestuale con `Maiusc+F10`).
- [ ] Assistente vocale (Narratore): nomi di pulsanti, righe e stati letti correttamente.
- [ ] Temi chiaro e scuro, zoom di Windows al 125% e 150%.
