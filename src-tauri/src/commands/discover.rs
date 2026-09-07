//! Ricerca globale, recenti e health check dei link.

use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::{items, search, usage};
use crate::db::seed;
use crate::domain::{ApplicationWithLinks, LinkUsage, SearchHit};
use crate::AppState;

#[tauri::command]
pub fn search_all(
    state: State<'_, AppState>,
    profile_id: String,
    query: String,
) -> Result<Vec<SearchHit>, String> {
    let conn = db(&state)?;
    search::search(&conn, &profile_id, &query).map_err(fail)
}

/// Statistiche d'uso di tutti i link del profilo.
///
/// L'health check e' interamente locale: nessun URL viene contattato. Un link
/// "dormiente" non e' un link rotto, e' un link che non apri da tanto tempo —
/// esattamente il segnale che serve per ripulire un workspace cresciuto troppo.
#[tauri::command]
pub fn link_health(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<LinkUsage>, String> {
    let conn = db(&state)?;
    let stale_days = seed::read_settings(&conn)
        .map(|settings| settings.stale_link_days)
        .unwrap_or(90);

    usage::link_usage(&conn, &profile_id, stale_days).map_err(fail)
}

/// Applicazioni aperte di recente, per il widget "Recenti" della dashboard.
#[tauri::command]
pub fn recent_applications(
    state: State<'_, AppState>,
    profile_id: String,
    limit: Option<u32>,
) -> Result<Vec<ApplicationWithLinks>, String> {
    let conn = db(&state)?;
    let limit = limit.unwrap_or(8);

    let mut statement = conn
        .prepare(
            "SELECT a.id AS application_id
               FROM usage_events u
               JOIN links l ON l.id = u.entity_id
               JOIN applications a ON a.id = l.application_id
              WHERE u.entity_type = 'link' AND a.profile_id = ?1
              GROUP BY a.id
              ORDER BY MAX(u.opened_at) DESC
              LIMIT ?2",
        )
        .map_err(fail)?;

    let ids = statement
        .query_map(rusqlite::params![profile_id, limit], |row| {
            row.get::<_, String>("application_id")
        })
        .map_err(fail)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(fail)?;

    ids.into_iter()
        .map(|id| {
            let application = items::get_application(&conn, &id).map_err(fail)?;
            let links = items::list_links(&conn, &id).map_err(fail)?;
            Ok(ApplicationWithLinks { application, links })
        })
        .collect()
}

/// Applicazioni marcate come preferite, per il widget omonimo.
#[tauri::command]
pub fn favourite_applications(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<ApplicationWithLinks>, String> {
    let conn = db(&state)?;

    let mut statement = conn
        .prepare(
            "SELECT id FROM applications
              WHERE profile_id = ?1 AND is_favorite = 1
              ORDER BY sort_order, name",
        )
        .map_err(fail)?;

    let ids = statement
        .query_map([profile_id], |row| row.get::<_, String>(0))
        .map_err(fail)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(fail)?;

    ids.into_iter()
        .map(|id| {
            let application = items::get_application(&conn, &id).map_err(fail)?;
            let links = items::list_links(&conn, &id).map_err(fail)?;
            Ok(ApplicationWithLinks { application, links })
        })
        .collect()
}
