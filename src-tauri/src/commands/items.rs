//! Comandi su applicazioni e link.

use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::items;
use crate::domain::{Application, Link};
use crate::services::duplicate;
use crate::AppState;

/* ------------------------------------------------------------ applicazioni */

#[tauri::command]
pub fn create_application(
    state: State<'_, AppState>,
    profile_id: String,
    container_id: String,
    name: String,
) -> Result<Application, String> {
    let conn = db(&state)?;
    items::create_application(&conn, &profile_id, &container_id, &name).map_err(fail)
}

/// Per `danger_level`: campo assente = invariato, `"inherit"` = torna a
/// ereditare, altrimenti imposta il livello.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_application(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    danger_level: Option<String>,
    is_favorite: Option<bool>,
) -> Result<Application, String> {
    let conn = db(&state)?;
    items::update_application(
        &conn,
        &id,
        name.as_deref(),
        description.as_deref(),
        icon.as_deref(),
        color.as_deref(),
        danger_level.as_deref(),
        is_favorite,
    )
    .map_err(fail)
}

#[tauri::command]
pub fn move_application(
    state: State<'_, AppState>,
    id: String,
    container_id: String,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<Application, String> {
    let conn = db(&state)?;
    items::move_application(
        &conn,
        &id,
        &container_id,
        previous_id.as_deref(),
        next_id.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn delete_application(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db(&state)?;
    items::delete_application(&conn, &id).map_err(fail)
}

#[tauri::command]
pub fn duplicate_application(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<Application, String> {
    let mut guard = db(&state)?;
    let tx = guard.transaction().map_err(fail)?;
    let clone = duplicate::duplicate_application(&tx, &id, &new_name).map_err(fail)?;
    tx.commit().map_err(fail)?;
    Ok(clone)
}

/* -------------------------------------------------------------------- link */

#[tauri::command]
pub fn create_link(
    state: State<'_, AppState>,
    application_id: String,
    name: String,
    url: String,
    kind: Option<String>,
) -> Result<Link, String> {
    let conn = db(&state)?;
    items::create_link(
        &conn,
        &application_id,
        &name,
        &url,
        kind.as_deref().unwrap_or("web"),
    )
    .map_err(fail)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_link(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    url: Option<String>,
    kind: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    danger_level: Option<String>,
    is_favorite: Option<bool>,
    is_default: Option<bool>,
) -> Result<Link, String> {
    let conn = db(&state)?;
    items::update_link(
        &conn,
        &id,
        name.as_deref(),
        url.as_deref(),
        kind.as_deref(),
        description.as_deref(),
        icon.as_deref(),
        danger_level.as_deref(),
        is_favorite,
        is_default,
    )
    .map_err(fail)
}

#[tauri::command]
pub fn move_link(
    state: State<'_, AppState>,
    id: String,
    application_id: String,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<Link, String> {
    let conn = db(&state)?;
    items::move_link(
        &conn,
        &id,
        &application_id,
        previous_id.as_deref(),
        next_id.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn delete_link(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db(&state)?;
    items::delete_link(&conn, &id).map_err(fail)
}
