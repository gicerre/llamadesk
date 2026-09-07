//! Tag e note: due annotazioni polimorfiche che possono agganciarsi a
//! qualunque entità della gerarchia.
//!
//! Sono deliberatamente separate dal resto: aggiungere un tag non modifica
//! l'elemento taggato, e cancellare l'elemento porta via tag e note con sé
//! (vincoli di chiave esterna per i tag, pulizia esplicita per le note, che
//! sono polimorfiche e quindi fuori dalla portata delle foreign key).

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};

use crate::db::seed::new_id;
use crate::domain::{Note, Tag};

/* -------------------------------------------------------------------- tag */

pub fn map_tag(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
    })
}

pub fn list_tags(conn: &Connection, profile_id: &str) -> Result<Vec<Tag>> {
    let mut statement = conn.prepare("SELECT * FROM tags WHERE profile_id = ?1 ORDER BY name")?;
    let rows = statement.query_map([profile_id], map_tag)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Crea il tag se non esiste, altrimenti restituisce quello esistente.
/// L'utente scrive un nome, non gestisce un'anagrafica di tag.
pub fn ensure_tag(conn: &Connection, profile_id: &str, name: &str, color: Option<&str>) -> Result<Tag> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("il nome del tag non puo' essere vuoto"));
    }

    if let Ok(existing) = conn.query_row(
        "SELECT * FROM tags WHERE profile_id = ?1 AND name = ?2 COLLATE NOCASE",
        params![profile_id, name],
        map_tag,
    ) {
        return Ok(existing);
    }

    let id = new_id();
    conn.execute(
        "INSERT INTO tags (id, profile_id, name, color) VALUES (?1, ?2, ?3, ?4)",
        params![id, profile_id, name, color],
    )?;

    Ok(conn.query_row("SELECT * FROM tags WHERE id = ?1", [&id], map_tag)?)
}

pub fn tags_for_entity(conn: &Connection, entity_type: &str, entity_id: &str) -> Result<Vec<Tag>> {
    let mut statement = conn.prepare(
        "SELECT t.* FROM tags t
           JOIN taggables g ON g.tag_id = t.id
          WHERE g.entity_type = ?1 AND g.entity_id = ?2
          ORDER BY t.name",
    )?;
    let rows = statement.query_map(params![entity_type, entity_id], map_tag)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Sostituisce l'intero insieme di tag di un'entità: la UI lavora per liste,
/// non per singole aggiunte e rimozioni.
pub fn set_entity_tags(
    conn: &Connection,
    profile_id: &str,
    entity_type: &str,
    entity_id: &str,
    names: &[String],
) -> Result<Vec<Tag>> {
    conn.execute(
        "DELETE FROM taggables WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )?;

    for name in names {
        let tag = ensure_tag(conn, profile_id, name, None)?;
        conn.execute(
            "INSERT OR IGNORE INTO taggables (tag_id, entity_type, entity_id) VALUES (?1, ?2, ?3)",
            params![tag.id, entity_type, entity_id],
        )?;
    }

    // Un tag rimasto senza alcun elemento sparisce: nessuna anagrafica morta.
    conn.execute(
        "DELETE FROM tags
          WHERE profile_id = ?1
            AND id NOT IN (SELECT tag_id FROM taggables)",
        [profile_id],
    )?;

    tags_for_entity(conn, entity_type, entity_id)
}

/* ------------------------------------------------------------------- note */

pub fn map_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get("id")?,
        entity_type: row.get("entity_type")?,
        entity_id: row.get("entity_id")?,
        content: row.get("content")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get_note(conn: &Connection, entity_type: &str, entity_id: &str) -> Result<Option<Note>> {
    Ok(conn
        .query_row(
            "SELECT * FROM notes WHERE entity_type = ?1 AND entity_id = ?2",
            params![entity_type, entity_id],
            map_note,
        )
        .ok())
}

/// Salva la nota. Un contenuto vuoto la elimina: una nota svuotata è una nota
/// cancellata, non una riga vuota da trascinarsi dietro.
pub fn set_note(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    content: &str,
) -> Result<Option<Note>> {
    if content.trim().is_empty() {
        conn.execute(
            "DELETE FROM notes WHERE entity_type = ?1 AND entity_id = ?2",
            params![entity_type, entity_id],
        )?;
        return Ok(None);
    }

    conn.execute(
        "INSERT INTO notes (id, entity_type, entity_id, content, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(entity_type, entity_id)
           DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        params![new_id(), entity_type, entity_id, content],
    )?;

    get_note(conn, entity_type, entity_id)
}

/// Note e tag di entità ormai cancellate: le foreign key non possono coprire
/// una relazione polimorfica, quindi ripuliamo noi all'avvio.
pub fn prune_orphans(conn: &Connection) -> Result<usize> {
    let notes = conn.execute(
        "DELETE FROM notes WHERE
           (entity_type = 'profile'     AND entity_id NOT IN (SELECT id FROM profiles))
        OR (entity_type = 'container'   AND entity_id NOT IN (SELECT id FROM containers))
        OR (entity_type = 'application' AND entity_id NOT IN (SELECT id FROM applications))
        OR (entity_type = 'link'        AND entity_id NOT IN (SELECT id FROM links))",
        [],
    )?;

    let taggables = conn.execute(
        "DELETE FROM taggables WHERE
           (entity_type = 'container'   AND entity_id NOT IN (SELECT id FROM containers))
        OR (entity_type = 'application' AND entity_id NOT IN (SELECT id FROM applications))
        OR (entity_type = 'link'        AND entity_id NOT IN (SELECT id FROM links))",
        [],
    )?;

    Ok(notes + taggables)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, seed};
    use std::path::Path;

    fn fixture() -> (Connection, String) {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        seed::ensure_seed(&mut conn, "en-US").unwrap();

        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO containers (id, profile_id, kind, name) VALUES ('c1', ?1, 'project', 'ACME')",
            [&profile],
        )
        .unwrap();

        (conn, profile)
    }

    #[test]
    fn tags_are_created_once_and_reused() {
        let (conn, profile) = fixture();

        let first = ensure_tag(&conn, &profile, "urgente", None).unwrap();
        let again = ensure_tag(&conn, &profile, "  URGENTE ", None).unwrap();

        assert_eq!(first.id, again.id, "il tag non deve essere duplicato");
        assert_eq!(list_tags(&conn, &profile).unwrap().len(), 1);
    }

    #[test]
    fn setting_tags_replaces_the_whole_set() {
        let (conn, profile) = fixture();

        set_entity_tags(&conn, &profile, "container", "c1", &["a".into(), "b".into()]).unwrap();
        let after = set_entity_tags(&conn, &profile, "container", "c1", &["b".into(), "c".into()])
            .unwrap();

        let names: Vec<_> = after.iter().map(|tag| tag.name.as_str()).collect();
        assert_eq!(names, vec!["b", "c"]);

        // "a" non è più usato da nessuno: non deve restare nell'anagrafica.
        assert!(list_tags(&conn, &profile)
            .unwrap()
            .iter()
            .all(|tag| tag.name != "a"));
    }

    #[test]
    fn emptying_a_note_deletes_it() {
        let (conn, _) = fixture();

        set_note(&conn, "container", "c1", "promemoria").unwrap();
        assert!(get_note(&conn, "container", "c1").unwrap().is_some());

        let removed = set_note(&conn, "container", "c1", "   ").unwrap();
        assert!(removed.is_none());
        assert!(get_note(&conn, "container", "c1").unwrap().is_none());
    }

    #[test]
    fn notes_survive_updates_without_duplicating() {
        let (conn, _) = fixture();

        set_note(&conn, "container", "c1", "prima").unwrap();
        let updated = set_note(&conn, "container", "c1", "dopo").unwrap().unwrap();

        assert_eq!(updated.content, "dopo");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    /// Le relazioni polimorfiche non hanno foreign key: se non ripulissimo,
    /// la nota di un progetto cancellato resterebbe lì per sempre.
    #[test]
    fn orphans_are_pruned() {
        let (conn, profile) = fixture();

        set_note(&conn, "container", "c1", "nota").unwrap();
        set_entity_tags(&conn, &profile, "container", "c1", &["x".into()]).unwrap();
        conn.execute("DELETE FROM containers WHERE id = 'c1'", []).unwrap();

        assert_eq!(prune_orphans(&conn).unwrap(), 2);
        assert!(get_note(&conn, "container", "c1").unwrap().is_none());
    }
}
