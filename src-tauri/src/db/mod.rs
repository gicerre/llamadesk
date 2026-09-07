//! Apertura e preparazione del database locale.
//!
//! Il file vive nella cartella dati dell'utente (`%APPDATA%\com.llamadesk.app`)
//! e MAI nella cartella di installazione: cosi' sopravvive ad aggiornamenti,
//! disinstallazioni e reinstallazioni.

pub mod migrator;
pub mod repo;
pub mod seed;

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub const DB_FILE_NAME: &str = "llamadesk.db";

/// Percorso del database, creando la cartella dati se non esiste ancora.
pub fn database_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("impossibile determinare la cartella dati dell'utente")?;

    fs::create_dir_all(&dir)
        .with_context(|| format!("impossibile creare la cartella dati {}", dir.display()))?;

    Ok(dir.join(DB_FILE_NAME))
}

/// Apre la connessione, applica le PRAGMA e porta lo schema all'ultima versione.
/// Al primissimo avvio crea anche il profilo iniziale.
pub fn initialize(app: &AppHandle) -> Result<(Connection, PathBuf)> {
    let path = database_path(app)?;

    let mut conn = Connection::open(&path)
        .with_context(|| format!("impossibile aprire il database {}", path.display()))?;

    // WAL: letture e scritture non si bloccano a vicenda, e un crash non
    // corrompe il file. La query_row e' obbligatoria perche' questa PRAGMA
    // restituisce una riga.
    let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.busy_timeout(Duration::from_secs(5))?;

    migrator::run(&mut conn, &path)?;

    let locale = sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string());
    seed::ensure_seed(&mut conn, &locale)?;

    Ok((conn, path))
}
