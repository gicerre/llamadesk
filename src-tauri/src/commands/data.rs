//! Backup, sfondi e prompt personalizzati della Danger Zone.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::{db, fail};
use crate::db::repo::{backgrounds, profiles};
use crate::db::seed::new_id;
use crate::domain::{Background, DangerPrompt, ImportSummary, Profile};
use crate::services::{backup, danger};
use crate::AppState;

/// Anteprima di un backup, mostrata prima di applicarlo: importare alla cieca
/// un file altrui è esattamente il momento in cui si perdono i propri dati.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub profiles: usize,
    pub containers: usize,
    pub applications: usize,
    pub links: usize,
    pub bundles: usize,
}

/* ---------------------------------------------------------------- backup */

#[tauri::command]
pub fn export_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<usize, String> {
    let conn = db(&state)?;
    let version = app.package_info().version.to_string();
    backup::export_to_file(&conn, &version, Path::new(&path)).map_err(fail)
}

#[tauri::command]
pub fn preview_backup(path: String) -> Result<BackupPreview, String> {
    let file = backup::read_file(Path::new(&path)).map_err(fail)?;

    Ok(BackupPreview {
        format_version: file.format_version,
        app_version: file.app_version,
        exported_at: file.exported_at,
        profiles: file.profiles.len(),
        containers: file.containers.len(),
        applications: file.applications.len(),
        links: file.links.len(),
        bundles: file.bundles.len(),
    })
}

/// Importa un backup. `mode` vale `merge` (aggiunge, con id nuovi) oppure
/// `replace` (sostituisce tutto).
///
/// Prima di un `replace` viene salvata una copia del database accanto al file
/// originale: se il ripristino non è quello che l'utente si aspettava, i dati
/// precedenti sono ancora lì.
#[tauri::command]
pub fn import_backup(
    state: State<'_, AppState>,
    path: String,
    mode: String,
) -> Result<ImportSummary, String> {
    let parsed_mode = backup::ImportMode::parse(&mode).map_err(fail)?;
    let file = backup::read_file(Path::new(&path)).map_err(fail)?;

    let mut guard = db(&state)?;

    if parsed_mode == backup::ImportMode::Replace {
        guard
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(fail)?;

        let safety = state.db_path.with_file_name(format!(
            "llamadesk.before-import-{}.db",
            chrono_like_stamp()
        ));
        if let Err(error) = fs::copy(&state.db_path, &safety) {
            return Err(format!(
                "impossibile creare la copia di sicurezza prima dell'importazione: {error}"
            ));
        }
    }

    let tx = guard.transaction().map_err(fail)?;
    let summary = backup::apply(&tx, &file, parsed_mode).map_err(fail)?;
    tx.commit().map_err(fail)?;

    Ok(summary)
}

/// Marca temporale compatta senza dipendere da `chrono`: l'unico uso è dare un
/// nome univoco a un file di sicurezza.
fn chrono_like_stamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/* ---------------------------------------------------------------- sfondi */

#[tauri::command]
pub fn list_backgrounds(state: State<'_, AppState>) -> Result<Vec<Background>, String> {
    let conn = db(&state)?;
    backgrounds::list(&conn).map_err(fail)
}

/// Registra un gradiente o un colore pieno come sfondo.
#[tauri::command]
pub fn create_background(
    state: State<'_, AppState>,
    name: String,
    source: String,
    value: String,
) -> Result<Background, String> {
    let conn = db(&state)?;
    backgrounds::create(&conn, &name, &source, &value).map_err(fail)
}

/// Importa un'immagine dal disco.
///
/// Il file viene COPIATO nella cartella dati dell'applicazione: se domani
/// l'utente sposta o cancella l'originale, lo sfondo continua a esistere.
#[tauri::command]
pub fn import_background_image(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
    name: Option<String>,
) -> Result<Background, String> {
    let source = PathBuf::from(&source_path);

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();

    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "avif") {
        return Err("formato immagine non supportato: usa PNG, JPG, WEBP o AVIF".into());
    }

    let directory = app
        .path()
        .app_data_dir()
        .map_err(fail)?
        .join("wallpapers");
    fs::create_dir_all(&directory).map_err(fail)?;

    let target = directory.join(format!("{}.{extension}", new_id()));
    fs::copy(&source, &target).map_err(fail)?;

    let display_name = name.unwrap_or_else(|| {
        source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Wallpaper")
            .to_string()
    });

    let conn = db(&state)?;
    backgrounds::create(&conn, &display_name, "file", &target.to_string_lossy()).map_err(fail)
}

#[tauri::command]
pub fn delete_background(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db(&state)?;

    // Se lo sfondo era un file importato, il file va via con lui: non lasciamo
    // immagini orfane nella cartella dati.
    if let Ok(background) = backgrounds::get(&conn, &id) {
        if background.source == "file" {
            fs::remove_file(&background.value).ok();
        }
    }

    backgrounds::delete(&conn, &id).map_err(fail)
}

/// Sfondo specifico di un profilo. `None` fa tornare a quello globale.
#[tauri::command]
pub fn set_profile_background(
    state: State<'_, AppState>,
    profile_id: String,
    background_id: Option<String>,
) -> Result<Profile, String> {
    let conn = db(&state)?;
    profiles::set_background(&conn, &profile_id, background_id.as_deref()).map_err(fail)
}

/* ------------------------------------------ prompt della Danger Zone ---- */

/// Crea o aggiorna un prompt personalizzato.
///
/// Modificare un built-in non lo sovrascrive: ne crea una copia con testo
/// letterale, così l'originale tradotto resta disponibile.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn save_danger_prompt(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    level: String,
    title: String,
    message: String,
    confirm_label: String,
    cancel_label: String,
    confirm_word: Option<String>,
) -> Result<DangerPrompt, String> {
    if !matches!(level.as_str(), "warning" | "danger" | "critical") {
        return Err(format!("livello non valido: {level}"));
    }

    let conn = db(&state)?;

    let target_id = match &id {
        Some(existing) => match danger::prompt_by_id(&conn, existing).map_err(fail)? {
            Some(prompt) if prompt.is_builtin => new_id(),
            Some(prompt) => prompt.id,
            None => new_id(),
        },
        None => new_id(),
    };

    conn.execute(
        "INSERT INTO danger_prompts
           (id, profile_id, name, level, title, message, confirm_label, cancel_label, confirm_word, is_builtin)
         VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, level = excluded.level, title = excluded.title,
           message = excluded.message, confirm_label = excluded.confirm_label,
           cancel_label = excluded.cancel_label, confirm_word = excluded.confirm_word",
        rusqlite::params![
            target_id,
            name,
            level,
            title,
            message,
            confirm_label,
            cancel_label,
            confirm_word
        ],
    )
    .map_err(fail)?;

    danger::prompt_by_id(&conn, &target_id)
        .map_err(fail)?
        .ok_or_else(|| "prompt non trovato dopo il salvataggio".to_string())
}

#[tauri::command]
pub fn delete_danger_prompt(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db(&state)?;
    conn.execute(
        "DELETE FROM danger_prompts WHERE id = ?1 AND is_builtin = 0",
        [&id],
    )
    .map_err(fail)?;
    Ok(())
}
