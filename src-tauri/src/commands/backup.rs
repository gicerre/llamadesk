//! Backup del database: automatici, manuali, ripristino al riavvio.

use std::path::PathBuf;
use std::time::SystemTime;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::{db, fail};
use crate::domain::BackupInfo;
use crate::services::backup;
use crate::AppState;

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> Result<Vec<BackupInfo>, String> {
    backup::list(&state.db_path).map_err(fail)
}

/// Senza destinazione il backup va nella cartella dei backup, con data e ora.
#[tauri::command]
pub fn create_backup(
    state: State<'_, AppState>,
    destination: Option<String>,
) -> Result<BackupInfo, String> {
    let conn = db(&state)?;
    let path = destination.map(PathBuf::from).unwrap_or_else(|| {
        backup::backups_dir(&state.db_path).join(format!(
            "llamadesk-{}.db",
            backup::file_stamp(SystemTime::now())
        ))
    });
    backup::create(&conn, &path).map_err(fail)
}

/// Verifica il backup, lo mette da parte e riavvia: al prossimo avvio prende
/// il posto del database attuale.
#[tauri::command]
pub fn restore_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    backup::stage_restore(&state.db_path, &PathBuf::from(path)).map_err(fail)?;
    app.restart();
}

#[tauri::command]
pub fn reveal_backups(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let dir = backup::backups_dir(&state.db_path);
    std::fs::create_dir_all(&dir).map_err(fail)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(fail)
}
