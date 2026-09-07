//! L'API che React vede.
//!
//! Nessun SQL vive nel frontend: passa tutto da qui, dove le regole critiche
//! (validazione URL, Danger Zone, migrazioni, duplicazione) sono testabili con
//! `cargo test`. Ogni modulo copre un'area funzionale.

pub mod app;
pub mod data;
pub mod discover;
pub mod items;
pub mod library;
pub mod open;
pub mod tree;
pub mod workspaces;

use std::sync::MutexGuard;

use crate::AppState;

/// Gli errori risalgono al frontend come stringhe gia' leggibili.
pub fn fail<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

/// Accesso alla connessione condivisa, con errore uniforme.
pub fn db(state: &AppState) -> Result<MutexGuard<'_, rusqlite::Connection>, String> {
    state.db.lock().map_err(fail)
}
