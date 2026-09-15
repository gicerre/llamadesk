//! Duplicazione di interi rami della gerarchia.
//!
//! "Ho un nuovo cliente identico al precedente" e' il caso d'uso quotidiano:
//! si duplica un contesto o un ambiente intero e si cambiano tre URL. Ogni
//! elemento clonato riceve un id nuovo (UUIDv7), quindi non esiste alcun
//! legame residuo con l'originale.

use anyhow::Result;
use rusqlite::{params, Connection};

use crate::db::repo::{containers, items};
use crate::db::seed::new_id;
use crate::domain::{Application, Container};
use crate::services::ordering;

/// Clona un contenitore con tutto il suo sottoalbero, come fratello dell'originale.
pub fn duplicate_container(conn: &Connection, id: &str, new_name: &str) -> Result<Container> {
    let source = containers::get(conn, id)?;
    let parent_id = source.parent_id.clone();
    let clone_id = clone_subtree(conn, &source, parent_id.as_deref(), new_name)?;
    containers::get(conn, &clone_id)
}

fn clone_subtree(
    conn: &Connection,
    source: &Container,
    parent_id: Option<&str>,
    name: &str,
) -> Result<String> {
    let id = new_id();
    let sort_order = ordering::append(conn, containers::TABLE, "parent_id", parent_id)?;

    conn.execute(
        "INSERT INTO containers
           (id, profile_id, parent_id, kind, name, slug, description, icon, color, badge_text,
            background_id, danger_level, danger_prompt_id, is_favorite, is_archived, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            source.profile_id,
            parent_id,
            source.kind,
            name,
            containers::slugify(name),
            source.description,
            source.icon,
            source.color,
            source.badge_text,
            source.background_id,
            // La protezione si duplica insieme al ramo: perderla sarebbe il
            // modo piu' rapido di aprire la produzione per sbaglio.
            source.danger_level,
            source.danger_prompt_id,
            source.is_favorite,
            source.is_archived,
            sort_order
        ],
    )?;

    for application in items::list_applications(conn, &source.id)? {
        clone_application(conn, &application, &id, &application.name)?;
    }

    for child in containers::children(conn, &source.profile_id, Some(&source.id))? {
        clone_subtree(conn, &child, Some(&id), &child.name)?;
    }

    Ok(id)
}

/// Clona un'applicazione con tutti i suoi link dentro un contenitore.
pub fn duplicate_application(conn: &Connection, id: &str, new_name: &str) -> Result<Application> {
    let source = items::get_application(conn, id)?;
    let container_id = source.container_id.clone();
    let clone_id = clone_application(conn, &source, &container_id, new_name)?;
    items::get_application(conn, &clone_id)
}

fn clone_application(
    conn: &Connection,
    source: &Application,
    container_id: &str,
    name: &str,
) -> Result<String> {
    let id = new_id();
    let sort_order = ordering::append(
        conn,
        items::APPLICATIONS,
        "container_id",
        Some(container_id),
    )?;

    conn.execute(
        "INSERT INTO applications
           (id, profile_id, container_id, name, description, icon, color,
            danger_level, danger_prompt_id, is_favorite, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            source.profile_id,
            container_id,
            name,
            source.description,
            source.icon,
            source.color,
            source.danger_level,
            source.danger_prompt_id,
            source.is_favorite,
            sort_order
        ],
    )?;

    for link in items::list_links(conn, &source.id)? {
        conn.execute(
            "INSERT INTO links
               (id, application_id, name, url, kind, description, icon, color,
                danger_level, danger_prompt_id, is_favorite, is_default, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                new_id(),
                id,
                link.name,
                link.url,
                link.kind,
                link.description,
                link.icon,
                link.color,
                link.danger_level,
                link.danger_prompt_id,
                link.is_favorite,
                link.is_default,
                link.sort_order
            ],
        )?;
    }

    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, seed};
    use std::path::Path;

    fn fixture() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        seed::ensure_seed(&mut conn, "en-US").unwrap();

        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name)
             VALUES ('project', ?1, NULL, 'project', 'ACME')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name, danger_level)
             VALUES ('env', ?1, 'project', 'environment', 'PROD', 'critical')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO applications (id, profile_id, container_id, name)
             VALUES ('app', ?1, 'env', 'Camunda')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO links (id, application_id, name, url, is_default)
             VALUES ('l1', 'app', 'Admin', 'https://acme.example/admin', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO links (id, application_id, name, url)
             VALUES ('l2', 'app', 'Tasklist', 'https://acme.example/tasklist')",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn duplicates_the_whole_subtree_with_new_ids() {
        let conn = fixture();
        let clone = duplicate_container(&conn, "project", "ACME (copia)").unwrap();

        assert_ne!(clone.id, "project");
        assert_eq!(clone.name, "ACME (copia)");
        assert_eq!(clone.slug.as_deref(), Some("acme-copia"));

        let containers_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM containers", [], |r| r.get(0))
            .unwrap();
        let applications: i64 = conn
            .query_row("SELECT COUNT(*) FROM applications", [], |r| r.get(0))
            .unwrap();
        let links: i64 = conn
            .query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0))
            .unwrap();

        assert_eq!(containers_count, 4, "progetto + ambiente, per due");
        assert_eq!(applications, 2);
        assert_eq!(links, 4);
    }

    /// Perdere la protezione durante una copia sarebbe un bug pericoloso.
    #[test]
    fn duplication_preserves_the_danger_level() {
        let conn = fixture();
        duplicate_container(&conn, "project", "ACME 2").unwrap();

        let critical: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM containers WHERE danger_level = 'critical'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(critical, 2);
    }

    #[test]
    fn duplicated_application_keeps_links_and_default() {
        let conn = fixture();
        let clone = duplicate_application(&conn, "app", "Camunda (copia)").unwrap();

        let links: Vec<_> = items::list_links(&conn, &clone.id).unwrap();
        assert_eq!(links.len(), 2);
        assert!(links.iter().any(|link| link.is_default));
        assert!(links.iter().all(|link| link.id != "l1" && link.id != "l2"));
    }

    #[test]
    fn the_clone_is_a_sibling_not_a_child() {
        let conn = fixture();
        let clone = duplicate_container(&conn, "env", "TEST").unwrap();
        assert_eq!(clone.parent_id.as_deref(), Some("project"));
    }
}
