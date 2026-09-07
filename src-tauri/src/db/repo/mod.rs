//! Accesso ai dati, organizzato per aggregato.
//!
//! Nessuna query SQL vive fuori da qui: i comandi Tauri orchestrano, i
//! repository parlano con SQLite.

pub mod backgrounds;
pub mod bundles;
pub mod containers;
pub mod items;
pub mod library;
pub mod profiles;
pub mod search;
pub mod usage;
