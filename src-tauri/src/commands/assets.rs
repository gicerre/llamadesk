//! Cover di workspace e progetti.

use std::path::{Path, PathBuf};

use tauri::State;

use crate::commands::{db, fail, gate};
use crate::domain::Node;
use crate::services::assets;
use crate::AppState;

fn data_dir(state: &AppState) -> PathBuf {
    state
        .db_path
        .parent()
        .map_or_else(|| PathBuf::from("."), Path::to_path_buf)
}

/// Imposta la cover da un'immagine sul disco, o la toglie (`source_path` assente).
#[tauri::command]
pub fn set_node_cover(
    state: State<'_, AppState>,
    node_id: String,
    source_path: Option<String>,
) -> Result<Node, String> {
    let conn = db(&state)?;
    gate(&state, &conn, None)?
        .ensure(&conn, &node_id)
        .map_err(fail)?;
    assets::set_cover(
        &conn,
        &data_dir(&state),
        &node_id,
        source_path.as_deref().map(Path::new),
    )
    .map_err(fail)
}

/// Percorso del file di un'immagine, da mostrare con il protocollo `asset:`.
#[tauri::command]
pub fn asset_path(state: State<'_, AppState>, asset_id: String) -> Result<String, String> {
    let conn = db(&state)?;
    assets::path_of(&conn, &data_dir(&state), &asset_id)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(fail)
}
