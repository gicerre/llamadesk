//! Ricerca della command palette.

use tauri::State;

use crate::commands::{db, fail, gate};
use crate::domain::SearchHit;
use crate::services::search::{self, Query};
use crate::AppState;

#[tauri::command]
pub fn search_library(
    state: State<'_, AppState>,
    profile_id: String,
    text: String,
    workspace_id: Option<String>,
    context_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, String> {
    let conn = db(&state)?;
    let unlocked = gate(&state, &conn, Some(&profile_id))?.unlocked;
    let query = Query {
        unlocked,
        profile_id: &profile_id,
        text: &text,
        workspace_id: workspace_id.as_deref(),
        context_id: context_id.as_deref(),
        limit: limit.unwrap_or(30).min(100) as usize,
    };
    search::search(&conn, &query).map_err(fail)
}
