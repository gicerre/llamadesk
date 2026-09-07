//! Profili: istanze completamente separate della stessa applicazione.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};

use crate::db::seed::new_id;
use crate::domain::Profile;

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

/// Cambia lo sfondo di un profilo. `None` torna allo sfondo globale.
pub fn set_background(conn: &Connection, id: &str, background_id: Option<&str>) -> Result<Profile> {
    conn.execute(
        "UPDATE profiles SET background_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![background_id, id],
    )?;
    get(conn, id)
}
