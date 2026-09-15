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

    // Un ripristino chiesto nella sessione precedente si applica ora, prima
    // di aprire il file. Se il backup non e' valido si prosegue con il database attuale.
    if let Err(error) = crate::services::backup::apply_staged_restore(&path) {
        eprintln!("[llamadesk] ripristino non applicato: {error}");
    }

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

/// Esegue `work` dentro un SAVEPOINT: o passano tutte le scritture o nessuna.
/// Funziona anche dentro una transazione gia' aperta, quindi i servizi possono
/// comporsi senza sapere chi li chiama.
pub fn atomic<T>(conn: &Connection, work: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    conn.execute_batch("SAVEPOINT atomic")?;
    match work(conn) {
        Ok(value) => {
            conn.execute_batch("RELEASE atomic")?;
            Ok(value)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK TO atomic; RELEASE atomic");
            Err(error)
        }
    }
}

/// Database in memoria e costruttori di nodi per i test.
#[cfg(test)]
pub mod testing {
    use std::path::Path;

    use rusqlite::Connection;

    use crate::domain::{NewNode, NodeKind};
    use crate::services::hierarchy;

    /// Database migrato con il profilo del primo avvio. Restituisce l'id del profilo.
    pub fn database() -> (Connection, String) {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        super::migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        super::seed::ensure_seed(&mut conn, "it-IT").unwrap();
        let profile = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |row| row.get(0))
            .unwrap();
        (conn, profile)
    }

    pub fn workspace(conn: &Connection, profile: &str, name: &str) -> String {
        hierarchy::create(
            conn,
            profile,
            None,
            &NewNode::named(NodeKind::Workspace, name),
            None,
        )
        .unwrap()
        .id
    }

    /// Crea un figlio in coda; link e percorsi ricevono un valore fittizio.
    pub fn child(
        conn: &Connection,
        profile: &str,
        parent: &str,
        kind: NodeKind,
        name: &str,
    ) -> String {
        let mut input = NewNode::named(kind, name);
        match kind {
            NodeKind::Link => input.url = Some(format!("https://example.com/{name}")),
            NodeKind::Path => input.path = Some(format!("C:\\dev\\{name}")),
            _ => {}
        }
        hierarchy::create(conn, profile, Some(parent), &input, None)
            .unwrap()
            .id
    }
}
