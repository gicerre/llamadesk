//! Accesso ai dati, organizzato per aggregato.
//!
//! Nessuna query SQL vive fuori da `db`: i comandi Tauri orchestrano, i
//! repository parlano con SQLite, i servizi applicano le regole.

pub mod library;
pub mod nodes;
pub mod profiles;
pub mod workspaces;
