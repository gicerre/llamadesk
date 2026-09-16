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

/// Le versioni 1 e 2 appartenevano a LlamaDesk 1 (tag git `legacy-v1`): la 3
/// le sostituisce con lo schema della riprogettazione. Un database nuovo parte
/// direttamente dalla 3.
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 3,
        name: "schema_v2",
        sql: include_str!("migrations/0003_schema_v2.sql"),
    },
    Migration {
        version: 4,
        name: "profile_avatar",
        sql: include_str!("migrations/0004_profile_avatar.sql"),
    },
];

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

    fn table_exists(conn: &Connection, table: &str) -> bool {
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        count == 1
    }

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

    #[test]
    fn creates_core_tables() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn, Path::new("memory.db")).unwrap();

        for table in [
            "settings",
            "assets",
            "profiles",
            "profile_settings",
            "tools",
            "nodes",
            "edges",
            "allowed_children",
            "launch_steps",
            "profile_workspaces",
            "favorites",
            "usage_events",
            "tool_preferences",
            "tags",
            "node_tags",
        ] {
            assert!(table_exists(&conn, table), "tabella mancante: {table}");
        }
    }

    /// Un database di LlamaDesk 1 (versione 2) viene sostituito, non convertito:
    /// le tabelle legacy spariscono anche con le foreign key attive.
    #[test]
    fn replaces_a_legacy_database() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE backgrounds (id TEXT PRIMARY KEY);
             CREATE TABLE profiles (id TEXT PRIMARY KEY,
               background_id TEXT REFERENCES backgrounds(id));
             CREATE TABLE containers (id TEXT PRIMARY KEY,
               profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
               parent_id TEXT REFERENCES containers(id) ON DELETE CASCADE);
             CREATE TABLE applications (id TEXT PRIMARY KEY,
               container_id TEXT NOT NULL REFERENCES containers(id) ON DELETE CASCADE);
             CREATE TABLE links (id TEXT PRIMARY KEY,
               application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE);
             INSERT INTO backgrounds VALUES ('b');
             INSERT INTO profiles VALUES ('p', 'b');
             INSERT INTO containers VALUES ('c', 'p', NULL);
             INSERT INTO applications VALUES ('a', 'c');
             INSERT INTO links VALUES ('l', 'a');
             INSERT INTO settings VALUES ('theme', '\"dark\"');
             PRAGMA user_version = 2;",
        )
        .unwrap();

        run(&mut conn, Path::new("memory.db")).unwrap();

        assert_eq!(current_version(&conn).unwrap(), target_version());
        for legacy in ["containers", "applications", "links", "backgrounds"] {
            assert!(
                !table_exists(&conn, legacy),
                "tabella legacy rimasta: {legacy}"
            );
        }
        let settings: i32 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(settings, 0, "le impostazioni v1 non devono sopravvivere");
    }
}
