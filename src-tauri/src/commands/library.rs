//! Preferiti e recenti del profilo.

use tauri::State;

use crate::commands::{db, fail, gate};
use crate::db::repo::library;
use crate::domain::{Favorite, RecentAction};
use crate::AppState;

/// Aggiunge o toglie un preferito; restituisce lo stato risultante.
#[tauri::command]
pub fn toggle_favorite(
    state: State<'_, AppState>,
    profile_id: String,
    node_id: String,
    action_id: Option<String>,
    tool_id: Option<String>,
) -> Result<bool, String> {
    let conn = db(&state)?;
    gate(&state, &conn, Some(&profile_id))?
        .ensure(&conn, &node_id)
        .map_err(fail)?;
    library::toggle_favorite(
        &conn,
        &profile_id,
        &node_id,
        action_id.as_deref(),
        tool_id.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn list_favorites(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<Favorite>, String> {
    let conn = db(&state)?;
    let gate = gate(&state, &conn, Some(&profile_id))?;
    let mut visible = Vec::new();
    for favorite in library::favorites(&conn, &profile_id).map_err(fail)? {
        if !gate.hides(&conn, &favorite.node.id).map_err(fail)? {
            visible.push(favorite);
        }
    }
    Ok(visible)
}

/// Azioni usate di recente; con `workspace_id` solo quelle di quel workspace.
#[tauri::command]
pub fn list_recents(
    state: State<'_, AppState>,
    profile_id: String,
    workspace_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<RecentAction>, String> {
    let conn = db(&state)?;
    let gate = gate(&state, &conn, Some(&profile_id))?;
    let recents = library::recents(
        &conn,
        &profile_id,
        workspace_id.as_deref(),
        limit.unwrap_or(12),
    )
    .map_err(fail)?;
    let mut visible = Vec::new();
    for recent in recents {
        if !gate.hides(&conn, &recent.node.id).map_err(fail)? {
            visible.push(recent);
        }
    }
    Ok(visible)
}
