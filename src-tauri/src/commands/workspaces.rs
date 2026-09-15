//! Workspace come li vede un profilo: elenco, visibilita', ordine,
//! predefinito, ultima pagina visitata. La creazione passa da `create_node`.

use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::workspaces;
use crate::domain::WorkspaceEntry;
use crate::AppState;

#[tauri::command]
pub fn list_workspaces(
    state: State<'_, AppState>,
    profile_id: String,
    include_archived: Option<bool>,
) -> Result<Vec<WorkspaceEntry>, String> {
    let conn = db(&state)?;
    workspaces::list(&conn, &profile_id, include_archived.unwrap_or(false)).map_err(fail)
}

/// Profili in cui il workspace e' visibile ("Visibile in questi profili").
#[tauri::command]
pub fn workspace_profiles(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<String>, String> {
    let conn = db(&state)?;
    workspaces::profiles_of(&conn, &workspace_id).map_err(fail)
}

#[tauri::command]
pub fn set_workspace_visibility(
    state: State<'_, AppState>,
    profile_id: String,
    workspace_id: String,
    visible: bool,
) -> Result<(), String> {
    let conn = db(&state)?;
    if visible {
        workspaces::show(&conn, &profile_id, &workspace_id).map_err(fail)
    } else {
        workspaces::hide(&conn, &profile_id, &workspace_id).map_err(fail)
    }
}

#[tauri::command]
pub fn reorder_workspace(
    state: State<'_, AppState>,
    profile_id: String,
    workspace_id: String,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<(), String> {
    let conn = db(&state)?;
    workspaces::reorder(
        &conn,
        &profile_id,
        &workspace_id,
        previous_id.as_deref(),
        next_id.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn set_default_workspace(
    state: State<'_, AppState>,
    profile_id: String,
    workspace_id: String,
) -> Result<(), String> {
    let conn = db(&state)?;
    workspaces::set_default(&conn, &profile_id, &workspace_id).map_err(fail)
}

#[tauri::command]
pub fn remember_workspace_route(
    state: State<'_, AppState>,
    profile_id: String,
    workspace_id: String,
    route: String,
) -> Result<(), String> {
    let conn = db(&state)?;
    workspaces::remember_route(&conn, &profile_id, &workspace_id, &route).map_err(fail)
}
