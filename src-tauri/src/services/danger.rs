//! Motore della Danger Zone.
//!
//! Regola unica, valida per tutta l'applicazione:
//! **vince l'override esplicito piu' vicino alla foglia.**
//!
//! ```text
//! link → application → group → context → environment → project → (default: normal)
//! ```
//!
//! `danger_level = NULL` significa "eredita"; un valore e' un override. Cosi'
//! un ambiente marcato `critical` protegge tutto cio' che sta sotto, ma un
//! singolo link puo' dichiarare `normal` per sfilarsi (o `critical` per
//! proteggersi su un ramo altrimenti innocuo).

use std::collections::BTreeMap;

use anyhow::Result;
use rusqlite::{Connection, Row};

use crate::db::repo::{containers, items};
use crate::domain::{DangerPrompt, OpenIntent, ResolvedDanger};

/// Livelli in ordine di severita' crescente.
pub const LEVELS: [&str; 4] = ["normal", "warning", "danger", "critical"];

pub fn severity(level: &str) -> usize {
    LEVELS.iter().position(|value| *value == level).unwrap_or(0)
}

fn map_prompt(row: &Row<'_>) -> rusqlite::Result<DangerPrompt> {
    Ok(DangerPrompt {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        name: row.get("name")?,
        level: row.get("level")?,
        title: row.get("title")?,
        message: row.get("message")?,
        confirm_label: row.get("confirm_label")?,
        cancel_label: row.get("cancel_label")?,
        confirm_word: row.get("confirm_word")?,
        is_builtin: row.get("is_builtin")?,
    })
}

pub fn list_prompts(conn: &Connection) -> Result<Vec<DangerPrompt>> {
    let mut statement = conn.prepare("SELECT * FROM danger_prompts ORDER BY is_builtin DESC, name")?;
    let rows = statement.query_map([], map_prompt)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn prompt_by_id(conn: &Connection, id: &str) -> Result<Option<DangerPrompt>> {
    Ok(conn
        .query_row("SELECT * FROM danger_prompts WHERE id = ?1", [id], map_prompt)
        .ok())
}

/// Prompt predefinito per un livello, usato quando l'entita' non ne indica uno.
pub fn builtin_prompt(conn: &Connection, level: &str) -> Result<Option<DangerPrompt>> {
    Ok(conn
        .query_row(
            "SELECT * FROM danger_prompts WHERE level = ?1 AND is_builtin = 1 LIMIT 1",
            [level],
            map_prompt,
        )
        .ok())
}

/// Risoluzione a cascata partendo da un contenitore.
pub fn resolve_for_container(conn: &Connection, container_id: &str) -> Result<ResolvedDanger> {
    let chain = containers::chain(conn, container_id)?;

    for (index, node) in chain.iter().enumerate() {
        if let Some(level) = &node.danger_level {
            return Ok(ResolvedDanger {
                level: level.clone(),
                inherited_from_id: Some(node.id.clone()),
                inherited_from_name: Some(node.name.clone()),
                inherited_from_kind: Some(node.kind.clone()),
                is_own: index == 0,
                prompt_id: node.danger_prompt_id.clone(),
            });
        }
    }

    Ok(ResolvedDanger::normal())
}

/// Risoluzione a cascata partendo da un link: link → applicazione → gerarchia.
pub fn resolve_for_link(conn: &Connection, link_id: &str) -> Result<ResolvedDanger> {
    let link = items::get_link(conn, link_id)?;

    if let Some(level) = &link.danger_level {
        return Ok(ResolvedDanger {
            level: level.clone(),
            inherited_from_id: Some(link.id.clone()),
            inherited_from_name: Some(link.name.clone()),
            inherited_from_kind: Some("link".into()),
            is_own: true,
            prompt_id: link.danger_prompt_id.clone(),
        });
    }

    let application = items::get_application(conn, &link.application_id)?;
    if let Some(level) = &application.danger_level {
        return Ok(ResolvedDanger {
            level: level.clone(),
            inherited_from_id: Some(application.id.clone()),
            inherited_from_name: Some(application.name.clone()),
            inherited_from_kind: Some("application".into()),
            is_own: false,
            prompt_id: application.danger_prompt_id.clone(),
        });
    }

    let mut resolved = resolve_for_container(conn, &application.container_id)?;
    resolved.is_own = false;
    Ok(resolved)
}

/// Prepara tutto cio' che serve alla UI per decidere se e come chiedere conferma.
pub fn build_open_intent(conn: &Connection, link_id: &str) -> Result<OpenIntent> {
    let link = items::get_link(conn, link_id)?;
    let application = items::get_application(conn, &link.application_id)?;
    let chain = containers::chain(conn, &application.container_id)?;
    let danger = resolve_for_link(conn, link_id)?;

    let prompt = match &danger.prompt_id {
        Some(id) => prompt_by_id(conn, id)?,
        None => {
            if danger.requires_confirmation() {
                builtin_prompt(conn, &danger.level)?
            } else {
                None
            }
        }
    };

    // Segnaposto: il nodo piu' vicino di ciascun tipo lungo la catena.
    let mut placeholders = BTreeMap::new();
    placeholders.insert("application".to_string(), application.name.clone());
    placeholders.insert("link".to_string(), link.name.clone());
    placeholders.insert("url".to_string(), link.url.clone());

    for node in &chain {
        placeholders
            .entry(node.kind.clone())
            .or_insert_with(|| node.name.clone());
    }

    Ok(OpenIntent {
        link_id: link.id,
        link_name: link.name,
        url: link.url,
        application_name: application.name,
        danger,
        prompt,
        placeholders,
    })
}

/// Sostituisce i segnaposto `{nome}` nel testo di un prompt.
/// Un segnaposto sconosciuto viene lasciato invariato: meglio un `{cliente}`
/// visibile di una frase mutilata.
pub fn interpolate(template: &str, values: &BTreeMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in values {
        result = result.replace(&format!("{{{key}}}"), value);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, seed};
    use std::path::Path;

    /// Costruisce ACME / PRODUZIONE / Cliente A / Camunda / Admin.
    fn fixture() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        seed::ensure_seed(&mut conn, "it-IT").unwrap();

        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name) VALUES
             ('project', ?1, NULL, 'project', 'ACME')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name, danger_level, badge_text)
             VALUES ('env', ?1, 'project', 'environment', 'PRODUZIONE', 'critical', 'PROD')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name) VALUES
             ('ctx', ?1, 'env', 'context', 'Cliente A')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO applications (id, profile_id, container_id, name) VALUES
             ('app', ?1, 'ctx', 'Camunda')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO links (id, application_id, name, url, is_default) VALUES
             ('admin', 'app', 'Admin', 'https://acme.example/admin', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO links (id, application_id, name, url, danger_level) VALUES
             ('docs', 'app', 'Docs', 'https://acme.example/docs', 'normal')",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn inherits_level_from_the_environment() {
        let conn = fixture();
        let resolved = resolve_for_link(&conn, "admin").unwrap();

        assert_eq!(resolved.level, "critical");
        assert_eq!(resolved.inherited_from_name.as_deref(), Some("PRODUZIONE"));
        assert_eq!(resolved.inherited_from_kind.as_deref(), Some("environment"));
        assert!(!resolved.is_own);
        assert!(resolved.requires_confirmation());
    }

    /// Il caso che rende utile la regola: un singolo link si sfila dalla
    /// protezione ereditata dall'ambiente.
    #[test]
    fn a_link_can_opt_out_of_inherited_protection() {
        let conn = fixture();
        let resolved = resolve_for_link(&conn, "docs").unwrap();

        assert_eq!(resolved.level, "normal");
        assert!(resolved.is_own);
        assert!(!resolved.requires_confirmation());
    }

    /// ...e il caso opposto: un link si protegge su un ramo innocuo.
    #[test]
    fn a_link_can_opt_in_on_a_safe_branch() {
        let conn = fixture();
        conn.execute("UPDATE containers SET danger_level = NULL WHERE id = 'env'", [])
            .unwrap();
        conn.execute(
            "UPDATE links SET danger_level = 'danger' WHERE id = 'admin'",
            [],
        )
        .unwrap();

        let resolved = resolve_for_link(&conn, "admin").unwrap();
        assert_eq!(resolved.level, "danger");
        assert!(resolved.is_own);
    }

    /// L'override piu' vicino alla foglia vince su quello piu' lontano.
    #[test]
    fn nearest_override_wins() {
        let conn = fixture();
        conn.execute(
            "UPDATE containers SET danger_level = 'warning' WHERE id = 'project'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE applications SET danger_level = 'warning' WHERE id = 'app'",
            [],
        )
        .unwrap();

        // L'applicazione e' piu' vicina del progetto e dell'ambiente.
        let resolved = resolve_for_link(&conn, "admin").unwrap();
        assert_eq!(resolved.level, "warning");
        assert_eq!(resolved.inherited_from_kind.as_deref(), Some("application"));
    }

    #[test]
    fn defaults_to_normal_without_any_override() {
        let conn = fixture();
        conn.execute("UPDATE containers SET danger_level = NULL", [])
            .unwrap();

        let resolved = resolve_for_link(&conn, "admin").unwrap();
        assert_eq!(resolved.level, "normal");
        assert!(resolved.inherited_from_id.is_none());
        assert!(!resolved.requires_confirmation());
    }

    #[test]
    fn open_intent_resolves_placeholders_along_the_chain() {
        let conn = fixture();
        let intent = build_open_intent(&conn, "admin").unwrap();

        assert_eq!(intent.placeholders.get("project").unwrap(), "ACME");
        assert_eq!(intent.placeholders.get("environment").unwrap(), "PRODUZIONE");
        assert_eq!(intent.placeholders.get("context").unwrap(), "Cliente A");
        assert_eq!(intent.placeholders.get("application").unwrap(), "Camunda");
        assert_eq!(intent.placeholders.get("link").unwrap(), "Admin");

        // Livello critical: il prompt built-in deve essere allegato.
        let prompt = intent.prompt.expect("prompt mancante per livello critical");
        assert_eq!(prompt.level, "critical");
        assert!(prompt.is_builtin);
        assert_eq!(prompt.confirm_word.as_deref(), Some("PROCEED"));
    }

    #[test]
    fn interpolation_replaces_known_placeholders_only() {
        let mut values = BTreeMap::new();
        values.insert("environment".to_string(), "PRODUZIONE".to_string());
        values.insert("application".to_string(), "Camunda".to_string());

        let rendered = interpolate(
            "Stai aprendo {application} in {environment} per {cliente}",
            &values,
        );
        assert_eq!(
            rendered,
            "Stai aprendo Camunda in PRODUZIONE per {cliente}"
        );
    }

    #[test]
    fn severity_orders_levels() {
        assert!(severity("critical") > severity("danger"));
        assert!(severity("danger") > severity("warning"));
        assert!(severity("warning") > severity("normal"));
        assert_eq!(severity("sconosciuto"), 0);
    }

    #[test]
    fn container_resolution_marks_own_level() {
        let conn = fixture();

        let env = resolve_for_container(&conn, "env").unwrap();
        assert!(env.is_own);
        assert_eq!(env.level, "critical");

        let ctx = resolve_for_container(&conn, "ctx").unwrap();
        assert!(!ctx.is_own);
        assert_eq!(ctx.level, "critical");
        assert_eq!(ctx.inherited_from_name.as_deref(), Some("PRODUZIONE"));
    }

}
