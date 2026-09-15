//! Accesso ai nodi e alle loro relazioni.
//!
//! Qui vivono solo letture e scritture elementari. Le regole (chi puo'
//! contenere chi, condivisione, cicli, cancellazione) stanno in
//! `services::hierarchy`, che e' l'unico a chiamare le funzioni di scrittura.
//!
//! Tutte le letture escludono i nodi nel cestino (`deleted_at`), cosi' nessun
//! chiamante puo' dimenticarsene.

use std::collections::HashMap;

use anyhow::{anyhow, Result};
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use crate::db::seed::new_id;
use crate::domain::{NewNode, Node, NodeEntry, NodeKind, NodePatch};
use crate::services::opener;

pub fn map(row: &Row<'_>) -> rusqlite::Result<Node> {
    Ok(Node {
        id: row.get("id")?,
        kind: row.get("kind")?,
        name: row.get("name")?,
        description: row.get("description")?,
        aliases: row.get("aliases")?,
        icon: row.get("icon")?,
        color_main: row.get("color_main")?,
        color_secondary: row.get("color_secondary")?,
        cover_asset_id: row.get("cover_asset_id")?,
        cover_focus_x: row.get("cover_focus_x")?,
        cover_focus_y: row.get("cover_focus_y")?,
        is_protected: row.get("is_protected")?,
        caution: row.get("caution")?,
        url: row.get("url")?,
        path: row.get("path")?,
        enabled: row.get("enabled")?,
        open_mode: row.get("open_mode")?,
        browser_tool_id: row.get("browser_tool_id")?,
        browser_profile: row.get("browser_profile")?,
        created_by_profile_id: row.get("created_by_profile_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Node> {
    conn.query_row(
        "SELECT * FROM nodes WHERE id = ?1 AND deleted_at IS NULL",
        [id],
        map,
    )
    .optional()?
    .ok_or_else(|| anyhow!("elemento non trovato: {id}"))
}

/* ---------------------------------------------------------------- scrittura */

fn clean_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }
    Ok(name.to_string())
}

fn clean_optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn clean_path(path: &str) -> Result<String> {
    let path = path.trim().trim_matches('"').trim();
    if path.is_empty() {
        return Err(anyhow!("il percorso non puo' essere vuoto"));
    }
    Ok(path.to_string())
}

/// Inserisce il nodo senza collegarlo a nessun padre.
pub fn insert(conn: &Connection, input: &NewNode, created_by: Option<&str>) -> Result<Node> {
    let name = clean_name(&input.name)?;

    let url = match (input.kind, &input.url) {
        (NodeKind::Link, Some(url)) => Some(opener::validate(url)?),
        (NodeKind::Link, None) => return Err(anyhow!("un link richiede un indirizzo")),
        (_, Some(_)) => return Err(anyhow!("solo un link ha un indirizzo")),
        (_, None) => None,
    };

    let path = match (input.kind, &input.path) {
        (NodeKind::Path, Some(path)) => Some(clean_path(path)?),
        (NodeKind::Path, None) => return Err(anyhow!("un percorso locale richiede un percorso")),
        (_, Some(_)) => return Err(anyhow!("solo un percorso locale ha un percorso")),
        (_, None) => None,
    };

    let id = new_id();
    conn.execute(
        "INSERT INTO nodes (id, kind, name, description, icon, color_main, url, path, created_by_profile_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            input.kind,
            name,
            clean_optional(&input.description),
            clean_optional(&input.icon),
            clean_optional(&input.color_main),
            url,
            path,
            created_by,
        ],
    )?;

    get(conn, &id)
}

/// Applica una modifica parziale. I campi specifici di un tipo vengono
/// rifiutati sugli altri con un messaggio leggibile, prima del CHECK SQL.
pub fn update(conn: &Connection, id: &str, patch: &NodePatch) -> Result<Node> {
    let node = get(conn, id)?;
    let mut sets: Vec<(&str, Value)> = Vec::new();

    let text = |value: &Option<String>| -> Value {
        clean_optional(value)
            .map(Value::Text)
            .unwrap_or(Value::Null)
    };

    if let Some(name) = &patch.name {
        sets.push(("name", Value::Text(clean_name(name)?)));
    }
    if let Some(value) = &patch.description {
        sets.push(("description", text(value)));
    }
    if let Some(value) = &patch.aliases {
        sets.push(("aliases", text(value)));
    }
    if let Some(value) = &patch.icon {
        sets.push(("icon", text(value)));
    }
    if let Some(value) = &patch.color_main {
        sets.push(("color_main", text(value)));
    }
    if let Some(value) = &patch.color_secondary {
        sets.push(("color_secondary", text(value)));
    }
    if let Some(value) = &patch.cover_asset_id {
        if value.is_some() && !matches!(node.kind, NodeKind::Workspace | NodeKind::Project) {
            return Err(anyhow!("solo workspace e progetti hanno una cover"));
        }
        sets.push(("cover_asset_id", text(value)));
    }
    for (column, value) in [
        ("cover_focus_x", patch.cover_focus_x),
        ("cover_focus_y", patch.cover_focus_y),
    ] {
        if let Some(value) = value {
            sets.push((column, Value::Real(value.clamp(0.0, 1.0))));
        }
    }
    if let Some(value) = patch.is_protected {
        sets.push(("is_protected", Value::Integer(value.into())));
    }
    if let Some(value) = patch.caution {
        sets.push((
            "caution",
            value
                .map(|level| Value::Text(level.as_str().into()))
                .unwrap_or(Value::Null),
        ));
    }
    if let Some(url) = &patch.url {
        if node.kind != NodeKind::Link {
            return Err(anyhow!("solo un link ha un indirizzo"));
        }
        sets.push(("url", Value::Text(opener::validate(url)?)));
    }
    if let Some(path) = &patch.path {
        if node.kind != NodeKind::Path {
            return Err(anyhow!("solo un percorso locale ha un percorso"));
        }
        sets.push(("path", Value::Text(clean_path(path)?)));
    }
    if let Some(value) = patch.enabled {
        sets.push(("enabled", Value::Integer(value.into())));
    }

    let opening = patch.open_mode.is_some()
        || patch.browser_tool_id.is_some()
        || patch.browser_profile.is_some();
    if opening && !matches!(node.kind, NodeKind::Link | NodeKind::LinkGroup) {
        return Err(anyhow!(
            "la modalita' di apertura vale solo per link e gruppi"
        ));
    }
    if let Some(value) = patch.open_mode {
        sets.push((
            "open_mode",
            value
                .map(|mode| Value::Text(mode.as_str().into()))
                .unwrap_or(Value::Null),
        ));
    }
    if let Some(value) = &patch.browser_tool_id {
        sets.push(("browser_tool_id", text(value)));
    }
    if let Some(value) = &patch.browser_profile {
        sets.push(("browser_profile", text(value)));
    }

    if sets.is_empty() {
        return Ok(node);
    }

    // I nomi delle colonne sono letterali del codice qui sopra, mai input.
    let assignments = sets
        .iter()
        .enumerate()
        .map(|(index, (column, _))| format!("{column} = ?{}", index + 1))
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "UPDATE nodes SET {assignments}, updated_at = datetime('now') WHERE id = ?{}",
        sets.len() + 1
    );

    let mut values: Vec<Value> = sets.into_iter().map(|(_, value)| value).collect();
    values.push(Value::Text(id.to_string()));
    conn.execute(&query, params_from_iter(values))?;

    get(conn, id)
}

pub fn set_archived(conn: &Connection, id: &str, archived: bool) -> Result<Node> {
    get(conn, id)?;
    conn.execute(
        "UPDATE nodes
            SET archived_at = CASE WHEN ?1 THEN COALESCE(archived_at, datetime('now')) END,
                updated_at = datetime('now')
          WHERE id = ?2",
        params![archived, id],
    )?;
    get(conn, id)
}

/* ----------------------------------------------------------------- relazioni */

pub fn edge_exists(conn: &Connection, parent_id: &str, child_id: &str) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM edges WHERE parent_id = ?1 AND child_id = ?2",
            params![parent_id, child_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

pub fn insert_edge(
    conn: &Connection,
    parent_id: &str,
    child_id: &str,
    sort_order: f64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO edges (parent_id, child_id, sort_order) VALUES (?1, ?2, ?3)",
        params![parent_id, child_id, sort_order],
    )?;
    Ok(())
}

pub fn delete_edge(conn: &Connection, parent_id: &str, child_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM edges WHERE parent_id = ?1 AND child_id = ?2",
        params![parent_id, child_id],
    )?;
    Ok(())
}

pub fn set_pinned(conn: &Connection, parent_id: &str, child_id: &str, pinned: bool) -> Result<()> {
    let changed = conn.execute(
        "UPDATE edges SET is_pinned = ?1 WHERE parent_id = ?2 AND child_id = ?3",
        params![pinned, parent_id, child_id],
    )?;
    if changed == 0 {
        return Err(anyhow!("l'elemento non si trova in quel contenitore"));
    }
    Ok(())
}

/// Figli diretti, nell'ordine della relazione.
pub fn children(
    conn: &Connection,
    parent_id: &str,
    include_archived: bool,
) -> Result<Vec<NodeEntry>> {
    let mut statement = conn.prepare(
        "SELECT n.*, e.sort_order AS edge_sort_order, e.is_pinned AS edge_is_pinned,
                (SELECT COUNT(*) FROM edges ce JOIN nodes c ON c.id = ce.child_id
                  WHERE ce.parent_id = n.id AND c.deleted_at IS NULL) AS child_count,
                (SELECT COUNT(*) FROM edges pe JOIN nodes p ON p.id = pe.parent_id
                  WHERE pe.child_id = n.id AND p.deleted_at IS NULL) AS parent_count
           FROM edges e
           JOIN nodes n ON n.id = e.child_id
          WHERE e.parent_id = ?1
            AND n.deleted_at IS NULL
            AND (?2 OR n.archived_at IS NULL)
          ORDER BY e.sort_order, n.name",
    )?;

    let rows = statement.query_map(params![parent_id, include_archived], |row| {
        Ok(NodeEntry {
            node: map(row)?,
            sort_order: row.get("edge_sort_order")?,
            is_pinned: row.get("edge_is_pinned")?,
            child_count: row.get("child_count")?,
            parent_count: row.get("parent_count")?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn child_ids(conn: &Connection, parent_id: &str) -> Result<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT e.child_id FROM edges e JOIN nodes n ON n.id = e.child_id
          WHERE e.parent_id = ?1 AND n.deleted_at IS NULL
          ORDER BY e.sort_order",
    )?;
    let rows = statement.query_map([parent_id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Padri diretti (piu' di uno solo per un progetto condiviso), per nome.
pub fn parents(conn: &Connection, child_id: &str) -> Result<Vec<Node>> {
    let mut statement = conn.prepare(
        "SELECT p.* FROM edges e JOIN nodes p ON p.id = e.parent_id
          WHERE e.child_id = ?1 AND p.deleted_at IS NULL
          ORDER BY p.name, p.id",
    )?;
    let rows = statement.query_map([child_id], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn parent_ids(conn: &Connection, child_id: &str) -> Result<Vec<String>> {
    Ok(parents(conn, child_id)?
        .into_iter()
        .map(|node| node.id)
        .collect())
}

/// Tutti gli antenati lungo ogni percorso, con la distanza minima dal nodo
/// (1 = padre). Il nodo stesso non e' incluso.
pub fn ancestors(conn: &Connection, id: &str) -> Result<Vec<(Node, u32)>> {
    let mut statement = conn.prepare(
        "WITH RECURSIVE up(id, depth) AS (
           SELECT e.parent_id, 1 FROM edges e WHERE e.child_id = ?1
           UNION
           SELECT e.parent_id, up.depth + 1 FROM edges e JOIN up ON e.child_id = up.id
            WHERE up.depth < 64
         )
         SELECT n.*, MIN(up.depth) AS depth
           FROM up JOIN nodes n ON n.id = up.id
          WHERE n.deleted_at IS NULL
          GROUP BY n.id
          ORDER BY depth, n.name",
    )?;
    let rows = statement.query_map([id], |row| Ok((map(row)?, row.get::<_, u32>("depth")?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Ogni discendente, a qualunque profondita' (il nodo stesso escluso).
pub fn descendant_ids(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let mut statement = conn.prepare(
        "WITH RECURSIVE down(id, depth) AS (
           SELECT e.child_id, 1 FROM edges e WHERE e.parent_id = ?1
           UNION
           SELECT e.child_id, down.depth + 1 FROM edges e JOIN down ON e.parent_id = down.id
            WHERE down.depth < 64
         )
         SELECT DISTINCT down.id FROM down JOIN nodes n ON n.id = down.id
          WHERE n.deleted_at IS NULL",
    )?;
    let rows = statement.query_map([id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Regola di annidamento: `None` se vietato, `Some(shared)` se ammesso.
pub fn child_rule(conn: &Connection, parent: NodeKind, child: NodeKind) -> Result<Option<bool>> {
    Ok(conn
        .query_row(
            "SELECT shared FROM allowed_children WHERE parent_kind = ?1 AND child_kind = ?2",
            params![parent, child],
            |row| row.get::<_, bool>(0),
        )
        .optional()?)
}

/* ---------------------------------------------------------------- cestino */

pub fn mark_deleted(conn: &Connection, ids: &[String], deletion_id: &str) -> Result<()> {
    for id in ids {
        conn.execute(
            "UPDATE nodes SET deleted_at = datetime('now'), deletion_id = ?1
              WHERE id = ?2 AND deleted_at IS NULL",
            params![deletion_id, id],
        )?;
    }
    Ok(())
}

pub fn restore(conn: &Connection, deletion_id: &str) -> Result<usize> {
    Ok(conn.execute(
        "UPDATE nodes SET deleted_at = NULL, deletion_id = NULL WHERE deletion_id = ?1",
        [deletion_id],
    )?)
}

pub fn purge(conn: &Connection, deletion_id: Option<&str>) -> Result<usize> {
    Ok(match deletion_id {
        Some(deletion_id) => {
            conn.execute("DELETE FROM nodes WHERE deletion_id = ?1", [deletion_id])?
        }
        None => conn.execute("DELETE FROM nodes WHERE deleted_at IS NOT NULL", [])?,
    })
}

/// Nomi e tipi di un insieme di nodi (anche nel cestino), per i riepiloghi.
pub fn kinds_of(conn: &Connection, ids: &[String]) -> Result<HashMap<String, NodeKind>> {
    let mut statement = conn.prepare("SELECT kind FROM nodes WHERE id = ?1")?;
    let mut kinds = HashMap::with_capacity(ids.len());
    for id in ids {
        let kind: NodeKind = statement.query_row([id], |row| row.get(0))?;
        kinds.insert(id.clone(), kind);
    }
    Ok(kinds)
}
