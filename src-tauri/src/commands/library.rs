//! Comandi per tag e note.

use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::library;
use crate::domain::{Note, Tag};
use crate::AppState;

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>, profile_id: String) -> Result<Vec<Tag>, String> {
    let conn = db(&state)?;
    library::list_tags(&conn, &profile_id).map_err(fail)
}

#[tauri::command]
pub fn tags_for_entity(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<Tag>, String> {
    let conn = db(&state)?;
    library::tags_for_entity(&conn, &entity_type, &entity_id).map_err(fail)
}

/// Sostituisce l'intero insieme di tag di un'entità.
#[tauri::command]
pub fn set_entity_tags(
    state: State<'_, AppState>,
    profile_id: String,
    entity_type: String,
    entity_id: String,
    names: Vec<String>,
) -> Result<Vec<Tag>, String> {
    let mut guard = db(&state)?;
    let tx = guard.transaction().map_err(fail)?;
    let tags = library::set_entity_tags(&tx, &profile_id, &entity_type, &entity_id, &names)
        .map_err(fail)?;
    tx.commit().map_err(fail)?;
    Ok(tags)
}

#[tauri::command]
pub fn get_note(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
) -> Result<Option<Note>, String> {
    let conn = db(&state)?;
    library::get_note(&conn, &entity_type, &entity_id).map_err(fail)
}

/// Salva la nota. Un contenuto vuoto la elimina.
#[tauri::command]
pub fn set_note(
    state: State<'_, AppState>,
    entity_type: String,
    entity_id: String,
    content: String,
) -> Result<Option<Note>, String> {
    let conn = db(&state)?;
    library::set_note(&conn, &entity_type, &entity_id, &content).map_err(fail)
}
