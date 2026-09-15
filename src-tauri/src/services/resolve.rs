//! Cio' che un nodo eredita dai suoi antenati (docs/REDESIGN.md § 4).
//!
//! Due famiglie di regole, perche' un progetto condiviso ha piu' strade verso
//! la radice:
//!  * **indipendenti dal contesto** — protezione (basta un antenato protetto,
//!    su qualunque strada) e conferma (vince l'impostazione piu' vicina; a
//!    parita' di distanza, la piu' severa). Sono regole di sicurezza: non
//!    possono dipendere da quale workspace si sta guardando;
//!  * **dipendenti dal contesto** — percorso e strumento preferito seguono il
//!    workspace da cui si arriva (`via`), con ripiego sul primo visibile.

use std::collections::HashSet;

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::repo::{nodes, workspaces};
use crate::domain::{
    Caution, Crumb, Node, NodeKind, ResolvedCaution, ResolvedProtection, ToolKind,
};

/* ------------------------------------------------ indipendenti dal contesto */

pub fn protection(conn: &Connection, id: &str) -> Result<ResolvedProtection> {
    let node = nodes::get(conn, id)?;
    if node.is_protected {
        return Ok(ResolvedProtection {
            is_protected: true,
            is_own: true,
            inherited_from: None,
        });
    }

    // `ancestors` e' ordinato per distanza: il primo protetto e' il piu' vicino.
    let source = nodes::ancestors(conn, id)?
        .into_iter()
        .find(|(ancestor, _)| ancestor.is_protected)
        .map(|(ancestor, _)| Crumb::from(&ancestor));

    Ok(ResolvedProtection {
        is_protected: source.is_some(),
        is_own: false,
        inherited_from: source,
    })
}

pub fn caution(conn: &Connection, id: &str) -> Result<ResolvedCaution> {
    let node = nodes::get(conn, id)?;
    if let Some(level) = node.caution {
        return Ok(ResolvedCaution {
            level,
            is_own: true,
            inherited_from: None,
        });
    }

    let ancestors = nodes::ancestors(conn, id)?;
    let nearest = ancestors
        .iter()
        .filter(|(ancestor, _)| ancestor.caution.is_some())
        .map(|(_, depth)| *depth)
        .min();

    let source = nearest.and_then(|depth| {
        ancestors
            .iter()
            .filter(|(ancestor, at)| *at == depth && ancestor.caution.is_some())
            .max_by_key(|(ancestor, _)| ancestor.caution)
            .map(|(ancestor, _)| ancestor)
    });

    Ok(match source {
        Some(ancestor) => ResolvedCaution {
            level: ancestor.caution.unwrap_or(Caution::None),
            is_own: false,
            inherited_from: Some(Crumb::from(ancestor)),
        },
        None => ResolvedCaution {
            level: Caution::None,
            is_own: false,
            inherited_from: None,
        },
    })
}

/// Workspace in cui il nodo compare, lungo tutte le strade.
pub fn workspaces_of(conn: &Connection, id: &str) -> Result<Vec<Node>> {
    let node = nodes::get(conn, id)?;
    if node.kind == NodeKind::Workspace {
        return Ok(vec![node]);
    }
    let mut found: Vec<Node> = nodes::ancestors(conn, id)?
        .into_iter()
        .map(|(ancestor, _)| ancestor)
        .filter(|ancestor| ancestor.kind == NodeKind::Workspace)
        .collect();
    found.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(found)
}

/// Il profilo vede il nodo se ne vede almeno uno dei workspace.
pub fn is_visible(conn: &Connection, profile_id: &str, id: &str) -> Result<bool> {
    for workspace in workspaces_of(conn, id)? {
        if workspaces::is_visible(conn, profile_id, &workspace.id)? {
            return Ok(true);
        }
    }
    Ok(false)
}

/* ------------------------------------------------ dipendenti dal contesto */

/// Strada dal nodo alla radice, **dal nodo verso il workspace**. Dove ci sono
/// piu' padri si segue `via` se e' fra gli antenati possibili, altrimenti il
/// primo workspace visibile al profilo, altrimenti il primo per nome.
pub fn context_chain(
    conn: &Connection,
    profile_id: &str,
    id: &str,
    via: Option<&str>,
) -> Result<Vec<Node>> {
    let mut chain = vec![nodes::get(conn, id)?];
    let mut seen: HashSet<String> = HashSet::from([id.to_string()]);

    loop {
        let current = chain.last().map(|node| node.id.clone()).unwrap_or_default();
        let parents = nodes::parents(conn, &current)?;
        let next = match parents.len() {
            0 => break,
            1 => parents.into_iter().next(),
            _ => pick_parent(conn, profile_id, parents, via)?,
        };
        match next {
            Some(parent) if seen.insert(parent.id.clone()) => chain.push(parent),
            _ => break,
        }
    }

    Ok(chain)
}

fn pick_parent(
    conn: &Connection,
    profile_id: &str,
    parents: Vec<Node>,
    via: Option<&str>,
) -> Result<Option<Node>> {
    if let Some(via) = via {
        for parent in &parents {
            let reaches_via = parent.id == via
                || nodes::ancestors(conn, &parent.id)?
                    .iter()
                    .any(|(ancestor, _)| ancestor.id == via);
            if reaches_via {
                return Ok(Some(parent.clone()));
            }
        }
    }

    for parent in &parents {
        if is_visible(conn, profile_id, &parent.id)? {
            return Ok(Some(parent.clone()));
        }
    }

    Ok(parents.into_iter().next())
}

/// Percorso dalla radice al nodo, lungo il contesto.
pub fn breadcrumb(
    conn: &Connection,
    profile_id: &str,
    id: &str,
    via: Option<&str>,
) -> Result<Vec<Crumb>> {
    let mut chain: Vec<Crumb> = context_chain(conn, profile_id, id, via)?
        .iter()
        .map(Crumb::from)
        .collect();
    chain.reverse();
    Ok(chain)
}

/// Strumento preferito per un nodo: il piu' vicino lungo il contesto, poi
/// quello del profilo. Uno strumento nascosto non vale come preferenza.
pub fn tool_preference(
    conn: &Connection,
    profile_id: &str,
    id: &str,
    via: Option<&str>,
    kind: ToolKind,
) -> Result<Option<String>> {
    for node in context_chain(conn, profile_id, id, via)? {
        let found: Option<String> = conn
            .query_row(
                "SELECT p.tool_id FROM tool_preferences p JOIN tools t ON t.id = p.tool_id
                  WHERE p.node_id = ?1 AND p.tool_kind = ?2 AND t.is_hidden = 0",
                params![node.id, kind],
                |row| row.get(0),
            )
            .optional()?;
        if found.is_some() {
            return Ok(found);
        }
    }

    Ok(conn
        .query_row(
            "SELECT p.tool_id FROM tool_preferences p JOIN tools t ON t.id = p.tool_id
              WHERE p.profile_id = ?1 AND p.tool_kind = ?2 AND t.is_hidden = 0",
            params![profile_id, kind],
            |row| row.get(0),
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodePatch;
    use crate::services::hierarchy;

    fn set_caution(conn: &Connection, id: &str, level: Option<Caution>) {
        let patch = NodePatch {
            caution: Some(level),
            ..NodePatch::default()
        };
        nodes::update(conn, id, &patch).unwrap();
    }

    fn protect(conn: &Connection, id: &str) {
        let patch = NodePatch {
            is_protected: Some(true),
            ..NodePatch::default()
        };
        nodes::update(conn, id, &patch).unwrap();
    }

    fn add_tool(conn: &Connection, id: &str, kind: ToolKind) {
        conn.execute(
            "INSERT INTO tools (id, kind, name, exe_path, source) VALUES (?1, ?2, ?1, 'x.exe', 'detected')",
            params![id, kind],
        )
        .unwrap();
    }

    #[test]
    fn protection_flows_down_every_level() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Personale");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "Finanze");
        let section = child(&conn, &profile, &project, NodeKind::Section, "Banche");
        let link = child(&conn, &profile, &section, NodeKind::Link, "banca");

        assert!(!protection(&conn, &link).unwrap().is_protected);

        protect(&conn, &ws);
        let resolved = protection(&conn, &link).unwrap();
        assert!(resolved.is_protected);
        assert!(!resolved.is_own);
        assert_eq!(resolved.inherited_from.unwrap().id, ws);
    }

    /// La regola che rende sicura la condivisione: un progetto e' protetto se
    /// lo e' anche uno solo dei suoi workspace, da qualunque parte lo si guardi.
    #[test]
    fn a_shared_project_is_protected_if_any_workspace_is() {
        let (conn, profile) = database();
        let clients = workspace(&conn, &profile, "Clienti");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let project = child(&conn, &profile, &dev, NodeKind::Project, "Rossi");
        let sub = child(&conn, &profile, &project, NodeKind::Subproject, "Backend");
        hierarchy::share(&conn, &project, &clients, None).unwrap();

        protect(&conn, &clients);

        assert!(protection(&conn, &project).unwrap().is_protected);
        assert!(protection(&conn, &sub).unwrap().is_protected);
        assert!(!protection(&conn, &dev).unwrap().is_protected);
    }

    #[test]
    fn caution_nearest_wins_and_a_link_can_opt_out() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let prod = child(&conn, &profile, &project, NodeKind::Section, "PROD");
        let database_section = child(&conn, &profile, &prod, NodeKind::Section, "Database");
        let pgadmin = child(
            &conn,
            &profile,
            &database_section,
            NodeKind::Link,
            "pgadmin",
        );
        let docs = child(&conn, &profile, &prod, NodeKind::Link, "runbook");

        assert_eq!(caution(&conn, &pgadmin).unwrap().level, Caution::None);

        set_caution(&conn, &prod, Some(Caution::TypeName));
        let inherited = caution(&conn, &pgadmin).unwrap();
        assert_eq!(inherited.level, Caution::TypeName);
        assert_eq!(inherited.inherited_from.unwrap().id, prod);

        // Un singolo link esce dalla regola della sezione.
        set_caution(&conn, &docs, Some(Caution::None));
        let own = caution(&conn, &docs).unwrap();
        assert_eq!(own.level, Caution::None);
        assert!(own.is_own);

        // Una sezione intermedia puo' abbassare il livello per il suo ramo.
        set_caution(&conn, &database_section, Some(Caution::Confirm));
        assert_eq!(caution(&conn, &pgadmin).unwrap().level, Caution::Confirm);

        // Togliere l'override torna a ereditare.
        set_caution(&conn, &database_section, None);
        assert_eq!(caution(&conn, &pgadmin).unwrap().level, Caution::TypeName);
    }

    #[test]
    fn a_shared_project_takes_the_strictest_workspace_caution() {
        let (conn, profile) = database();
        let calm = workspace(&conn, &profile, "Personale");
        let strict = workspace(&conn, &profile, "Produzione");
        let project = child(&conn, &profile, &calm, NodeKind::Project, "Portale");
        hierarchy::share(&conn, &project, &strict, None).unwrap();

        set_caution(&conn, &calm, Some(Caution::None));
        set_caution(&conn, &strict, Some(Caution::Confirm));

        assert_eq!(caution(&conn, &project).unwrap().level, Caution::Confirm);
    }

    #[test]
    fn breadcrumb_follows_the_workspace_you_came_from() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let project = child(&conn, &profile, &work, NodeKind::Project, "SpecialHub");
        let sub = child(&conn, &profile, &project, NodeKind::Subproject, "Backend");
        hierarchy::share(&conn, &project, &dev, None).unwrap();

        let names = |via: Option<&str>| -> Vec<String> {
            breadcrumb(&conn, &profile, &sub, via)
                .unwrap()
                .into_iter()
                .map(|crumb| crumb.name)
                .collect()
        };

        assert_eq!(names(Some(&dev)), vec!["Sviluppo", "SpecialHub", "Backend"]);
        assert_eq!(names(Some(&work)), vec!["Lavoro", "SpecialHub", "Backend"]);
        // Senza contesto: il primo workspace visibile, in ordine di nome.
        assert_eq!(names(None), vec!["Lavoro", "SpecialHub", "Backend"]);

        let mut all: Vec<String> = workspaces_of(&conn, &sub)
            .unwrap()
            .into_iter()
            .map(|n| n.name)
            .collect();
        all.sort();
        assert_eq!(all, vec!["Lavoro", "Sviluppo"]);
    }

    #[test]
    fn visibility_depends_on_the_profile_workspaces() {
        let (conn, me) = database();
        conn.execute(
            "INSERT INTO profiles (id, name) VALUES ('demo', 'Presentazione')",
            [],
        )
        .unwrap();
        let personal = workspace(&conn, &me, "Personale");
        let work = workspace(&conn, &me, "Lavoro");
        workspaces::show(&conn, "demo", &work).unwrap();
        let bank = child(&conn, &me, &personal, NodeKind::Link, "banca");
        let jira = child(&conn, &me, &work, NodeKind::Link, "jira");

        assert!(is_visible(&conn, &me, &bank).unwrap());
        assert!(!is_visible(&conn, "demo", &bank).unwrap());
        assert!(is_visible(&conn, "demo", &jira).unwrap());
    }

    #[test]
    fn tool_preference_nearest_override_then_profile() {
        let (conn, profile) = database();
        add_tool(&conn, "ide:idea", ToolKind::Ide);
        add_tool(&conn, "ide:cursor", ToolKind::Ide);
        add_tool(&conn, "ide:code", ToolKind::Ide);
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let backend = child(&conn, &profile, &project, NodeKind::Subproject, "Backend");
        let frontend = child(&conn, &profile, &project, NodeKind::Subproject, "Frontend");
        let repo = child(&conn, &profile, &frontend, NodeKind::Path, "web");

        assert_eq!(
            tool_preference(&conn, &profile, &repo, None, ToolKind::Ide).unwrap(),
            None
        );

        conn.execute_batch(&format!(
            "INSERT INTO tool_preferences (profile_id, tool_kind, tool_id) VALUES ('{profile}', 'ide', 'ide:code');
             INSERT INTO tool_preferences (node_id, tool_kind, tool_id) VALUES ('{project}', 'ide', 'ide:idea');
             INSERT INTO tool_preferences (node_id, tool_kind, tool_id) VALUES ('{frontend}', 'ide', 'ide:cursor');"
        ))
        .unwrap();

        let pick = |id: &str| tool_preference(&conn, &profile, id, None, ToolKind::Ide).unwrap();
        assert_eq!(pick(&repo).as_deref(), Some("ide:cursor"));
        assert_eq!(pick(&backend).as_deref(), Some("ide:idea"));
        assert_eq!(pick(&ws).as_deref(), Some("ide:code"));

        // Uno strumento nascosto non conta: si risale al successivo.
        conn.execute("UPDATE tools SET is_hidden = 1 WHERE id = 'ide:cursor'", [])
            .unwrap();
        assert_eq!(pick(&repo).as_deref(), Some("ide:idea"));
    }
}
