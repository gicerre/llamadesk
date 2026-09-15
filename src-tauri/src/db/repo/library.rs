//! Cio' che il profilo aggiunge alla libreria: preferiti, cronologia d'uso, tag.
//!
//! La cronologia non lascia mai il computer: nessun URL viene contattato,
//! nessun dato esce da SQLite.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::repo::nodes;
use crate::db::seed::new_id;
use crate::domain::{Favorite, RecentAction, Tag};
use crate::services::resolve;

/// Giorni di cronologia conservati.
pub const USAGE_RETENTION_DAYS: i64 = 90;

/* ----------------------------------------------------------------- preferiti */

pub fn is_favorite(conn: &Connection, profile_id: &str, node_id: &str) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM favorites WHERE profile_id = ?1 AND node_id = ?2 AND action_id = ''",
            params![profile_id, node_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

/// Aggiunge o toglie un preferito. Restituisce lo stato risultante.
pub fn toggle_favorite(
    conn: &Connection,
    profile_id: &str,
    node_id: &str,
    action_id: Option<&str>,
    tool_id: Option<&str>,
) -> Result<bool> {
    nodes::get(conn, node_id)?;
    let action = action_id.unwrap_or("");

    let removed = conn.execute(
        "DELETE FROM favorites WHERE profile_id = ?1 AND node_id = ?2 AND action_id = ?3",
        params![profile_id, node_id, action],
    )?;
    if removed > 0 {
        return Ok(false);
    }

    let sort_order: f64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1000 FROM favorites WHERE profile_id = ?1",
        [profile_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO favorites (profile_id, node_id, action_id, tool_id, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![profile_id, node_id, action, tool_id, sort_order],
    )?;
    Ok(true)
}

/// Preferiti del profilo, con i workspace in cui compaiono. Un preferito
/// finito in un workspace che il profilo non vede piu' non viene mostrato.
pub fn favorites(conn: &Connection, profile_id: &str) -> Result<Vec<Favorite>> {
    let rows: Vec<(String, String, Option<String>, f64)> = {
        let mut statement = conn.prepare(
            "SELECT f.node_id, f.action_id, f.tool_id, f.sort_order
               FROM favorites f JOIN nodes n ON n.id = f.node_id
              WHERE f.profile_id = ?1 AND n.deleted_at IS NULL AND n.archived_at IS NULL
              ORDER BY f.sort_order",
        )?;
        let mapped = statement.query_map([profile_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        mapped.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut result = Vec::with_capacity(rows.len());
    for (node_id, action_id, tool_id, sort_order) in rows {
        let workspace_ids = visible_workspace_ids(conn, profile_id, &node_id)?;
        if workspace_ids.is_empty() {
            continue;
        }
        result.push(Favorite {
            node: nodes::get(conn, &node_id)?,
            action_id: Some(action_id).filter(|action| !action.is_empty()),
            tool_id,
            sort_order,
            workspace_ids,
        });
    }
    Ok(result)
}

fn visible_workspace_ids(
    conn: &Connection,
    profile_id: &str,
    node_id: &str,
) -> Result<Vec<String>> {
    let mut ids = Vec::new();
    for workspace in resolve::workspaces_of(conn, node_id)? {
        if crate::db::repo::workspaces::is_visible(conn, profile_id, &workspace.id)? {
            ids.push(workspace.id);
        }
    }
    Ok(ids)
}

/* -------------------------------------------------------------------- uso */

/// Registra un'azione che ha aperto qualcosa: "recente" significa "usato",
/// non "modificato" ne' "visitato".
pub fn record_usage(
    conn: &Connection,
    profile_id: &str,
    node_id: &str,
    action_id: &str,
    tool_id: Option<&str>,
    via_workspace_id: Option<&str>,
) -> Result<()> {
    if action_id.trim().is_empty() {
        return Err(anyhow!("azione mancante"));
    }
    conn.execute(
        "INSERT INTO usage_events (profile_id, node_id, action_id, tool_id, via_workspace_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![profile_id, node_id, action_id, tool_id, via_workspace_id],
    )?;
    Ok(())
}

struct RecentRow {
    node_id: String,
    action_id: String,
    tool_id: Option<String>,
    via_workspace_id: Option<String>,
    last_at: String,
    count: u32,
}

/// Azioni recenti del profilo, una riga per combinazione nodo + azione +
/// strumento, dalla piu' recente. Con `workspace_id` restano solo quelle i cui
/// nodi compaiono in quel workspace.
pub fn recents(
    conn: &Connection,
    profile_id: &str,
    workspace_id: Option<&str>,
    limit: u32,
) -> Result<Vec<RecentAction>> {
    let rows: Vec<RecentRow> = {
        let mut statement = conn.prepare(
            "SELECT u.node_id, u.action_id, u.tool_id,
                    (SELECT u2.via_workspace_id FROM usage_events u2
                      WHERE u2.profile_id = u.profile_id AND u2.node_id = u.node_id
                        AND u2.action_id = u.action_id AND u2.tool_id IS u.tool_id
                      ORDER BY u2.at DESC, u2.id DESC LIMIT 1) AS via_workspace_id,
                    MAX(u.at) AS last_at, COUNT(*) AS uses
               FROM usage_events u JOIN nodes n ON n.id = u.node_id
              WHERE u.profile_id = ?1 AND n.deleted_at IS NULL AND n.archived_at IS NULL
              GROUP BY u.node_id, u.action_id, u.tool_id
              ORDER BY last_at DESC, MAX(u.id) DESC",
        )?;
        let mapped = statement.query_map([profile_id], |row| {
            Ok(RecentRow {
                node_id: row.get(0)?,
                action_id: row.get(1)?,
                tool_id: row.get(2)?,
                via_workspace_id: row.get(3)?,
                last_at: row.get(4)?,
                count: row.get(5)?,
            })
        })?;
        mapped.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut result = Vec::new();
    for row in rows {
        if result.len() as u32 >= limit {
            break;
        }
        let visible = visible_workspace_ids(conn, profile_id, &row.node_id)?;
        let in_scope = match workspace_id {
            Some(workspace_id) => visible.iter().any(|id| id == workspace_id),
            None => !visible.is_empty(),
        };
        if !in_scope {
            continue;
        }
        result.push(RecentAction {
            node: nodes::get(conn, &row.node_id)?,
            action_id: row.action_id,
            tool_id: row.tool_id,
            via_workspace_id: row.via_workspace_id,
            last_at: row.last_at,
            count: row.count,
        });
    }
    Ok(result)
}

/// Dimentica la cronologia piu' vecchia della finestra di conservazione.
pub fn prune_usage(conn: &Connection) -> Result<usize> {
    Ok(conn.execute(
        "DELETE FROM usage_events WHERE at < datetime('now', ?1)",
        [format!("-{USAGE_RETENTION_DAYS} days")],
    )?)
}

/* ---------------------------------------------------------------------- tag */

fn map_tag(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
    })
}

pub fn tags(conn: &Connection) -> Result<Vec<Tag>> {
    let mut statement = conn.prepare("SELECT * FROM tags ORDER BY name COLLATE NOCASE")?;
    let rows = statement.query_map([], map_tag)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn tags_of(conn: &Connection, node_id: &str) -> Result<Vec<Tag>> {
    let mut statement = conn.prepare(
        "SELECT t.* FROM tags t JOIN node_tags nt ON nt.tag_id = t.id
          WHERE nt.node_id = ?1 ORDER BY t.name COLLATE NOCASE",
    )?;
    let rows = statement.query_map([node_id], map_tag)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Sostituisce i tag di un nodo con quelli indicati per nome, creando quelli
/// nuovi. I tag rimasti senza nodi vengono rimossi.
pub fn set_tags(conn: &Connection, node_id: &str, names: &[String]) -> Result<Vec<Tag>> {
    nodes::get(conn, node_id)?;
    crate::db::atomic(conn, |conn| {
        conn.execute("DELETE FROM node_tags WHERE node_id = ?1", [node_id])?;

        for name in names {
            let name = name.trim().trim_start_matches('#').trim();
            if name.is_empty() {
                continue;
            }
            let existing: Option<String> = conn
                .query_row("SELECT id FROM tags WHERE name = ?1", [name], |row| {
                    row.get(0)
                })
                .optional()?;
            let tag_id = match existing {
                Some(id) => id,
                None => {
                    let id = new_id();
                    conn.execute(
                        "INSERT INTO tags (id, name) VALUES (?1, ?2)",
                        params![id, name],
                    )?;
                    id
                }
            };
            conn.execute(
                "INSERT OR IGNORE INTO node_tags (tag_id, node_id) VALUES (?1, ?2)",
                params![tag_id, node_id],
            )?;
        }

        conn.execute(
            "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM node_tags)",
            [],
        )?;
        tags_of(conn, node_id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::workspaces;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodeKind;
    use crate::services::hierarchy;

    #[test]
    fn favorites_belong_to_the_profile_not_to_the_node() {
        let (conn, me) = database();
        conn.execute(
            "INSERT INTO profiles (id, name) VALUES ('demo', 'Presentazione')",
            [],
        )
        .unwrap();
        let ws = workspace(&conn, &me, "Lavoro");
        workspaces::show(&conn, "demo", &ws).unwrap();
        let jira = child(&conn, &me, &ws, NodeKind::Link, "jira");

        assert!(toggle_favorite(&conn, &me, &jira, None, None).unwrap());
        assert!(is_favorite(&conn, &me, &jira).unwrap());
        assert!(!is_favorite(&conn, "demo", &jira).unwrap());
        assert!(favorites(&conn, "demo").unwrap().is_empty());

        // "Oggetto + azione" e' un preferito distinto dal nodo in se'.
        assert!(toggle_favorite(&conn, &me, &jira, Some("open-with"), None).unwrap());
        assert_eq!(favorites(&conn, &me).unwrap().len(), 2);

        assert!(!toggle_favorite(&conn, &me, &jira, None, None).unwrap());
        let left = favorites(&conn, &me).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].action_id.as_deref(), Some("open-with"));
        assert_eq!(left[0].workspace_ids, vec![ws]);
    }

    /// Un progetto condiviso si marca una volta e compare in entrambi i workspace.
    #[test]
    fn a_shared_favorite_lists_every_visible_workspace() {
        let (conn, me) = database();
        let work = workspace(&conn, &me, "Lavoro");
        let dev = workspace(&conn, &me, "Sviluppo");
        let project = child(&conn, &me, &work, NodeKind::Project, "SpecialHub");
        hierarchy::share(&conn, &project, &dev, None).unwrap();

        toggle_favorite(&conn, &me, &project, None, None).unwrap();
        let mut ids = favorites(&conn, &me).unwrap()[0].workspace_ids.clone();
        ids.sort();
        let mut expected = vec![work, dev];
        expected.sort();
        assert_eq!(ids, expected);
    }

    #[test]
    fn recents_group_by_action_and_follow_the_workspace() {
        let (conn, me) = database();
        let work = workspace(&conn, &me, "Lavoro");
        let home = workspace(&conn, &me, "Casa");
        let repo = child(&conn, &me, &work, NodeKind::Path, "backend");
        let bills = child(&conn, &me, &home, NodeKind::Link, "bollette");
        conn.execute(
            "INSERT INTO tools (id, kind, name, exe_path, source)
             VALUES ('ide:idea', 'ide', 'IntelliJ IDEA', 'idea64.exe', 'detected')",
            [],
        )
        .unwrap();

        record_usage(
            &conn,
            &me,
            &repo,
            "open-with",
            Some("ide:idea"),
            Some(&work),
        )
        .unwrap();
        record_usage(
            &conn,
            &me,
            &repo,
            "open-with",
            Some("ide:idea"),
            Some(&work),
        )
        .unwrap();
        record_usage(&conn, &me, &repo, "terminal-here", None, Some(&work)).unwrap();
        record_usage(&conn, &me, &bills, "open", None, Some(&home)).unwrap();

        let all = recents(&conn, &me, None, 10).unwrap();
        assert_eq!(all.len(), 3);
        let ide = all
            .iter()
            .find(|recent| recent.action_id == "open-with")
            .unwrap();
        assert_eq!(ide.count, 2);
        assert_eq!(ide.tool_id.as_deref(), Some("ide:idea"));

        let at_work = recents(&conn, &me, Some(&work), 10).unwrap();
        assert_eq!(at_work.len(), 2);
        assert!(at_work.iter().all(|recent| recent.node.id == repo));

        assert_eq!(recents(&conn, &me, None, 1).unwrap().len(), 1);
    }

    #[test]
    fn old_usage_is_forgotten() {
        let (conn, me) = database();
        let ws = workspace(&conn, &me, "Lavoro");
        let link = child(&conn, &me, &ws, NodeKind::Link, "jira");
        record_usage(&conn, &me, &link, "open", None, None).unwrap();
        conn.execute(
            "INSERT INTO usage_events (profile_id, node_id, action_id, at)
             VALUES (?1, ?2, 'open', datetime('now', '-120 days'))",
            params![me, link],
        )
        .unwrap();

        assert_eq!(prune_usage(&conn).unwrap(), 1);
        assert_eq!(recents(&conn, &me, None, 10).unwrap()[0].count, 1);
    }

    #[test]
    fn tags_are_shared_by_name_and_cleaned_up() {
        let (conn, me) = database();
        let ws = workspace(&conn, &me, "Lavoro");
        let a = child(&conn, &me, &ws, NodeKind::Project, "A");
        let b = child(&conn, &me, &ws, NodeKind::Project, "B");

        set_tags(
            &conn,
            &a,
            &["#camunda".into(), "Cliente".into(), " ".into()],
        )
        .unwrap();
        set_tags(&conn, &b, &["CAMUNDA".into()]).unwrap();
        assert_eq!(
            tags(&conn).unwrap().len(),
            2,
            "stesso tag, maiuscole diverse"
        );

        set_tags(&conn, &a, &[]).unwrap();
        let names: Vec<String> = tags(&conn)
            .unwrap()
            .into_iter()
            .map(|tag| tag.name)
            .collect();
        assert_eq!(names, vec!["camunda"]);
    }
}
