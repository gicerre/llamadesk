//! Sfondi.
//!
//! Sono il vero motore del glassmorphism: su Windows `backdrop-filter` non puo'
//! sfocare il desktop dietro la finestra, quindi lo strato che i pannelli in
//! vetro campionano e' questo, dentro l'applicazione.
//!
//! I file scelti dall'utente vengono COPIATI nella cartella dati: se domani
//! l'immagine originale viene spostata o cancellata, lo sfondo resta.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};

use crate::db::seed::new_id;
use crate::domain::Background;
use crate::services::backup::map_background;

pub fn list(conn: &Connection) -> Result<Vec<Background>> {
    let mut statement = conn.prepare("SELECT * FROM backgrounds ORDER BY created_at DESC")?;
    let rows = statement.query_map([], map_background)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get(conn: &Connection, id: &str) -> Result<Background> {
    conn.query_row("SELECT * FROM backgrounds WHERE id = ?1", [id], map_background)
        .map_err(|_| anyhow!("sfondo non trovato: {id}"))
}

pub fn create(conn: &Connection, name: &str, source: &str, value: &str) -> Result<Background> {
    if !matches!(source, "builtin" | "file" | "gradient" | "solid") {
        return Err(anyhow!("sorgente di sfondo non valida: {source}"));
    }

    let id = new_id();
    conn.execute(
        "INSERT INTO backgrounds (id, name, source, value) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, source, value],
    )?;

    get(conn, &id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM backgrounds WHERE id = ?1", [id])?;
    Ok(())
}
