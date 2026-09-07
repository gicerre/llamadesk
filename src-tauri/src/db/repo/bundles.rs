//! Quick Workspaces: insiemi trasversali di link.
//!
//! Non fanno parte dell'albero perché non ne rispettano la logica: un
//! workspace "Standup del lunedì" può pescare un link dalla produzione di un
//! cliente, uno dal Jira di un altro e la mail aziendale. Per questo vivono in
//! tabelle proprie e referenziano i link per id.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};

use crate::db::repo::items;
use crate::db::seed::new_id;
use crate::domain::{Bundle, BundleWithLinks, Link};
use crate::services::ordering;

pub const TABLE: &str = "bundles";

pub fn map(row: &Row<'_>) -> rusqlite::Result<Bundle> {
    Ok(Bundle {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        name: row.get("name")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        is_temporary: row.get("is_temporary")?,
        expires_at: row.get("expires_at")?,
        open_delay_ms: row.get("open_delay_ms")?,
        sort_order: row.get("sort_order")?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Bundle> {
    conn.query_row("SELECT * FROM bundles WHERE id = ?1", [id], map)
        .map_err(|_| anyhow!("workspace non trovato: {id}"))
}

pub fn list(conn: &Connection, profile_id: &str) -> Result<Vec<BundleWithLinks>> {
    let bundles = {
        let mut statement =
            conn.prepare("SELECT * FROM bundles WHERE profile_id = ?1 ORDER BY sort_order, name")?;
        let rows = statement.query_map([profile_id], map)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    bundles
        .into_iter()
        .map(|bundle| {
            let links = links_of(conn, &bundle.id)?;
            Ok(BundleWithLinks { bundle, links })
        })
        .collect()
}

/// I link di un workspace, con l'ordine deciso dall'utente. Un link cancellato
/// sparisce da sé grazie alla foreign key `ON DELETE CASCADE`.
pub fn links_of(conn: &Connection, bundle_id: &str) -> Result<Vec<Link>> {
    let mut statement = conn.prepare(
        "SELECT l.* FROM bundle_items i
           JOIN links l ON l.id = i.link_id
          WHERE i.bundle_id = ?1
          ORDER BY i.sort_order",
    )?;
    let rows = statement.query_map([bundle_id], items::map_link)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create(
    conn: &Connection,
    profile_id: &str,
    name: &str,
    is_temporary: bool,
    expires_at: Option<&str>,
) -> Result<Bundle> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    let id = new_id();
    let sort_order = ordering::append(conn, TABLE, "profile_id", Some(profile_id))?;

    conn.execute(
        "INSERT INTO bundles (id, profile_id, name, is_temporary, expires_at, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, profile_id, name, is_temporary, expires_at, sort_order],
    )?;

    get(conn, &id)
}

pub fn update(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    icon: Option<&str>,
    open_delay_ms: Option<i64>,
) -> Result<Bundle> {
    let current = get(conn, id)?;
    let name = name
        .map(str::trim)
        .unwrap_or(current.name.as_str())
        .to_string();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    conn.execute(
        "UPDATE bundles SET name = ?1, icon = ?2, open_delay_ms = ?3 WHERE id = ?4",
        params![
            name,
            icon.map(str::to_string).or(current.icon),
            open_delay_ms.unwrap_or(current.open_delay_ms),
            id
        ],
    )?;

    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM bundles WHERE id = ?1", [id])?;
    Ok(())
}

pub fn add_link(conn: &Connection, bundle_id: &str, link_id: &str) -> Result<()> {
    let sort_order: f64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1000 FROM bundle_items WHERE bundle_id = ?1",
        [bundle_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO bundle_items (bundle_id, link_id, sort_order) VALUES (?1, ?2, ?3)",
        params![bundle_id, link_id, sort_order],
    )?;
    Ok(())
}

pub fn remove_link(conn: &Connection, bundle_id: &str, link_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM bundle_items WHERE bundle_id = ?1 AND link_id = ?2",
        params![bundle_id, link_id],
    )?;
    Ok(())
}

/// Riscrive l'ordine completo di un workspace dopo un drag & drop.
pub fn reorder(conn: &Connection, bundle_id: &str, ordered_link_ids: &[String]) -> Result<()> {
    for (index, link_id) in ordered_link_ids.iter().enumerate() {
        conn.execute(
            "UPDATE bundle_items SET sort_order = ?1 WHERE bundle_id = ?2 AND link_id = ?3",
            params![(index as f64 + 1.0) * 1000.0, bundle_id, link_id],
        )?;
    }
    Ok(())
}

/// Elimina i workspace temporanei scaduti. Chiamata a ogni avvio: un workspace
/// "per oggi" non deve sopravvivere alla settimana.
pub fn purge_expired(conn: &Connection) -> Result<usize> {
    Ok(conn.execute(
        "DELETE FROM bundles
          WHERE is_temporary = 1 AND expires_at IS NOT NULL AND expires_at < datetime('now')",
        [],
    )?)
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

        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO containers (id, profile_id, kind, name) VALUES ('c1', ?1, 'project', 'ACME')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO applications (id, profile_id, container_id, name) VALUES ('a1', ?1, 'c1', 'Jira')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO links (id, application_id, name, url) VALUES
             ('l1', 'a1', 'Board', 'https://jira.example/board'),
             ('l2', 'a1', 'Backlog', 'https://jira.example/backlog')",
            [],
        )
        .unwrap();

        (conn, profile)
    }

    #[test]
    fn collects_links_across_the_hierarchy() {
        let (conn, profile) = fixture();
        let bundle = create(&conn, &profile, "Standup", false, None).unwrap();

        add_link(&conn, &bundle.id, "l1").unwrap();
        add_link(&conn, &bundle.id, "l2").unwrap();
        add_link(&conn, &bundle.id, "l1").unwrap(); // doppione ignorato

        assert_eq!(links_of(&conn, &bundle.id).unwrap().len(), 2);
    }

    #[test]
    fn deleting_a_link_removes_it_from_every_workspace() {
        let (conn, profile) = fixture();
        let bundle = create(&conn, &profile, "Standup", false, None).unwrap();
        add_link(&conn, &bundle.id, "l1").unwrap();

        conn.execute("DELETE FROM links WHERE id = 'l1'", []).unwrap();

        assert!(links_of(&conn, &bundle.id).unwrap().is_empty());
    }

    #[test]
    fn reordering_persists_the_new_sequence() {
        let (conn, profile) = fixture();
        let bundle = create(&conn, &profile, "Standup", false, None).unwrap();
        add_link(&conn, &bundle.id, "l1").unwrap();
        add_link(&conn, &bundle.id, "l2").unwrap();

        reorder(&conn, &bundle.id, &["l2".into(), "l1".into()]).unwrap();

        let ids: Vec<_> = links_of(&conn, &bundle.id)
            .unwrap()
            .into_iter()
            .map(|link| link.id)
            .collect();
        assert_eq!(ids, vec!["l2", "l1"]);
    }

    #[test]
    fn expired_temporary_workspaces_are_purged_but_permanent_ones_stay() {
        let (conn, profile) = fixture();

        create(&conn, &profile, "Permanente", false, None).unwrap();
        create(&conn, &profile, "Scaduto", true, Some("2000-01-01 00:00:00")).unwrap();
        create(&conn, &profile, "Ancora valido", true, Some("2999-01-01 00:00:00")).unwrap();

        assert_eq!(purge_expired(&conn).unwrap(), 1);

        let names: Vec<_> = list(&conn, &profile)
            .unwrap()
            .into_iter()
            .map(|entry| entry.bundle.name)
            .collect();
        assert_eq!(names.len(), 2);
        assert!(!names.contains(&"Scaduto".to_string()));
    }
}
