//! I workspace come li vede un profilo (D1: la libreria e' comune, ogni
//! profilo sceglie quali workspace vedere, in che ordine e quale aprire).

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::repo::nodes;
use crate::domain::{NodeKind, WorkspaceEntry};
use crate::services::ordering::PROFILE_WORKSPACES;

fn ensure_workspace(conn: &Connection, workspace_id: &str) -> Result<()> {
    if nodes::get(conn, workspace_id)?.kind != NodeKind::Workspace {
        return Err(anyhow!("l'elemento indicato non e' un workspace"));
    }
    Ok(())
}

/// Workspace visibili al profilo, nel suo ordine.
pub fn list(
    conn: &Connection,
    profile_id: &str,
    include_archived: bool,
) -> Result<Vec<WorkspaceEntry>> {
    let mut statement = conn.prepare(
        "SELECT n.*, pw.sort_order AS pw_sort_order, pw.is_default, pw.last_route, pw.last_opened_at,
                (SELECT COUNT(*) FROM edges e JOIN nodes c ON c.id = e.child_id
                  WHERE e.parent_id = n.id AND c.kind = 'project' AND c.deleted_at IS NULL) AS project_count,
                (SELECT COUNT(*) FROM profile_workspaces other
                  WHERE other.workspace_id = n.id) AS profile_count
           FROM profile_workspaces pw
           JOIN nodes n ON n.id = pw.workspace_id
          WHERE pw.profile_id = ?1
            AND n.deleted_at IS NULL
            AND (?2 OR n.archived_at IS NULL)
          ORDER BY pw.sort_order, n.name",
    )?;

    let rows = statement.query_map(params![profile_id, include_archived], |row| {
        Ok(WorkspaceEntry {
            node: nodes::map(row)?,
            sort_order: row.get("pw_sort_order")?,
            is_default: row.get("is_default")?,
            last_route: row.get("last_route")?,
            last_opened_at: row.get("last_opened_at")?,
            project_count: row.get("project_count")?,
            profile_count: row.get("profile_count")?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn is_visible(conn: &Connection, profile_id: &str, workspace_id: &str) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM profile_workspaces WHERE profile_id = ?1 AND workspace_id = ?2",
            params![profile_id, workspace_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

/// Profili in cui il workspace e' visibile.
pub fn profiles_of(conn: &Connection, workspace_id: &str) -> Result<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT profile_id FROM profile_workspaces WHERE workspace_id = ?1 ORDER BY profile_id",
    )?;
    let rows = statement.query_map([workspace_id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Rende il workspace visibile al profilo, in coda. Il primo workspace di un
/// profilo diventa il suo predefinito.
pub fn show(conn: &Connection, profile_id: &str, workspace_id: &str) -> Result<()> {
    ensure_workspace(conn, workspace_id)?;
    if is_visible(conn, profile_id, workspace_id)? {
        return Ok(());
    }

    let has_default: bool = conn
        .query_row(
            "SELECT 1 FROM profile_workspaces WHERE profile_id = ?1 AND is_default = 1",
            [profile_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();

    let sort_order = PROFILE_WORKSPACES.append(conn, profile_id)?;
    conn.execute(
        "INSERT INTO profile_workspaces (profile_id, workspace_id, sort_order, is_default)
         VALUES (?1, ?2, ?3, ?4)",
        params![profile_id, workspace_id, sort_order, !has_default],
    )?;
    Ok(())
}

/// Nasconde il workspace al profilo. Un workspace deve restare visibile ad
/// almeno un profilo: altrimenti nessuno potrebbe piu' ritrovarlo.
pub fn hide(conn: &Connection, profile_id: &str, workspace_id: &str) -> Result<()> {
    if !is_visible(conn, profile_id, workspace_id)? {
        return Ok(());
    }
    if profiles_of(conn, workspace_id)?.len() <= 1 {
        return Err(anyhow!(
            "un workspace deve restare visibile in almeno un profilo: per toglierlo del tutto, eliminalo"
        ));
    }

    let was_default: bool = conn.query_row(
        "SELECT is_default FROM profile_workspaces WHERE profile_id = ?1 AND workspace_id = ?2",
        params![profile_id, workspace_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "DELETE FROM profile_workspaces WHERE profile_id = ?1 AND workspace_id = ?2",
        params![profile_id, workspace_id],
    )?;

    if was_default {
        promote_first(conn, profile_id)?;
    }
    Ok(())
}

/// Il primo workspace ancora visibile diventa il predefinito.
pub fn promote_first(conn: &Connection, profile_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE profile_workspaces SET is_default = 1
          WHERE profile_id = ?1
            AND NOT EXISTS (SELECT 1 FROM profile_workspaces d
                             JOIN nodes dn ON dn.id = d.workspace_id AND dn.deleted_at IS NULL
                            WHERE d.profile_id = ?1 AND d.is_default = 1)
            AND workspace_id = (SELECT pw.workspace_id FROM profile_workspaces pw
                                  JOIN nodes n ON n.id = pw.workspace_id AND n.deleted_at IS NULL
                                 WHERE pw.profile_id = ?1
                                 ORDER BY pw.sort_order LIMIT 1)",
        [profile_id],
    )?;
    Ok(())
}

pub fn set_default(conn: &Connection, profile_id: &str, workspace_id: &str) -> Result<()> {
    if !is_visible(conn, profile_id, workspace_id)? {
        return Err(anyhow!("il workspace non e' visibile in questo profilo"));
    }
    conn.execute(
        "UPDATE profile_workspaces SET is_default = 0 WHERE profile_id = ?1",
        [profile_id],
    )?;
    conn.execute(
        "UPDATE profile_workspaces SET is_default = 1 WHERE profile_id = ?1 AND workspace_id = ?2",
        params![profile_id, workspace_id],
    )?;
    Ok(())
}

pub fn reorder(
    conn: &Connection,
    profile_id: &str,
    workspace_id: &str,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<()> {
    if !is_visible(conn, profile_id, workspace_id)? {
        return Err(anyhow!("il workspace non e' visibile in questo profilo"));
    }
    let sort_order = PROFILE_WORKSPACES.place(conn, profile_id, previous_id, next_id)?;
    PROFILE_WORKSPACES.set(conn, profile_id, workspace_id, sort_order)
}

/// Ricorda l'ultima pagina visitata nel workspace: cambiando workspace si
/// riparte da li'.
pub fn remember_route(
    conn: &Connection,
    profile_id: &str,
    workspace_id: &str,
    route: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE profile_workspaces SET last_route = ?1, last_opened_at = datetime('now')
          WHERE profile_id = ?2 AND workspace_id = ?3",
        params![route, profile_id, workspace_id],
    )?;
    Ok(())
}
