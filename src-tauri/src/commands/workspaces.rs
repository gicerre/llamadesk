//! Comandi per i Quick Workspaces.

use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::bundles;
use crate::domain::{Bundle, BundleWithLinks};
use crate::AppState;

#[tauri::command]
pub fn list_bundles(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<BundleWithLinks>, String> {
    let conn = db(&state)?;
    bundles::list(&conn, &profile_id).map_err(fail)
}

/// Crea un workspace. Se `expires_at` è valorizzato il workspace è temporaneo
/// e viene rimosso automaticamente al primo avvio successivo alla scadenza.
#[tauri::command]
pub fn create_bundle(
    state: State<'_, AppState>,
    profile_id: String,
    name: String,
    expires_at: Option<String>,
) -> Result<Bundle, String> {
    let conn = db(&state)?;
    bundles::create(
        &conn,
        &profile_id,
        &name,
        expires_at.is_some(),
        expires_at.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn update_bundle(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    icon: Option<String>,
    open_delay_ms: Option<i64>,
) -> Result<Bundle, String> {
    let conn = db(&state)?;
    bundles::update(&conn, &id, name.as_deref(), icon.as_deref(), open_delay_ms).map_err(fail)
}

#[tauri::command]
pub fn delete_bundle(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db(&state)?;
    bundles::delete(&conn, &id).map_err(fail)
}

#[tauri::command]
pub fn add_bundle_link(
    state: State<'_, AppState>,
    bundle_id: String,
    link_id: String,
) -> Result<(), String> {
    let conn = db(&state)?;
    bundles::add_link(&conn, &bundle_id, &link_id).map_err(fail)
}

#[tauri::command]
pub fn remove_bundle_link(
    state: State<'_, AppState>,
    bundle_id: String,
    link_id: String,
) -> Result<(), String> {
    let conn = db(&state)?;
    bundles::remove_link(&conn, &bundle_id, &link_id).map_err(fail)
}

#[tauri::command]
pub fn reorder_bundle_links(
    state: State<'_, AppState>,
    bundle_id: String,
    link_ids: Vec<String>,
) -> Result<(), String> {
    let conn = db(&state)?;
    bundles::reorder(&conn, &bundle_id, &link_ids).map_err(fail)
}
