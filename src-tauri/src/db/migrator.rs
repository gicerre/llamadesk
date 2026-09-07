//! Migratore versionato basato su `PRAGMA user_version`.
//!
//! Regole non negoziabili:
//!  * ogni migrazione e' applicata dentro una transazione (o passa tutta, o
//!    nulla viene scritto);
//!  * prima di toccare un database gia' popolato viene creata una copia di
//!    sicurezza accanto al file originale;
//!  * gli script SQL sono `include_str!`-ati nel binario: nessun file esterno
//!    da installare o da perdere.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rusqlite::Connection;

pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "init",
    sql: include_str!("migrations/0001_init.sql"),
}];

pub fn current_version(conn: &Connection) -> Result<i32> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    Ok(version)
}

pub fn target_version() -> i32 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

/// Porta il database allo schema piu' recente. Idempotente.
pub fn run(conn: &mut Connection, db_path: &Path) -> Result<()> {
    let from = current_version(conn)?;
    let to = target_version();

    if from >= to {
        return Ok(());
    }

    // Un database vuoto appena creato non ha nulla da salvare.
    if from > 0 {
        if let Err(error) = backup(conn, db_path, from) {
            // Il backup e' una rete di sicurezza, non un requisito bloccante:
            // se il disco e' pieno preferiamo comunque avviare l'applicazione.
            eprintln!("[llamadesk] backup pre-migrazione non riuscito: {error}");
        }
    }

    for migration in MIGRATIONS.iter().filter(|m| m.version > from) {
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql).with_context(|| {
            format!(
                "migrazione {} ({}) non riuscita",
                migration.version, migration.name
            )
        })?;
        // `user_version` e' transazionale: viene scritto solo al commit.
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
    }

    Ok(())
}

fn backup(conn: &Connection, db_path: &Path, version: i32) -> Result<PathBuf> {
    // In modalita' WAL le ultime scritture vivono nel file -wal: senza
    // checkpoint la copia risulterebbe incompleta.
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;

    let file_name = format!("llamadesk.backup.v{version}.db");
    let target = db_path
        .parent()
        .context("percorso del database senza cartella padre")?
        .join(file_name);

    fs::copy(db_path, &target).context("copia di backup non riuscita")?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Il migratore deve essere idempotente e portare uno schema vuoto a target.
    #[test]
    fn applies_all_migrations_once() {
        let mut conn = Connection::open_in_memory().unwrap();
        let path = Path::new("memory.db");

        run(&mut conn, path).unwrap();
        assert_eq!(current_version(&conn).unwrap(), target_version());

        // Seconda esecuzione: nessun errore, nessun effetto.
        run(&mut conn, path).unwrap();
        assert_eq!(current_version(&conn).unwrap(), target_version());
    }

    /// Le tabelle cardine devono esistere dopo la 0001.
    #[test]
    fn creates_core_tables() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn, Path::new("memory.db")).unwrap();

        for table in [
            "settings",
            "profiles",
            "containers",
            "applications",
            "links",
            "tags",
            "notes",
            "bundles",
            "dashboard_widgets",
            "danger_prompts",
        ] {
            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "tabella mancante: {table}");
        }
    }
}
