//! Profili: chi sta usando LlamaDesk. La libreria di workspace e' comune
//! (D1), quindi eliminare un profilo porta via solo i workspace che nessun
//! altro profilo vede.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::atomic;
use crate::db::repo::{nodes, workspaces};
use crate::db::seed::new_id;
use crate::domain::{Crumb, Profile, ProfileDeleteImpact, ProfilePatch};
use crate::services::hierarchy;

pub fn map(row: &Row<'_>) -> rusqlite::Result<Profile> {
    let lock_hash: Option<String> = row.get("lock_hash")?;
    Ok(Profile {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        avatar_asset_id: row.get("avatar_asset_id")?,
        color_main: row.get("color_main")?,
        color_secondary: row.get("color_secondary")?,
        has_lock: lock_hash.is_some(),
        lock_auto_minutes: row.get("lock_auto_minutes")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Profile> {
    conn.query_row("SELECT * FROM profiles WHERE id = ?1", [id], map)
        .optional()?
        .ok_or_else(|| anyhow!("profilo non trovato: {id}"))
}

pub fn list(conn: &Connection) -> Result<Vec<Profile>> {
    let mut statement = conn.prepare("SELECT * FROM profiles ORDER BY sort_order, created_at")?;
    let rows = statement.query_map([], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn clean_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome del profilo non puo' essere vuoto"));
    }
    Ok(name.to_string())
}

pub fn create(conn: &Connection, name: &str) -> Result<Profile> {
    let name = clean_name(name)?;
    let id = new_id();
    let sort_order: f64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1000 FROM profiles",
        [],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT INTO profiles (id, name, sort_order) VALUES (?1, ?2, ?3)",
        params![id, name, sort_order],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, patch: &ProfilePatch) -> Result<Profile> {
    let current = get(conn, id)?;

    let name = match &patch.name {
        Some(name) => clean_name(name)?,
        None => current.name,
    };
    let text = |value: &Option<Option<String>>, fallback: Option<String>| -> Option<String> {
        match value {
            Some(value) => value
                .as_deref()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string),
            None => fallback,
        }
    };

    conn.execute(
        "UPDATE profiles
            SET name = ?1, description = ?2, color_main = ?3, color_secondary = ?4,
                lock_auto_minutes = ?5, updated_at = datetime('now')
          WHERE id = ?6",
        params![
            name,
            text(&patch.description, current.description),
            text(&patch.color_main, current.color_main),
            text(&patch.color_secondary, current.color_secondary),
            patch.lock_auto_minutes.unwrap_or(current.lock_auto_minutes),
            id,
        ],
    )?;
    get(conn, id)
}

/// Workspace visibili solo in questo profilo: sono quelli che se ne vanno.
fn exclusive_workspaces(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT pw.workspace_id FROM profile_workspaces pw
           JOIN nodes n ON n.id = pw.workspace_id AND n.deleted_at IS NULL
          WHERE pw.profile_id = ?1
            AND NOT EXISTS (SELECT 1 FROM profile_workspaces other
                             WHERE other.workspace_id = pw.workspace_id AND other.profile_id <> ?1)
          ORDER BY pw.sort_order",
    )?;
    let rows = statement.query_map([id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_impact(conn: &Connection, id: &str) -> Result<ProfileDeleteImpact> {
    get(conn, id)?;
    let exclusive = exclusive_workspaces(conn, id)?;

    let mut nodes_deleted = 0;
    let mut workspaces_deleted = Vec::new();
    for workspace_id in &exclusive {
        let impact = hierarchy::delete_impact(conn, workspace_id)?;
        nodes_deleted += impact.deleted.iter().map(|entry| entry.count).sum::<u32>();
        workspaces_deleted.push(Crumb::from(&nodes::get(conn, workspace_id)?));
    }

    let visible = workspaces::list(conn, id, true)?.len() as u32;

    Ok(ProfileDeleteImpact {
        workspaces_deleted,
        workspaces_kept: visible.saturating_sub(exclusive.len() as u32),
        nodes_deleted,
    })
}

/// Elimina il profilo e i workspace che solo lui vedeva. L'ultimo profilo non
/// si elimina: senza un contesto l'applicazione non ha niente da mostrare.
pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    get(conn, id)?;
    let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))?;
    if remaining <= 1 {
        return Err(anyhow!("l'ultimo profilo non si puo' eliminare"));
    }

    atomic(conn, |conn| {
        for workspace_id in exclusive_workspaces(conn, id)? {
            hierarchy::delete_permanently(conn, &workspace_id)?;
        }
        conn.execute("DELETE FROM profiles WHERE id = ?1", [id])?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodeKind;

    #[test]
    fn the_last_profile_cannot_be_deleted() {
        let (conn, only) = database();
        assert!(delete(&conn, &only).is_err());
    }

    #[test]
    fn the_lock_hash_never_leaves_rust() {
        let (conn, profile) = database();
        conn.execute(
            "UPDATE profiles SET lock_hash = 'argon2id$...' WHERE id = ?1",
            [&profile],
        )
        .unwrap();

        let loaded = get(&conn, &profile).unwrap();
        assert!(loaded.has_lock);
        let json = serde_json::to_string(&loaded).unwrap();
        assert!(!json.contains("argon2id"));
    }

    #[test]
    fn deleting_a_profile_keeps_workspaces_other_profiles_see() {
        let (conn, me) = database();
        let demo = create(&conn, "Presentazione").unwrap().id;

        let private = workspace(&conn, &demo, "Prove");
        let shared = workspace(&conn, &demo, "Lavoro");
        workspaces::show(&conn, &me, &shared).unwrap();
        child(&conn, &demo, &private, NodeKind::Project, "Bozza");
        let kept_project = child(&conn, &demo, &shared, NodeKind::Project, "SpecialHub");

        let impact = delete_impact(&conn, &demo).unwrap();
        assert_eq!(impact.workspaces_deleted.len(), 1);
        assert_eq!(impact.workspaces_deleted[0].id, private);
        assert_eq!(impact.workspaces_kept, 1);
        assert_eq!(impact.nodes_deleted, 2);

        delete(&conn, &demo).unwrap();

        assert!(nodes::get(&conn, &private).is_err());
        assert!(nodes::get(&conn, &kept_project).is_ok());
        let gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM nodes WHERE id = ?1",
                [&private],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            gone, 0,
            "senza cestino: il workspace esclusivo non resta nel database"
        );
        // Il creatore sparito non rompe i nodi che aveva creato.
        assert_eq!(
            nodes::get(&conn, &kept_project)
                .unwrap()
                .created_by_profile_id,
            None
        );
    }

    #[test]
    fn update_changes_only_what_is_given() {
        let (conn, profile) = database();
        let patch = ProfilePatch {
            color_main: Some(Some("#3C62C4".into())),
            ..ProfilePatch::default()
        };
        let updated = update(&conn, &profile, &patch).unwrap();
        assert_eq!(updated.name, "Personale");
        assert_eq!(updated.color_main.as_deref(), Some("#3C62C4"));

        let clear = ProfilePatch {
            color_main: Some(None),
            ..ProfilePatch::default()
        };
        assert_eq!(update(&conn, &profile, &clear).unwrap().color_main, None);
    }
}
