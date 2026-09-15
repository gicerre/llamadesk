//! Accesso ai nodi della gerarchia.
//!
//! Una sola tabella per project / workspace / environment / context / group:
//! qui vivono le query generiche che servono a tutta l'applicazione
//! (catena verso la radice, figli, spostamento, cancellazione).

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};

use crate::db::seed::new_id;
use crate::domain::Container;
use crate::services::ordering;

pub const TABLE: &str = "containers";

pub fn map(row: &Row<'_>) -> rusqlite::Result<Container> {
    Ok(Container {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        parent_id: row.get("parent_id")?,
        kind: row.get("kind")?,
        name: row.get("name")?,
        slug: row.get("slug")?,
        description: row.get("description")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        badge_text: row.get("badge_text")?,
        background_id: row.get("background_id")?,
        danger_level: row.get("danger_level")?,
        danger_prompt_id: row.get("danger_prompt_id")?,
        is_favorite: row.get("is_favorite")?,
        is_archived: row.get("is_archived")?,
        sort_order: row.get("sort_order")?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Container> {
    conn.query_row("SELECT * FROM containers WHERE id = ?1", [id], map)
        .map_err(|_| anyhow!("contenitore non trovato: {id}"))
}

/// Catena dal nodo indicato fino alla radice, **dal piu' vicino al piu' lontano**.
/// E' la base sia del breadcrumb sia dell'ereditarieta' della Danger Zone.
pub fn chain(conn: &Connection, id: &str) -> Result<Vec<Container>> {
    let mut statement = conn.prepare(
        "WITH RECURSIVE chain(id, parent_id, depth) AS (
           SELECT id, parent_id, 0 FROM containers WHERE id = ?1
           UNION ALL
           SELECT c.id, c.parent_id, chain.depth + 1
             FROM containers c JOIN chain ON c.id = chain.parent_id
         )
         SELECT containers.* FROM chain
           JOIN containers ON containers.id = chain.id
         ORDER BY chain.depth",
    )?;
    let rows = statement.query_map([id], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn children(
    conn: &Connection,
    profile_id: &str,
    parent_id: Option<&str>,
) -> Result<Vec<Container>> {
    let mut statement = conn.prepare(
        "SELECT * FROM containers
          WHERE profile_id = ?1 AND parent_id IS ?2 AND is_archived = 0
          ORDER BY sort_order, name",
    )?;
    let rows = statement.query_map(params![profile_id, parent_id], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Tutti i nodi di un profilo: la sidebar costruisce l'albero lato React.
pub fn list_by_profile(conn: &Connection, profile_id: &str) -> Result<Vec<Container>> {
    let mut statement =
        conn.prepare("SELECT * FROM containers WHERE profile_id = ?1 ORDER BY sort_order, name")?;
    let rows = statement.query_map([profile_id], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Nodi fratelli dello stesso tipo: alimenta l'Environment Switcher.
pub fn siblings_of_kind(conn: &Connection, container: &Container) -> Result<Vec<Container>> {
    let mut statement = conn.prepare(
        "SELECT * FROM containers
          WHERE profile_id = ?1 AND parent_id IS ?2 AND kind = ?3 AND id != ?4 AND is_archived = 0
          ORDER BY sort_order, name",
    )?;
    let rows = statement.query_map(
        params![
            container.profile_id,
            container.parent_id,
            container.kind,
            container.id
        ],
        map,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Verifica la regola di annidamento: la gerarchia e' rigorosa, ma le regole
/// stanno nei dati (`allowed_child_kinds`), non nello schema.
pub fn assert_nesting_allowed(
    conn: &Connection,
    parent_kind: &str,
    child_kind: &str,
) -> Result<()> {
    let allowed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM allowed_child_kinds WHERE parent_kind = ?1 AND child_kind = ?2",
        params![parent_kind, child_kind],
        |row| row.get(0),
    )?;

    if allowed == 0 {
        return Err(anyhow!(
            "un elemento di tipo '{child_kind}' non puo' stare dentro '{parent_kind}'"
        ));
    }
    Ok(())
}

fn parent_kind(conn: &Connection, parent_id: Option<&str>) -> Result<String> {
    match parent_id {
        None => Ok("root".to_string()),
        Some(id) => Ok(get(conn, id)?.kind),
    }
}

pub fn create(
    conn: &Connection,
    profile_id: &str,
    parent_id: Option<&str>,
    kind: &str,
    name: &str,
) -> Result<Container> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    assert_nesting_allowed(conn, &parent_kind(conn, parent_id)?, kind)?;

    let id = new_id();
    let sort_order = ordering::append(conn, TABLE, "parent_id", parent_id)?;

    conn.execute(
        "INSERT INTO containers (id, profile_id, parent_id, kind, name, slug, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            profile_id,
            parent_id,
            kind,
            name,
            slugify(name),
            sort_order
        ],
    )?;

    get(conn, &id)
}

/// Aggiorna solo i campi passati: `None` significa "lascia com'e'".
/// Per `danger_level` vedi [`resolve_level_update`].
#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
    icon: Option<&str>,
    color: Option<&str>,
    badge_text: Option<&str>,
    danger_level: Option<&str>,
    is_favorite: Option<bool>,
) -> Result<Container> {
    let current = get(conn, id)?;
    let danger_level = resolve_level_update(danger_level, current.danger_level.clone());

    let name = name
        .map(str::trim)
        .unwrap_or(current.name.as_str())
        .to_string();
    if name.is_empty() {
        return Err(anyhow!("il nome non puo' essere vuoto"));
    }

    conn.execute(
        "UPDATE containers SET
           name = ?1, slug = ?2, description = ?3, icon = ?4, color = ?5, badge_text = ?6,
           danger_level = ?7, is_favorite = ?8, updated_at = datetime('now')
         WHERE id = ?9",
        params![
            name,
            slugify(&name),
            description.map(str::to_string).or(current.description),
            icon.map(str::to_string).or(current.icon),
            color.map(str::to_string).or(current.color),
            badge_text.map(str::to_string).or(current.badge_text),
            danger_level,
            is_favorite.unwrap_or(current.is_favorite),
            id
        ],
    )?;

    get(conn, id)
}

/// Traduce l'aggiornamento del livello di pericolo.
///
/// Il sentinella `"inherit"` esiste perche' JSON non distingue "campo assente"
/// da "campo a null" quando attraversa `Option<Option<T>>`: senza di esso non
/// si potrebbe piu' togliere un override una volta impostato.
pub fn resolve_level_update(incoming: Option<&str>, current: Option<String>) -> Option<String> {
    match incoming {
        None => current,
        Some("inherit") => None,
        Some(level) => Some(level.to_string()),
    }
}

/// Sposta un nodo sotto un nuovo padre e/o fra due vicini.
pub fn move_node(
    conn: &Connection,
    id: &str,
    new_parent_id: Option<&str>,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<Container> {
    let current = get(conn, id)?;

    // Un nodo non puo' finire dentro se stesso o dentro un proprio discendente:
    // creerebbe un ciclo e renderebbe l'albero irraggiungibile.
    if let Some(target) = new_parent_id {
        if target == id {
            return Err(anyhow!("un elemento non puo' contenere se stesso"));
        }
        let ancestors = chain(conn, target)?;
        if ancestors.iter().any(|node| node.id == id) {
            return Err(anyhow!(
                "non puoi spostare un elemento dentro un suo discendente"
            ));
        }
        let parent = get(conn, target)?;
        // I profili sono mondi separati: le applicazioni del ramo si
        // porterebbero dietro il `profile_id` di partenza.
        if parent.profile_id != current.profile_id {
            return Err(anyhow!("un elemento non puo' passare in un altro profilo"));
        }
        assert_nesting_allowed(conn, &parent.kind, &current.kind)?;
    } else {
        assert_nesting_allowed(conn, "root", &current.kind)?;
    }

    let sort_order = ordering::place(
        conn,
        TABLE,
        "parent_id",
        new_parent_id,
        previous_id,
        next_id,
    )?;

    conn.execute(
        "UPDATE containers SET parent_id = ?1, sort_order = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        params![new_parent_id, sort_order, id],
    )?;

    get(conn, id)
}

/// La cancellazione e' a cascata (vincoli di chiave esterna): rimuove figli,
/// applicazioni e link. La UI deve sempre chiedere conferma mostrando i numeri.
pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM containers WHERE id = ?1", [id])?;
    Ok(())
}

/// Quanti discendenti verrebbero eliminati: serve al testo della conferma.
pub fn descendant_counts(conn: &Connection, id: &str) -> Result<(i64, i64, i64)> {
    let containers: i64 = conn.query_row(
        "WITH RECURSIVE sub(id) AS (
           SELECT id FROM containers WHERE id = ?1
           UNION ALL
           SELECT c.id FROM containers c JOIN sub ON c.parent_id = sub.id
         )
         SELECT COUNT(*) - 1 FROM sub",
        [id],
        |row| row.get(0),
    )?;

    let applications: i64 = conn.query_row(
        "WITH RECURSIVE sub(id) AS (
           SELECT id FROM containers WHERE id = ?1
           UNION ALL
           SELECT c.id FROM containers c JOIN sub ON c.parent_id = sub.id
         )
         SELECT COUNT(*) FROM applications WHERE container_id IN (SELECT id FROM sub)",
        [id],
        |row| row.get(0),
    )?;

    let links: i64 = conn.query_row(
        "WITH RECURSIVE sub(id) AS (
           SELECT id FROM containers WHERE id = ?1
           UNION ALL
           SELECT c.id FROM containers c JOIN sub ON c.parent_id = sub.id
         )
         SELECT COUNT(*) FROM links
          WHERE application_id IN (
            SELECT id FROM applications WHERE container_id IN (SELECT id FROM sub)
          )",
        [id],
        |row| row.get(0),
    )?;

    Ok((containers, applications, links))
}

/// "PRODUZIONE Cliente A" -> "produzione-cliente-a". Serve all'Environment
/// Switcher per ritrovare lo stesso punto in un altro ambiente.
pub fn slugify(value: &str) -> String {
    let slug: String = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();

    slug.split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, seed};
    use std::path::Path;

    /// ACME (progetto) > PROD, TEST (ambienti) > Cliente A (contesto), e un
    /// secondo progetto vuoto, BETA.
    fn tree() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        seed::ensure_seed(&mut conn, "en-US").unwrap();

        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();
        conn.execute_batch(&format!(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name, sort_order) VALUES
               ('acme', '{profile}', NULL,   'project',     'ACME',      1000),
               ('beta', '{profile}', NULL,   'project',     'BETA',      2000),
               ('prod', '{profile}', 'acme', 'environment', 'PROD',      1000),
               ('test', '{profile}', 'acme', 'environment', 'TEST',      2000),
               ('cli',  '{profile}', 'prod', 'context',     'Cliente A', 1000);"
        ))
        .unwrap();
        conn
    }

    fn children_of(conn: &Connection, parent: &str) -> Vec<String> {
        let profile = get(conn, parent).unwrap().profile_id;
        children(conn, &profile, Some(parent))
            .unwrap()
            .into_iter()
            .map(|node| node.id)
            .collect()
    }

    #[test]
    fn move_reorders_and_reparents() {
        let conn = tree();

        // TEST prima di PROD, nello stesso progetto.
        move_node(&conn, "test", Some("acme"), None, Some("prod")).unwrap();
        assert_eq!(children_of(&conn, "acme"), ["test", "prod"]);

        // PROD in coda a BETA: il suo contesto viaggia con lui.
        move_node(&conn, "prod", Some("beta"), None, None).unwrap();
        assert_eq!(children_of(&conn, "beta"), ["prod"]);
        assert_eq!(children_of(&conn, "prod"), ["cli"]);
    }

    #[test]
    fn move_rejects_cycles_and_illegal_nesting() {
        let conn = tree();

        assert!(move_node(&conn, "acme", Some("acme"), None, None).is_err());
        assert!(move_node(&conn, "acme", Some("cli"), None, None).is_err());
        // Un ambiente sta solo dentro un progetto...
        assert!(move_node(&conn, "prod", None, None, None).is_err());
        assert!(move_node(&conn, "prod", Some("test"), None, None).is_err());
        // ...e un contesto solo dentro un ambiente.
        assert!(move_node(&conn, "cli", Some("beta"), None, None).is_err());

        // Nessun tentativo fallito ha lasciato tracce.
        assert_eq!(children_of(&conn, "acme"), ["prod", "test"]);
        assert_eq!(children_of(&conn, "prod"), ["cli"]);
    }

    #[test]
    fn move_stays_inside_the_profile() {
        let conn = tree();
        let other = crate::db::repo::profiles::create(&conn, "Lavoro", None).unwrap();
        conn.execute(
            "INSERT INTO containers (id, profile_id, kind, name) VALUES ('alien', ?1, 'project', 'X')",
            [&other.id],
        )
        .unwrap();

        assert!(move_node(&conn, "prod", Some("alien"), None, None).is_err());
    }

    #[test]
    fn level_update_distinguishes_untouched_from_inherit() {
        assert_eq!(
            resolve_level_update(None, Some("critical".into())),
            Some("critical".into())
        );
        assert_eq!(
            resolve_level_update(Some("inherit"), Some("critical".into())),
            None
        );
        assert_eq!(
            resolve_level_update(Some("warning"), None),
            Some("warning".into())
        );
    }

    #[test]
    fn slugify_normalises_names() {
        assert_eq!(slugify("PRODUZIONE"), "produzione");
        assert_eq!(slugify("  Cliente A / Comune B "), "cliente-a-comune-b");
        assert_eq!(slugify("Test---1"), "test-1");
        assert_eq!(slugify(""), "");
    }
}
