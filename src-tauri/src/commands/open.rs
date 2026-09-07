//! Apertura dei link e Danger Zone.
//!
//! Il flusso e' sempre lo stesso, e passa sempre da Rust:
//! 1. `prepare_open` restituisce il livello risolto e il prompt da mostrare;
//! 2. la UI conferma (o no);
//! 3. `open_link` apre davvero e registra l'uso.
//!
//! La UI non puo' "dimenticarsi" di chiedere conferma per un link protetto:
//! `open_link` rifiuta l'apertura di un link `danger`/`critical` se non riceve
//! il flag di conferma. La protezione non e' una decorazione del frontend.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::{db, fail};
use crate::db::repo::{items, usage};
use crate::db::seed;
use crate::domain::{DangerPrompt, OpenIntent};
use crate::services::{danger, opener};
use crate::AppState;

/// Riepilogo per il modale "Apri tutto": quanti link, quanti protetti, quali.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkOpenPlan {
    pub total: usize,
    pub protected: Vec<OpenIntent>,
    pub safe_link_ids: Vec<String>,
    /// Livello piu' severo presente: decide il tono del modale.
    pub highest_level: String,
    /// Parola di conferma richiesta, se fra i protetti c'e' un `critical`.
    pub confirm_word: Option<String>,
}

#[tauri::command]
pub fn list_danger_prompts(state: State<'_, AppState>) -> Result<Vec<DangerPrompt>, String> {
    let conn = db(&state)?;
    danger::list_prompts(&conn).map_err(fail)
}

/// Cosa succede se apro questo link: livello, prompt e segnaposto risolti.
#[tauri::command]
pub fn prepare_open(state: State<'_, AppState>, link_id: String) -> Result<OpenIntent, String> {
    let conn = db(&state)?;
    danger::build_open_intent(&conn, &link_id).map_err(fail)
}

/// Piano di apertura per un insieme di link (workspace, "Apri tutto").
#[tauri::command]
pub fn prepare_open_many(
    state: State<'_, AppState>,
    link_ids: Vec<String>,
) -> Result<BulkOpenPlan, String> {
    let conn = db(&state)?;

    let mut protected = Vec::new();
    let mut safe_link_ids = Vec::new();
    let mut highest = "normal".to_string();
    let mut confirm_word = None;

    for link_id in &link_ids {
        let intent = danger::build_open_intent(&conn, link_id).map_err(fail)?;

        if intent.danger.requires_confirmation() {
            if danger::severity(&intent.danger.level) > danger::severity(&highest) {
                highest = intent.danger.level.clone();
            }
            if intent.danger.level == "critical" {
                confirm_word = intent
                    .prompt
                    .as_ref()
                    .and_then(|prompt| prompt.confirm_word.clone())
                    .or(confirm_word);
            }
            protected.push(intent);
        } else {
            safe_link_ids.push(link_id.clone());
        }
    }

    Ok(BulkOpenPlan {
        total: link_ids.len(),
        protected,
        safe_link_ids,
        highest_level: highest,
        confirm_word,
    })
}

/// Apre un link. `confirmed` deve essere `true` per i livelli che richiedono
/// conferma: e' l'ultima barriera, e sta lato Rust apposta.
#[tauri::command]
pub fn open_link(
    app: AppHandle,
    state: State<'_, AppState>,
    link_id: String,
    confirmed: Option<bool>,
) -> Result<(), String> {
    let (url, level) = {
        let conn = db(&state)?;
        let link = items::get_link(&conn, &link_id).map_err(fail)?;
        let resolved = danger::resolve_for_link(&conn, &link_id).map_err(fail)?;
        (link.url, resolved.level)
    };

    let requires_confirmation = matches!(level.as_str(), "warning" | "danger" | "critical");
    if requires_confirmation && confirmed != Some(true) {
        return Err(format!(
            "apertura rifiutata: il link e' protetto ({level}) e non e' stata data conferma"
        ));
    }

    let validated = opener::validate(&url).map_err(fail)?;
    app.opener()
        .open_url(validated, None::<&str>)
        .map_err(fail)?;

    let conn = db(&state)?;
    usage::record(&conn, "link", &link_id).map_err(fail)?;
    Ok(())
}

/// Apre piu' link in sequenza.
///
/// Il ritardo fra un'apertura e l'altra non e' un vezzo: lanciando dieci URL
/// nello stesso istante, Chrome ed Edge perdono schede o le riordinano.
/// Il lavoro avviene su un thread dedicato, cosi' l'interfaccia non si blocca.
#[tauri::command]
pub fn open_links(
    app: AppHandle,
    state: State<'_, AppState>,
    link_ids: Vec<String>,
    confirmed: Option<bool>,
) -> Result<usize, String> {
    let (urls, delay) = {
        let conn = db(&state)?;
        let delay = seed::read_settings(&conn)
            .map(|settings| settings.open_delay_ms)
            .unwrap_or(250);

        // Validiamo TUTTO prima di aprire qualsiasi cosa: meglio nessuna scheda
        // che meta' workspace aperto e un errore a meta' strada.
        let mut urls = Vec::with_capacity(link_ids.len());
        for link_id in &link_ids {
            let link = items::get_link(&conn, link_id).map_err(fail)?;
            let resolved = danger::resolve_for_link(&conn, link_id).map_err(fail)?;

            if resolved.requires_confirmation() && confirmed != Some(true) {
                return Err(format!(
                    "apertura rifiutata: '{}' e' protetto ({}) e non e' stata data conferma",
                    link.name, resolved.level
                ));
            }

            urls.push((link_id.clone(), opener::validate(&link.url).map_err(fail)?));
        }

        for (link_id, _) in &urls {
            usage::record(&conn, "link", link_id).map_err(fail)?;
        }

        (urls, delay)
    };

    let count = urls.len();
    std::thread::spawn(move || {
        for (index, (_, url)) in urls.into_iter().enumerate() {
            if index > 0 {
                std::thread::sleep(Duration::from_millis(delay));
            }
            let _ = app.opener().open_url(url, None::<&str>);
        }
    });

    Ok(count)
}
