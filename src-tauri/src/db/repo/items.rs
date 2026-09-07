//! Applicazioni e link: le foglie della gerarchia.
//!
//! Un'applicazione e' l'entita' logica ("Camunda"); i link sono le destinazioni
//! concrete ("Admin", "Tasklist", "Operate"). La card della UI mostra
//! l'applicazione, i chip mostrano i link.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};

use crate::db::repo::containers;
use crate::db::seed::new_id;
use crate::domain::{Application, ApplicationWithLinks, Link};
use crate::services::{opener, ordering};

pub const APPLICATIONS: &str = "applications";
pub const LINKS: &str = "links";

/* ------------------------------------------------------------ applicazioni */

pub fn map_application(row: &Row<'_>) -> rusqlite::Result<Application> {
    Ok(Application {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        container_id: row.get("container_id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        danger_level: row.get("danger_level")?,
        danger_prompt_id: row.get("danger_prompt_id")?,
        is_favorite: row.get("is_favorite")?,
        sort_order: row.get("sort_order")?,
    })
}

pub fn get_application(conn: &Connection, id: &str) -> Result<Application> {
    conn.query_row(
        "SELECT * FROM applications WHERE id = ?1",
        [id],
        map_application,
    )
    .map_err(|_| anyhow!("applicazione non trovata: {id}"))
}

pub fn list_applications(conn: &Connection, container_id: &str) -> Result<Vec<Application>> {
    let mut statement = conn.prepare(
        "SELECT * FROM applications WHERE container_id = ?1 ORDER BY sort_order, name",
    )?;
    let rows = statement.query_map([container_id], map_application)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Applicazioni di un contenitore, ciascuna con i propri link.
pub fn list_applications_with_links(
    conn: &Connection,
    container_id: &str,
) -> Result<Vec<ApplicationWithLinks>> {
    list_applications(conn, container_id)?
        .into_iter()
        .map(|application| {
            let links = list_links(conn, &application.id)?;
            Ok(ApplicationWithLinks { application, links })
        })
        .collect()
}

pub fn create_application(
    conn: &Connection,
    profile_id: &str,
    container_id: &str,
    name: &str,
) -> Result<Application> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    let id = new_id();
    let sort_order = ordering::append(conn, APPLICATIONS, "container_id", Some(container_id))?;

    conn.execute(
        "INSERT INTO applications (id, profile_id, container_id, name, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, profile_id, container_id, name, sort_order],
    )?;

    get_application(conn, &id)
}

#[allow(clippy::too_many_arguments)]
pub fn update_application(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
    icon: Option<&str>,
    color: Option<&str>,
    danger_level: Option<&str>,
    is_favorite: Option<bool>,
) -> Result<Application> {
    let current = get_application(conn, id)?;
    let danger_level =
        containers::resolve_level_update(danger_level, current.danger_level.clone());
    let name = name
        .map(str::trim)
        .unwrap_or(current.name.as_str())
        .to_string();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    conn.execute(
        "UPDATE applications SET
           name = ?1, description = ?2, icon = ?3, color = ?4,
           danger_level = ?5, is_favorite = ?6, updated_at = datetime('now')
         WHERE id = ?7",
        params![
            name,
            description.map(str::to_string).or(current.description),
            icon.map(str::to_string).or(current.icon),
            color.map(str::to_string).or(current.color),
            danger_level,
            is_favorite.unwrap_or(current.is_favorite),
            id
        ],
    )?;

    get_application(conn, id)
}

pub fn move_application(
    conn: &Connection,
    id: &str,
    container_id: &str,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<Application> {
    let sort_order = ordering::place(
        conn,
        APPLICATIONS,
        "container_id",
        Some(container_id),
        previous_id,
        next_id,
    )?;

    conn.execute(
        "UPDATE applications SET container_id = ?1, sort_order = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        params![container_id, sort_order, id],
    )?;

    get_application(conn, id)
}

pub fn delete_application(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM applications WHERE id = ?1", [id])?;
    Ok(())
}

/* ------------------------------------------------------------------- link */

pub fn map_link(row: &Row<'_>) -> rusqlite::Result<Link> {
    Ok(Link {
        id: row.get("id")?,
        application_id: row.get("application_id")?,
        name: row.get("name")?,
        url: row.get("url")?,
        kind: row.get("kind")?,
        description: row.get("description")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        danger_level: row.get("danger_level")?,
        danger_prompt_id: row.get("danger_prompt_id")?,
        is_favorite: row.get("is_favorite")?,
        is_default: row.get("is_default")?,
        sort_order: row.get("sort_order")?,
    })
}

pub fn get_link(conn: &Connection, id: &str) -> Result<Link> {
    conn.query_row("SELECT * FROM links WHERE id = ?1", [id], map_link)
        .map_err(|_| anyhow!("link non trovato: {id}"))
}

pub fn list_links(conn: &Connection, application_id: &str) -> Result<Vec<Link>> {
    let mut statement = conn.prepare(
        "SELECT * FROM links WHERE application_id = ?1 ORDER BY is_default DESC, sort_order, name",
    )?;
    let rows = statement.query_map([application_id], map_link)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create_link(
    conn: &Connection,
    application_id: &str,
    name: &str,
    url: &str,
    kind: &str,
) -> Result<Link> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }
    // L'URL viene validato all'inserimento, non solo all'apertura: un dato
    // sbagliato non deve nemmeno entrare nel database.
    let url = opener::validate(url)?;

    let existing = list_links(conn, application_id)?;
    let id = new_id();
    let sort_order = ordering::append(conn, LINKS, "application_id", Some(application_id))?;

    conn.execute(
        "INSERT INTO links (id, application_id, name, url, kind, is_default, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            application_id,
            name,
            url,
            kind,
            // Il primo link di un'applicazione diventa quello aperto dal click.
            existing.is_empty(),
            sort_order
        ],
    )?;

    get_link(conn, &id)
}

#[allow(clippy::too_many_arguments)]
pub fn update_link(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    url: Option<&str>,
    kind: Option<&str>,
    description: Option<&str>,
    icon: Option<&str>,
    danger_level: Option<&str>,
    is_favorite: Option<bool>,
    is_default: Option<bool>,
) -> Result<Link> {
    let current = get_link(conn, id)?;
    let danger_level =
        containers::resolve_level_update(danger_level, current.danger_level.clone());

    let name = name
        .map(str::trim)
        .unwrap_or(current.name.as_str())
        .to_string();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    let url = match url {
        Some(value) => opener::validate(value)?,
        None => current.url.clone(),
    };

    // Un solo link predefinito per applicazione.
    if is_default == Some(true) {
        conn.execute(
            "UPDATE links SET is_default = 0 WHERE application_id = ?1",
            [&current.application_id],
        )?;
    }

    conn.execute(
        "UPDATE links SET
           name = ?1, url = ?2, kind = ?3, description = ?4, icon = ?5,
           danger_level = ?6, is_favorite = ?7, is_default = ?8, updated_at = datetime('now')
         WHERE id = ?9",
        params![
            name,
            url,
            kind.map(str::to_string).unwrap_or(current.kind),
            description.map(str::to_string).or(current.description),
            icon.map(str::to_string).or(current.icon),
            danger_level,
            is_favorite.unwrap_or(current.is_favorite),
            is_default.unwrap_or(current.is_default),
            id
        ],
    )?;

    get_link(conn, id)
}

pub fn move_link(
    conn: &Connection,
    id: &str,
    application_id: &str,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<Link> {
    let sort_order = ordering::place(
        conn,
        LINKS,
        "application_id",
        Some(application_id),
        previous_id,
        next_id,
    )?;

    conn.execute(
        "UPDATE links SET application_id = ?1, sort_order = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        params![application_id, sort_order, id],
    )?;

    get_link(conn, id)
}

pub fn delete_link(conn: &Connection, id: &str) -> Result<()> {
    let link = get_link(conn, id)?;
    conn.execute("DELETE FROM links WHERE id = ?1", [id])?;

    // Se abbiamo eliminato il link predefinito, ne promuoviamo un altro:
    // altrimenti il click sulla card non aprirebbe piu' nulla.
    if link.is_default {
        if let Some(next) = list_links(conn, &link.application_id)?.first() {
            conn.execute("UPDATE links SET is_default = 1 WHERE id = ?1", [&next.id])?;
        }
    }
    Ok(())
}
