//! L'API che React vede.
//!
//! Nessun SQL vive nel frontend: passa tutto da qui, dove le regole critiche
//! (validazione URL, gerarchia, ereditarieta', migrazioni) sono testabili con
//! `cargo test`. Ogni modulo copre un'area funzionale.

pub mod actions;
pub mod app;
pub mod assets;
pub mod backup;
pub mod launch;
pub mod library;
pub mod nodes;
pub mod paths;
pub mod protection;
pub mod search;
pub mod workspaces;

use std::sync::MutexGuard;

use crate::AppState;

/// Gli errori risalgono al frontend come stringhe gia' leggibili.
pub fn fail<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

/// Il cancello della protezione per un profilo (quello attivo se non indicato):
/// dice se la sessione e' sbloccata, applicando il blocco per inattivita'.
pub fn gate(
    state: &AppState,
    conn: &rusqlite::Connection,
    profile_id: Option<&str>,
) -> Result<crate::services::protection::Gate, String> {
    let profile = match profile_id {
        Some(profile) => profile.to_string(),
        None => crate::db::seed::read_settings(conn)
            .map_err(fail)?
            .active_profile_id
            .unwrap_or_default(),
    };
    let auto_minutes = crate::db::repo::profiles::get(conn, &profile)
        .map(|profile| profile.lock_auto_minutes)
        .unwrap_or(0);
    let unlocked = state.lock.lock().map_err(fail)?.is_unlocked(
        &profile,
        auto_minutes,
        std::time::Instant::now(),
    );
    Ok(crate::services::protection::Gate { unlocked })
}

/// Accesso alla connessione condivisa, con errore uniforme.
pub fn db(state: &AppState) -> Result<MutexGuard<'_, rusqlite::Connection>, String> {
    state.db.lock().map_err(fail)
}
