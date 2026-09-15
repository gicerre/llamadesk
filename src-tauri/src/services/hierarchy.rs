//! Le regole della gerarchia.
//!
//! Ogni scrittura che tocca le relazioni passa da qui:
//!  * **annidamento** — chi puo' contenere chi e' scritto in `allowed_children`;
//!  * **condivisione** — solo un figlio con regola `shared` (oggi: un progetto
//!    dentro i workspace) puo' avere piu' padri, e tutti dello stesso tipo;
//!  * **cicli** — le sezioni si annidano senza limite (D4), ma nessun nodo puo'
//!    finire dentro un proprio discendente;
//!  * **cancellazione** — sparisce cio' che resta senza padri; un progetto
//!    condiviso sopravvive negli altri workspace.
//!
//! Le funzioni che scrivono piu' di una riga sono atomiche (`db::atomic`).

use std::collections::{HashMap, HashSet};

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};

use crate::db::atomic;
use crate::db::repo::{nodes, workspaces};
use crate::db::seed::new_id;
use crate::domain::{Crumb, DeleteImpact, KindCount, NewNode, Node, NodeKind};
use crate::services::ordering::CHILDREN;

/// Vicini fra cui inserire un elemento: `(precedente, successivo)`.
/// Senza vicini l'elemento va in coda.
pub type Neighbours<'a> = (Option<&'a str>, Option<&'a str>);

fn label(kind: NodeKind) -> &'static str {
    match kind {
        NodeKind::Workspace => "un workspace",
        NodeKind::Project => "un progetto",
        NodeKind::Subproject => "un sottoprogetto",
        NodeKind::Section => "una sezione",
        NodeKind::Link => "un link",
        NodeKind::LinkGroup => "un gruppo di link",
        NodeKind::Path => "un percorso locale",
    }
}

/* ---------------------------------------------------------------- creazione */

/// Crea un nodo. Un workspace nasce senza padre e visibile al profilo che lo
/// crea; ogni altro nodo nasce dentro `parent_id`.
pub fn create(
    conn: &Connection,
    profile_id: &str,
    parent_id: Option<&str>,
    input: &NewNode,
    position: Option<Neighbours<'_>>,
) -> Result<Node> {
    atomic(conn, |conn| match (input.kind, parent_id) {
        (NodeKind::Workspace, None) => {
            let node = nodes::insert(conn, input, Some(profile_id))?;
            workspaces::show(conn, profile_id, &node.id)?;
            Ok(node)
        }
        (NodeKind::Workspace, Some(_)) => {
            Err(anyhow!("un workspace non sta dentro altri elementi"))
        }
        (kind, None) => Err(anyhow!("{} deve stare dentro un contenitore", label(kind))),
        (_, Some(parent_id)) => {
            let node = nodes::insert(conn, input, Some(profile_id))?;
            attach(conn, parent_id, &node.id, position)?;
            Ok(node)
        }
    })
}

/* ---------------------------------------------------------------- relazioni */

/// Verifica che `child` possa stare dentro `parent`. `leaving` e' il padre da
/// cui il figlio sta per uscire (spostamento), che quindi non conta.
fn validate_attach(
    conn: &Connection,
    parent: &Node,
    child: &Node,
    leaving: Option<&str>,
) -> Result<()> {
    let shared = nodes::child_rule(conn, parent.kind, child.kind)?.ok_or_else(|| {
        anyhow!(
            "{} non puo' stare dentro {}",
            label(child.kind),
            label(parent.kind)
        )
    })?;

    if nodes::edge_exists(conn, &parent.id, &child.id)? {
        return Err(anyhow!(
            "'{}' si trova gia' in '{}'",
            child.name,
            parent.name
        ));
    }

    let others: Vec<Node> = nodes::parents(conn, &child.id)?
        .into_iter()
        .filter(|other| Some(other.id.as_str()) != leaving)
        .collect();

    if !others.is_empty() {
        if !shared {
            return Err(anyhow!(
                "{} puo' stare in un solo contenitore",
                label(child.kind)
            ));
        }
        if others.iter().any(|other| other.kind != parent.kind) {
            return Err(anyhow!(
                "{} condiviso puo' stare solo dentro elementi dello stesso tipo",
                label(child.kind)
            ));
        }
    }

    if parent.id == child.id || nodes::descendant_ids(conn, &child.id)?.contains(&parent.id) {
        return Err(anyhow!(
            "'{}' non puo' finire dentro un proprio contenuto",
            child.name
        ));
    }

    Ok(())
}

fn attach(
    conn: &Connection,
    parent_id: &str,
    child_id: &str,
    position: Option<Neighbours<'_>>,
) -> Result<()> {
    let parent = nodes::get(conn, parent_id)?;
    let child = nodes::get(conn, child_id)?;
    validate_attach(conn, &parent, &child, None)?;

    let (previous, next) = position.unwrap_or((None, None));
    let sort_order = CHILDREN.place(conn, parent_id, previous, next)?;
    nodes::insert_edge(conn, parent_id, child_id, sort_order)
}

/// Collega un nodo condivisibile (un progetto) a un altro contenitore: resta
/// una sola entita', visibile in entrambi.
pub fn share(
    conn: &Connection,
    child_id: &str,
    parent_id: &str,
    position: Option<Neighbours<'_>>,
) -> Result<()> {
    atomic(conn, |conn| attach(conn, parent_id, child_id, position))
}

/// "Rimuovi da questo workspace": toglie una sola appartenenza. Se e' l'ultima,
/// rifiuta: togliere l'unico contenitore significa eliminare.
pub fn unshare(conn: &Connection, child_id: &str, parent_id: &str) -> Result<()> {
    if !nodes::edge_exists(conn, parent_id, child_id)? {
        return Err(anyhow!("l'elemento non si trova in quel contenitore"));
    }
    if nodes::parent_ids(conn, child_id)?.len() <= 1 {
        return Err(anyhow!(
            "e' l'unico contenitore di questo elemento: per toglierlo, eliminalo"
        ));
    }
    nodes::delete_edge(conn, parent_id, child_id)
}

/// Sposta un nodo dentro `to_parent`, fra i vicini indicati. Con lo stesso
/// padre e' un riordino. `from_parent` e' obbligatorio solo se il nodo ha piu'
/// padri (un progetto condiviso: si sposta una sola delle sue appartenenze).
pub fn move_node(
    conn: &Connection,
    child_id: &str,
    from_parent: Option<&str>,
    to_parent: &str,
    position: Neighbours<'_>,
) -> Result<()> {
    atomic(conn, |conn| {
        let child = nodes::get(conn, child_id)?;
        if child.kind == NodeKind::Workspace {
            return Err(anyhow!(
                "i workspace si riordinano nel profilo, non si spostano"
            ));
        }

        let from = match from_parent {
            Some(from) => from.to_string(),
            None => {
                let mut parents = nodes::parent_ids(conn, child_id)?;
                if parents.len() != 1 {
                    return Err(anyhow!(
                        "l'elemento sta in piu' contenitori: indica da quale spostarlo"
                    ));
                }
                parents.remove(0)
            }
        };

        if !nodes::edge_exists(conn, &from, child_id)? {
            return Err(anyhow!(
                "l'elemento non si trova nel contenitore di partenza"
            ));
        }

        let (previous, next) = position;

        if from == to_parent {
            let sort_order = CHILDREN.place(conn, to_parent, previous, next)?;
            return CHILDREN.set(conn, to_parent, child_id, sort_order);
        }

        let parent = nodes::get(conn, to_parent)?;
        validate_attach(conn, &parent, &child, Some(&from))?;

        nodes::delete_edge(conn, &from, child_id)?;
        let sort_order = CHILDREN.place(conn, to_parent, previous, next)?;
        nodes::insert_edge(conn, to_parent, child_id, sort_order)
    })
}

/* ------------------------------------------------------------ cancellazione */

/// Che cosa sparisce eliminando `id`: il nodo e ogni discendente rimasto senza
/// padri. `detached` sono i figli che sopravvivono perche' hanno altri padri.
struct DeletionPlan {
    root: Node,
    deleted: Vec<String>,
    detached: Vec<String>,
}

fn plan_deletion(conn: &Connection, id: &str) -> Result<DeletionPlan> {
    let root = nodes::get(conn, id)?;
    let candidates = nodes::descendant_ids(conn, id)?;

    let mut deleted = vec![id.to_string()];
    let mut in_set: HashSet<String> = HashSet::from([id.to_string()]);
    let mut parents_of: HashMap<String, Vec<String>> = HashMap::new();
    for candidate in &candidates {
        parents_of.insert(candidate.clone(), nodes::parent_ids(conn, candidate)?);
    }

    // Punto fisso: un nodo sparisce quando TUTTI i suoi padri spariscono.
    loop {
        let mut changed = false;
        for candidate in &candidates {
            if in_set.contains(candidate) {
                continue;
            }
            let parents = &parents_of[candidate];
            if !parents.is_empty() && parents.iter().all(|parent| in_set.contains(parent)) {
                in_set.insert(candidate.clone());
                deleted.push(candidate.clone());
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    let detached = candidates
        .iter()
        .filter(|candidate| !in_set.contains(*candidate))
        .filter(|candidate| {
            parents_of[*candidate]
                .iter()
                .any(|parent| in_set.contains(parent))
        })
        .cloned()
        .collect();

    Ok(DeletionPlan {
        root,
        deleted,
        detached,
    })
}

pub fn delete_impact(conn: &Connection, id: &str) -> Result<DeleteImpact> {
    let plan = plan_deletion(conn, id)?;
    let kinds = nodes::kinds_of(conn, &plan.deleted)?;

    let mut counts: HashMap<NodeKind, u32> = HashMap::new();
    for kind in kinds.values() {
        *counts.entry(*kind).or_default() += 1;
    }

    let order = [
        NodeKind::Workspace,
        NodeKind::Project,
        NodeKind::Subproject,
        NodeKind::Section,
        NodeKind::LinkGroup,
        NodeKind::Link,
        NodeKind::Path,
    ];
    let deleted = order
        .iter()
        .filter_map(|kind| {
            counts.get(kind).map(|count| KindCount {
                kind: *kind,
                count: *count,
            })
        })
        .collect();

    let detached = plan
        .detached
        .iter()
        .map(|id| nodes::get(conn, id).map(|node| Crumb::from(&node)))
        .collect::<Result<Vec<_>>>()?;

    Ok(DeleteImpact { deleted, detached })
}

/// Sposta nel cestino il nodo e cio' che resta senza padri. Restituisce l'id
/// dell'eliminazione, che `restore` usa per annullarla.
pub fn delete(conn: &Connection, id: &str) -> Result<String> {
    atomic(conn, |conn| {
        let plan = plan_deletion(conn, id)?;
        let deletion_id = new_id();

        let affected_profiles = if plan.root.kind == NodeKind::Workspace {
            // Un workspace nel cestino non puo' restare il predefinito di nessuno.
            conn.execute(
                "UPDATE profile_workspaces SET is_default = 0 WHERE workspace_id = ?1",
                [id],
            )?;
            workspaces::profiles_of(conn, id)?
        } else {
            Vec::new()
        };

        nodes::mark_deleted(conn, &plan.deleted, &deletion_id)?;

        for profile_id in affected_profiles {
            workspaces::promote_first(conn, &profile_id)?;
        }
        Ok(deletion_id)
    })
}

/// Annulla un'eliminazione ancora nel cestino.
pub fn restore(conn: &Connection, deletion_id: &str) -> Result<()> {
    atomic(conn, |conn| {
        let restored = nodes::restore(conn, deletion_id)?;
        if restored == 0 {
            return Err(anyhow!(
                "niente da ripristinare: l'eliminazione non e' piu' nel cestino"
            ));
        }

        // Un profilo rimasto senza predefinito lo ritrova.
        let mut statement = conn.prepare("SELECT DISTINCT profile_id FROM profile_workspaces")?;
        let profiles = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for profile_id in profiles {
            workspaces::promote_first(conn, &profile_id)?;
        }
        Ok(())
    })
}

/// Eliminazione senza cestino (per esempio insieme a un profilo).
pub fn delete_permanently(conn: &Connection, id: &str) -> Result<()> {
    atomic(conn, |conn| {
        let deletion_id = delete(conn, id)?;
        nodes::purge(conn, Some(&deletion_id))?;
        Ok(())
    })
}

/// Svuota il cestino. Si chiama all'avvio: l'annullamento vale per la sessione.
pub fn empty_trash(conn: &Connection) -> Result<usize> {
    nodes::purge(conn, None)
}

/* -------------------------------------------------------------- duplicazione */

/// Duplica un nodo con tutto il suo contenuto, subito dopo l'originale dentro
/// `parent_id` (obbligatorio solo per un progetto condiviso). Tag, strumenti
/// preferiti e passi di avvio vengono copiati; i passi che puntano dentro la
/// copia puntano alla copia.
pub fn duplicate(
    conn: &Connection,
    profile_id: &str,
    id: &str,
    parent_id: Option<&str>,
    name: Option<&str>,
) -> Result<Node> {
    atomic(conn, |conn| {
        let original = nodes::get(conn, id)?;
        if original.kind == NodeKind::Workspace {
            return Err(anyhow!(
                "un workspace non si duplica: crea un workspace e collega i progetti"
            ));
        }

        let parent = match parent_id {
            Some(parent) => parent.to_string(),
            None => {
                let mut parents = nodes::parent_ids(conn, id)?;
                if parents.len() != 1 {
                    return Err(anyhow!(
                        "l'elemento sta in piu' contenitori: indica dove duplicarlo"
                    ));
                }
                parents.remove(0)
            }
        };
        if !nodes::edge_exists(conn, &parent, id)? {
            return Err(anyhow!("l'elemento non si trova in quel contenitore"));
        }

        let mut mapping: HashMap<String, String> = HashMap::new();
        let copy_id = copy_subtree(conn, profile_id, id, &mut mapping)?;
        copy_launch_steps(conn, &mapping)?;

        if let Some(name) = name {
            let name = name.trim();
            if name.is_empty() {
                return Err(anyhow!("il nome non puo' essere vuoto"));
            }
            conn.execute(
                "UPDATE nodes SET name = ?1 WHERE id = ?2",
                params![name, copy_id],
            )?;
        }

        let siblings = nodes::child_ids(conn, &parent)?;
        let next = siblings
            .iter()
            .position(|sibling| sibling == id)
            .and_then(|index| siblings.get(index + 1))
            .map(String::as_str);
        let sort_order = CHILDREN.place(conn, &parent, Some(id), next)?;
        nodes::insert_edge(conn, &parent, &copy_id, sort_order)?;

        nodes::get(conn, &copy_id)
    })
}

fn copy_subtree(
    conn: &Connection,
    profile_id: &str,
    id: &str,
    mapping: &mut HashMap<String, String>,
) -> Result<String> {
    let copy_id = new_id();
    conn.execute(
        "INSERT INTO nodes (id, kind, name, description, aliases, icon, color_main, color_secondary,
                            cover_asset_id, cover_focus_x, cover_focus_y, is_protected, caution, url, path,
                            enabled, open_mode, browser_tool_id, browser_profile, created_by_profile_id,
                            archived_at)
         SELECT ?1, kind, name, description, aliases, icon, color_main, color_secondary,
                cover_asset_id, cover_focus_x, cover_focus_y, is_protected, caution, url, path,
                enabled, open_mode, browser_tool_id, browser_profile, ?2, archived_at
           FROM nodes WHERE id = ?3",
        params![copy_id, profile_id, id],
    )?;
    conn.execute(
        "INSERT INTO node_tags (tag_id, node_id) SELECT tag_id, ?1 FROM node_tags WHERE node_id = ?2",
        params![copy_id, id],
    )?;
    conn.execute(
        "INSERT INTO tool_preferences (node_id, tool_kind, tool_id)
         SELECT ?1, tool_kind, tool_id FROM tool_preferences WHERE node_id = ?2",
        params![copy_id, id],
    )?;
    mapping.insert(id.to_string(), copy_id.clone());

    for child in nodes::children(conn, id, true)? {
        let child_copy = copy_subtree(conn, profile_id, &child.node.id, mapping)?;
        conn.execute(
            "INSERT INTO edges (parent_id, child_id, sort_order, is_pinned) VALUES (?1, ?2, ?3, ?4)",
            params![copy_id, child_copy, child.sort_order, child.is_pinned],
        )?;
    }

    Ok(copy_id)
}

fn copy_launch_steps(conn: &Connection, mapping: &HashMap<String, String>) -> Result<()> {
    for (original, copy) in mapping {
        let steps: Vec<(String, String, Option<String>, f64)> = {
            let mut statement = conn.prepare(
                "SELECT target_id, action_id, tool_id, sort_order FROM launch_steps WHERE owner_id = ?1",
            )?;
            let rows = statement.query_map([original], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        for (target, action, tool, sort_order) in steps {
            let target = mapping.get(&target).unwrap_or(&target);
            conn.execute(
                "INSERT INTO launch_steps (id, owner_id, target_id, action_id, tool_id, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![new_id(), copy, target, action, tool, sort_order],
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodePatch;

    fn names(conn: &Connection, parent: &str) -> Vec<String> {
        nodes::children(conn, parent, true)
            .unwrap()
            .into_iter()
            .map(|entry| entry.node.name)
            .collect()
    }

    fn alive(conn: &Connection, id: &str) -> bool {
        nodes::get(conn, id).is_ok()
    }

    /* -------------------------------------------------------- annidamento */

    #[test]
    fn a_workspace_is_created_visible_and_default_for_its_profile() {
        let (conn, profile) = database();
        let first = workspace(&conn, &profile, "Lavoro");
        let second = workspace(&conn, &profile, "Personale");

        let listed = workspaces::list(&conn, &profile, false).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed
            .iter()
            .any(|entry| entry.node.id == first && entry.is_default));
        assert!(listed
            .iter()
            .any(|entry| entry.node.id == second && !entry.is_default));
    }

    #[test]
    fn nesting_rules_come_from_the_database() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let group = child(&conn, &profile, &project, NodeKind::LinkGroup, "DEV");

        // Un sottoprogetto non sta in un workspace, un progetto non sta in un gruppo.
        for (parent, kind) in [
            (&ws, NodeKind::Subproject),
            (&group, NodeKind::Project),
            (&group, NodeKind::Section),
        ] {
            let result = create(
                &conn,
                &profile,
                Some(parent),
                &NewNode::named(kind, "x"),
                None,
            );
            assert!(result.is_err(), "{kind} non dovrebbe stare li'");
        }

        // Un workspace non ha padre, tutto il resto si'.
        assert!(create(
            &conn,
            &profile,
            Some(&ws),
            &NewNode::named(NodeKind::Workspace, "x"),
            None
        )
        .is_err());
        assert!(create(
            &conn,
            &profile,
            None,
            &NewNode::named(NodeKind::Project, "x"),
            None
        )
        .is_err());
    }

    #[test]
    fn a_rejected_creation_leaves_no_orphan_node() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let before: i64 = conn
            .query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get(0))
            .unwrap();

        let _ = create(
            &conn,
            &profile,
            Some(&ws),
            &NewNode::named(NodeKind::Subproject, "x"),
            None,
        );

        let after: i64 = conn
            .query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn sections_nest_without_limit_but_never_inside_themselves() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let backend = child(&conn, &profile, &project, NodeKind::Subproject, "Backend");

        let mut parent = backend.clone();
        let mut chain = Vec::new();
        for depth in 0..12 {
            parent = child(
                &conn,
                &profile,
                &parent,
                NodeKind::Section,
                &format!("livello {depth}"),
            );
            chain.push(parent.clone());
        }

        // La prima sezione non puo' finire dentro l'ultima (suo discendente),
        // ne' dentro se stessa.
        assert!(move_node(&conn, &chain[0], None, &chain[11], (None, None)).is_err());
        assert!(move_node(&conn, &chain[0], None, &chain[0], (None, None)).is_err());
        assert!(share(&conn, &chain[0], &chain[0], None).is_err());

        // Il contrario invece si puo': l'ultima risale sotto il sottoprogetto.
        move_node(&conn, &chain[11], None, &backend, (None, None)).unwrap();
        assert_eq!(nodes::parent_ids(&conn, &chain[11]).unwrap(), vec![backend]);
    }

    #[test]
    fn links_are_validated_on_creation() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");

        let mut bad = NewNode::named(NodeKind::Link, "Script");
        bad.url = Some("javascript:alert(1)".into());
        assert!(create(&conn, &profile, Some(&ws), &bad, None).is_err());

        let missing = NewNode::named(NodeKind::Link, "Senza indirizzo");
        assert!(create(&conn, &profile, Some(&ws), &missing, None).is_err());

        let mut wrong = NewNode::named(NodeKind::Section, "Sezione");
        wrong.url = Some("https://example.com".into());
        assert!(create(&conn, &profile, Some(&ws), &wrong, None).is_err());
    }

    /* -------------------------------------------------------- condivisione */

    #[test]
    fn a_project_is_one_entity_shared_by_many_workspaces() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let project = child(&conn, &profile, &work, NodeKind::Project, "SpecialHub");

        share(&conn, &project, &dev, None).unwrap();

        // Una modifica si vede da entrambi i workspace: e' la stessa riga.
        let patch = NodePatch {
            name: Some("SpecialHub 2".into()),
            ..NodePatch::default()
        };
        nodes::update(&conn, &project, &patch).unwrap();
        assert_eq!(names(&conn, &work), vec!["SpecialHub 2"]);
        assert_eq!(names(&conn, &dev), vec!["SpecialHub 2"]);

        let entry = &nodes::children(&conn, &work, false).unwrap()[0];
        assert_eq!(entry.parent_count, 2);

        let copies: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM nodes WHERE kind = 'project'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(copies, 1);
    }

    #[test]
    fn only_projects_can_be_shared() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let project = child(&conn, &profile, &work, NodeKind::Project, "SpecialHub");
        let other = child(&conn, &profile, &work, NodeKind::Project, "Altro");
        let backend = child(&conn, &profile, &project, NodeKind::Subproject, "Backend");
        let link = child(&conn, &profile, &work, NodeKind::Link, "jira");

        assert!(share(&conn, &backend, &other, None).is_err());
        assert!(share(&conn, &link, &dev, None).is_err());
        // Due volte nello stesso workspace no.
        assert!(share(&conn, &project, &work, None).is_err());
    }

    #[test]
    fn unsharing_refuses_to_remove_the_last_workspace() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let project = child(&conn, &profile, &work, NodeKind::Project, "SpecialHub");
        share(&conn, &project, &dev, None).unwrap();

        unshare(&conn, &project, &work).unwrap();
        assert!(unshare(&conn, &project, &dev).is_err());
        assert_eq!(nodes::parent_ids(&conn, &project).unwrap(), vec![dev]);
    }

    #[test]
    fn moving_a_shared_project_moves_only_one_membership() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let home = workspace(&conn, &profile, "Casa");
        let project = child(&conn, &profile, &work, NodeKind::Project, "SpecialHub");
        share(&conn, &project, &dev, None).unwrap();

        // Senza dire da dove, lo spostamento e' ambiguo.
        assert!(move_node(&conn, &project, None, &home, (None, None)).is_err());

        move_node(&conn, &project, Some(&work), &home, (None, None)).unwrap();
        let mut parents = nodes::parent_ids(&conn, &project).unwrap();
        parents.sort();
        let mut expected = vec![dev.clone(), home.clone()];
        expected.sort();
        assert_eq!(parents, expected);

        // Non si puo' spostare nel workspace che lo contiene gia'.
        assert!(move_node(&conn, &project, Some(&home), &dev, (None, None)).is_err());
    }

    #[test]
    fn reordering_writes_between_neighbours() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let a = child(&conn, &profile, &ws, NodeKind::Project, "A");
        let b = child(&conn, &profile, &ws, NodeKind::Project, "B");
        let c = child(&conn, &profile, &ws, NodeKind::Project, "C");

        move_node(&conn, &c, None, &ws, (Some(&a), Some(&b))).unwrap();
        assert_eq!(names(&conn, &ws), vec!["A", "C", "B"]);

        move_node(&conn, &a, None, &ws, (Some(&b), None)).unwrap();
        assert_eq!(names(&conn, &ws), vec!["C", "B", "A"]);
    }

    /* -------------------------------------------------------- cancellazione */

    #[test]
    fn deleting_a_workspace_keeps_projects_shared_elsewhere() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let shared = child(&conn, &profile, &work, NodeKind::Project, "SpecialHub");
        let shared_sub = child(&conn, &profile, &shared, NodeKind::Subproject, "Backend");
        let exclusive = child(&conn, &profile, &work, NodeKind::Project, "Meeting");
        let exclusive_link = child(&conn, &profile, &exclusive, NodeKind::Link, "teams");
        let loose = child(&conn, &profile, &work, NodeKind::Link, "outlook");
        share(&conn, &shared, &dev, None).unwrap();

        let impact = delete_impact(&conn, &work).unwrap();
        assert_eq!(
            impact.deleted,
            vec![
                KindCount {
                    kind: NodeKind::Workspace,
                    count: 1
                },
                KindCount {
                    kind: NodeKind::Project,
                    count: 1
                },
                KindCount {
                    kind: NodeKind::Link,
                    count: 2
                },
            ]
        );
        assert_eq!(impact.detached.len(), 1);
        assert_eq!(impact.detached[0].id, shared);

        delete(&conn, &work).unwrap();

        assert!(!alive(&conn, &work));
        assert!(!alive(&conn, &exclusive));
        assert!(!alive(&conn, &exclusive_link));
        assert!(!alive(&conn, &loose));
        assert!(alive(&conn, &shared));
        assert!(alive(&conn, &shared_sub));
        assert_eq!(
            nodes::parent_ids(&conn, &shared).unwrap(),
            vec![dev.clone()]
        );

        // Il predefinito passa al workspace rimasto.
        let listed = workspaces::list(&conn, &profile, false).unwrap();
        assert_eq!(listed.len(), 1);
        assert!(listed[0].is_default);
    }

    #[test]
    fn a_deletion_can_be_undone_until_the_trash_is_emptied() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let section = child(&conn, &profile, &project, NodeKind::Section, "PROD");
        let link = child(&conn, &profile, &section, NodeKind::Link, "grafana");

        let deletion = delete(&conn, &section).unwrap();
        assert!(!alive(&conn, &link));
        assert!(names(&conn, &project).is_empty());

        restore(&conn, &deletion).unwrap();
        assert!(alive(&conn, &link));
        assert_eq!(names(&conn, &project), vec!["PROD"]);

        let again = delete(&conn, &section).unwrap();
        assert_eq!(empty_trash(&conn).unwrap(), 2);
        assert!(restore(&conn, &again).is_err());
        let edges: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM edges WHERE parent_id = ?1",
                [&project],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            edges, 0,
            "le relazioni dei nodi eliminati spariscono con loro"
        );
    }

    #[test]
    fn restoring_a_default_workspace_gives_the_profile_a_default_again() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");

        let deletion = delete(&conn, &ws).unwrap();
        assert!(workspaces::list(&conn, &profile, false).unwrap().is_empty());

        restore(&conn, &deletion).unwrap();
        let listed = workspaces::list(&conn, &profile, false).unwrap();
        assert!(listed[0].is_default);
    }

    /* -------------------------------------------------------- duplicazione */

    #[test]
    fn duplicating_copies_the_whole_branch_right_after_the_original() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let first = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let last = child(&conn, &profile, &ws, NodeKind::Project, "Meeting");
        let sub = child(&conn, &profile, &first, NodeKind::Subproject, "Backend");
        let prod = child(&conn, &profile, &sub, NodeKind::Section, "PROD");
        let link = child(&conn, &profile, &prod, NodeKind::Link, "grafana");
        conn.execute(
            "INSERT INTO launch_steps (id, owner_id, target_id, action_id) VALUES ('s', ?1, ?2, 'open')",
            params![sub, link],
        )
        .unwrap();

        let copy = duplicate(&conn, &profile, &first, None, Some("SpecialHub copia")).unwrap();

        assert_eq!(
            names(&conn, &ws),
            vec!["SpecialHub", "SpecialHub copia", "Meeting"]
        );
        let copied_sub = &nodes::children(&conn, &copy.id, true).unwrap()[0].node;
        assert_ne!(copied_sub.id, sub);
        let copied_prod = &nodes::children(&conn, &copied_sub.id, true).unwrap()[0].node;
        let copied_link = &nodes::children(&conn, &copied_prod.id, true).unwrap()[0].node;
        assert_eq!(copied_link.url, nodes::get(&conn, &link).unwrap().url);

        // Il passo di avvio della copia punta al link copiato, non all'originale.
        let target: String = conn
            .query_row(
                "SELECT target_id FROM launch_steps WHERE owner_id = ?1",
                [&copied_sub.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(&target, &copied_link.id);
        let _ = last;
    }
}
