//! Profili: istanze completamente separate della stessa applicazione.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};

use crate::db::repo::library;
use crate::db::seed::new_id;
use crate::domain::{Profile, ProfileDeleteImpact};

pub fn map(row: &Row<'_>) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get("id")?,
        name: row.get("name")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        background_id: row.get("background_id")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Profile> {
    conn.query_row("SELECT * FROM profiles WHERE id = ?1", [id], map)
        .map_err(|_| anyhow!("profilo non trovato: {id}"))
}

pub fn list(conn: &Connection) -> Result<Vec<Profile>> {
    let mut statement = conn.prepare("SELECT * FROM profiles ORDER BY sort_order, created_at")?;
    let rows = statement.query_map([], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create(conn: &Connection, name: &str, icon: Option<&str>) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome del profilo non puo' essere vuoto"));
    }

    let id = new_id();
    let sort_order: f64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1000 FROM profiles",
        [],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT INTO profiles (id, name, icon, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, icon, sort_order],
    )?;

    get(conn, &id)
}

pub fn rename(conn: &Connection, id: &str, name: &str) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome del profilo non puo' essere vuoto"));
    }

    conn.execute(
        "UPDATE profiles SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![name, id],
    )?;

    get(conn, id)
}

/// Quanto contiene un profilo: serve al testo della conferma di eliminazione.
pub fn delete_impact(conn: &Connection, id: &str) -> Result<ProfileDeleteImpact> {
    get(conn, id)?;

    let count = |sql: &str| -> Result<i64> { Ok(conn.query_row(sql, [id], |row| row.get(0))?) };

    Ok(ProfileDeleteImpact {
        containers: count("SELECT COUNT(*) FROM containers WHERE profile_id = ?1")?,
        applications: count("SELECT COUNT(*) FROM applications WHERE profile_id = ?1")?,
        links: count(
            "SELECT COUNT(*) FROM links
              WHERE application_id IN (SELECT id FROM applications WHERE profile_id = ?1)",
        )?,
        bundles: count("SELECT COUNT(*) FROM bundles WHERE profile_id = ?1")?,
    })
}

/// Elimina un profilo con tutto quello che contiene.
///
/// L'ultimo profilo non si elimina: senza un contesto l'applicazione non ha
/// niente da mostrare. Le foreign key portano via contenitori, applicazioni,
/// link, workspace, tag, widget e override delle impostazioni; note e
/// associazioni ai tag sono polimorfiche e le ripuliamo qui, subito, invece
/// di lasciarle al prossimo avvio.
pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?;

    let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))?;
    if remaining <= 1 {
        return Err(anyhow!("l'ultimo profilo non si puo' eliminare"));
    }

    conn.execute("DELETE FROM profiles WHERE id = ?1", [id])?;
    library::prune_orphans(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, seed};
    use std::path::Path;

    fn fixture() -> (Connection, String) {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        seed::ensure_seed(&mut conn, "en-US").unwrap();

        let first: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();
        (conn, first)
    }

    /// Un ramo completo dentro `profile`: progetto, applicazione, due link,
    /// un workspace, un tag, due note e un override del tema. Gli id hanno il
    /// prefisso indicato.
    fn populate(conn: &Connection, profile: &str, prefix: &str) {
        conn.execute_batch(&format!(
            "INSERT INTO containers (id, profile_id, kind, name)
               VALUES ('{prefix}c', '{profile}', 'project', 'ACME');
             INSERT INTO applications (id, profile_id, container_id, name)
               VALUES ('{prefix}a', '{profile}', '{prefix}c', 'Camunda');
             INSERT INTO links (id, application_id, name, url) VALUES
               ('{prefix}l1', '{prefix}a', 'Admin', 'https://a.example'),
               ('{prefix}l2', '{prefix}a', 'Tasklist', 'https://t.example');
             INSERT INTO bundles (id, profile_id, name) VALUES ('{prefix}b', '{profile}', 'Mattina');
             INSERT INTO tags (id, profile_id, name) VALUES ('{prefix}t', '{profile}', 'crm');
             INSERT INTO taggables (tag_id, entity_type, entity_id)
               VALUES ('{prefix}t', 'container', '{prefix}c');
             INSERT INTO notes (id, entity_type, entity_id, content) VALUES
               ('{prefix}n1', 'container', '{prefix}c', 'nota'),
               ('{prefix}n2', 'profile', '{profile}', 'nota del profilo');
             INSERT INTO profile_settings (profile_id, key, value)
               VALUES ('{profile}', 'theme', '\"dark\"');"
        ))
        .unwrap();
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn the_last_profile_cannot_be_deleted() {
        let (conn, only) = fixture();

        assert!(delete(&conn, &only).is_err());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM profiles"), 1);
    }

    #[test]
    fn impact_counts_what_the_profile_contains() {
        let (conn, first) = fixture();
        populate(&conn, &first, "x");

        let impact = delete_impact(&conn, &first).unwrap();
        assert_eq!(
            (
                impact.containers,
                impact.applications,
                impact.links,
                impact.bundles
            ),
            (1, 1, 2, 1)
        );
    }

    #[test]
    fn deleting_a_profile_takes_its_data_and_nothing_else() {
        let (conn, first) = fixture();
        let second = create(&conn, "Lavoro", None).unwrap().id;
        populate(&conn, &first, "keep-");
        populate(&conn, &second, "drop-");

        delete(&conn, &second).unwrap();

        // Tutto il ramo del profilo eliminato e' sparito, note e tag compresi...
        for table in ["containers", "applications", "bundles", "tags", "notes"] {
            let leftovers = count(
                &conn,
                &format!("SELECT COUNT(*) FROM {table} WHERE id LIKE 'drop-%'"),
            );
            assert_eq!(leftovers, 0, "{table} del profilo eliminato");
        }
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM links WHERE id LIKE 'drop-%'"),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM taggables WHERE entity_id LIKE 'drop-%'"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                &format!("SELECT COUNT(*) FROM profile_settings WHERE profile_id = '{second}'")
            ),
            0
        );

        // ...e quello dell'altro profilo e' intatto.
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM links WHERE id LIKE 'keep-%'"),
            2
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM notes WHERE id LIKE 'keep-%'"),
            2
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM taggables WHERE entity_id LIKE 'keep-%'"
            ),
            1
        );
    }
}
