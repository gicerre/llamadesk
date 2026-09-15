//! Dashboard: disposizione dei widget e dati dei widget che non hanno gia'
//! una fonte altrove (preferiti e recenti stanno in `discover`).

use serde_json::Value;
use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::{items, library, widgets};
use crate::domain::{DashboardWidget, LinkInContext, NoteInContext};
use crate::AppState;

/// Tutti i widget del profilo, visibili e nascosti. Crea al volo quelli che
/// mancano, cosi' un profilo nuovo o ripristinato ha subito la sua dashboard.
#[tauri::command]
pub fn list_widgets(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<DashboardWidget>, String> {
    let conn = db(&state)?;
    widgets::ensure_all(&conn, &profile_id).map_err(fail)?;
    widgets::list(&conn, &profile_id).map_err(fail)
}

#[tauri::command]
pub fn update_widget(
    state: State<'_, AppState>,
    id: String,
    is_visible: Option<bool>,
    config: Option<Value>,
) -> Result<DashboardWidget, String> {
    let conn = db(&state)?;
    widgets::update(&conn, &id, is_visible, config.as_ref()).map_err(fail)
}

#[tauri::command]
pub fn move_widget(
    state: State<'_, AppState>,
    id: String,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<DashboardWidget, String> {
    let conn = db(&state)?;
    widgets::move_widget(&conn, &id, previous_id.as_deref(), next_id.as_deref()).map_err(fail)
}

#[tauri::command]
pub fn calendar_links(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<LinkInContext>, String> {
    let conn = db(&state)?;
    items::calendar_links(&conn, &profile_id).map_err(fail)
}

#[tauri::command]
pub fn recent_notes(
    state: State<'_, AppState>,
    profile_id: String,
    limit: Option<u32>,
) -> Result<Vec<NoteInContext>, String> {
    let conn = db(&state)?;
    library::recent_notes(&conn, &profile_id, limit.unwrap_or(5)).map_err(fail)
}
