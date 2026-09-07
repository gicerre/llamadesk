//! Export e import della configurazione in JSON.
//!
//! Che cosa esce da qui: profili, gerarchia, applicazioni, link, tag, note,
//! quick workspaces, sfondi e i prompt personalizzati della Danger Zone.
//!
//! Che cosa NON esce, deliberatamente:
//!  * credenziali — non esistono, l'applicazione non ha un campo password;
//!  * la cronologia d'uso — è un dato di abitudini personali, non fa parte
//!    della configurazione e non ha senso condividerlo con un collega;
//!  * le impostazioni legate alla macchina (scorciatoie, avvio automatico,
//!    percorso del database).
//!
//! Il file è quindi condivisibile: "ecco come ho organizzato i nostri ambienti".

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection};

use crate::db::repo::{bundles, containers, items, library, profiles};
use crate::db::seed::new_id;
use crate::domain::{Background, BackupFile, BundleItemRow, DangerPrompt, ImportSummary, TaggableRow};

/// Versione del formato. Da incrementare solo per modifiche incompatibili.
pub const FORMAT_VERSION: u32 = 1;

/* ------------------------------------------------------------------ export */

pub fn build(conn: &Connection, app_version: &str) -> Result<BackupFile> {
    Ok(BackupFile {
        format_version: FORMAT_VERSION,
        app_version: app_version.to_string(),
        exported_at: conn.query_row("SELECT datetime('now')", [], |row| row.get(0))?,
        profiles: query(conn, "SELECT * FROM profiles ORDER BY sort_order", profiles::map)?,
        containers: query(conn, "SELECT * FROM containers", containers::map)?,
        applications: query(conn, "SELECT * FROM applications", items::map_application)?,
        links: query(conn, "SELECT * FROM links", items::map_link)?,
        tags: query(conn, "SELECT * FROM tags", library::map_tag)?,
        taggables: query(conn, "SELECT * FROM taggables", |row| {
            Ok(TaggableRow {
                tag_id: row.get("tag_id")?,
                entity_type: row.get("entity_type")?,
                entity_id: row.get("entity_id")?,
            })
        })?,
        notes: query(conn, "SELECT * FROM notes", library::map_note)?,
        bundles: query(conn, "SELECT * FROM bundles", bundles::map)?,
        bundle_items: query(conn, "SELECT * FROM bundle_items", |row| {
            Ok(BundleItemRow {
                bundle_id: row.get("bundle_id")?,
                link_id: row.get("link_id")?,
                sort_order: row.get("sort_order")?,
            })
        })?,
        backgrounds: query(conn, "SELECT * FROM backgrounds", map_background)?,
        // I prompt built-in vivono nel codice: esportarli significherebbe
        // congelare le traduzioni nel file di backup.
        danger_prompts: query(
            conn,
            "SELECT * FROM danger_prompts WHERE is_builtin = 0",
            map_prompt,
        )?,
    })
}

pub fn export_to_file(conn: &Connection, app_version: &str, path: &Path) -> Result<usize> {
    let backup = build(conn, app_version)?;
    let json = serde_json::to_string_pretty(&backup)?;
    fs::write(path, &json).with_context(|| format!("scrittura di {} non riuscita", path.display()))?;
    Ok(json.len())
}

/* ------------------------------------------------------------------ import */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportMode {
    /// Aggiunge il contenuto al database esistente, con id nuovi.
    Merge,
    /// Sostituisce tutto: cancella profili e contenuti, poi ripristina.
    Replace,
}

impl ImportMode {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "merge" => Ok(Self::Merge),
            "replace" => Ok(Self::Replace),
            other => Err(anyhow!("modalita' di importazione sconosciuta: {other}")),
        }
    }
}

pub fn read_file(path: &Path) -> Result<BackupFile> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("lettura di {} non riuscita", path.display()))?;

    let backup: BackupFile =
        serde_json::from_str(&raw).context("il file non è un backup di LlamaDesk valido")?;

    if backup.format_version > FORMAT_VERSION {
        return Err(anyhow!(
            "questo backup è stato creato da una versione più recente di LlamaDesk (formato {})",
            backup.format_version
        ));
    }

    Ok(backup)
}

/// Applica un backup. Tutto avviene dentro la transazione del chiamante:
/// o il ripristino riesce per intero, o il database resta com'era.
pub fn apply(conn: &Connection, backup: &BackupFile, mode: ImportMode) -> Result<ImportSummary> {
    if mode == ImportMode::Replace {
        // La cascata dei profili porta via gerarchia, applicazioni e link;
        // note e taggables sono polimorfici e vanno ripuliti a mano.
        conn.execute("DELETE FROM profiles", [])?;
        conn.execute("DELETE FROM notes", [])?;
        conn.execute("DELETE FROM taggables", [])?;
        conn.execute("DELETE FROM backgrounds", [])?;
        conn.execute("DELETE FROM danger_prompts WHERE is_builtin = 0", [])?;
    }

    // In merge ogni id viene rimappato: due backup dello stesso progetto
    // devono poter convivere senza collidere.
    let mut remap: HashMap<String, String> = HashMap::new();
    let mut id_of = |original: &str| -> String {
        match mode {
            ImportMode::Replace => original.to_string(),
            ImportMode::Merge => remap
                .entry(original.to_string())
                .or_insert_with(new_id)
                .clone(),
        }
    };

    let mut summary = ImportSummary::default();

    for background in &backup.backgrounds {
        conn.execute(
            "INSERT OR REPLACE INTO backgrounds (id, name, source, value, blur, overlay_opacity)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id_of(&background.id),
                background.name,
                background.source,
                background.value,
                background.blur,
                background.overlay_opacity
            ],
        )?;
    }

    for profile in &backup.profiles {
        conn.execute(
            "INSERT OR REPLACE INTO profiles (id, name, icon, color, background_id, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id_of(&profile.id),
                profile.name,
                profile.icon,
                profile.color,
                profile.background_id.as_ref().map(|id| id_of(id)),
                profile.sort_order
            ],
        )?;
        summary.profiles += 1;
    }

    for prompt in &backup.danger_prompts {
        conn.execute(
            "INSERT OR REPLACE INTO danger_prompts
               (id, profile_id, name, level, title, message, confirm_label, cancel_label, confirm_word, is_builtin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)",
            params![
                id_of(&prompt.id),
                prompt.profile_id.as_ref().map(|id| id_of(id)),
                prompt.name,
                prompt.level,
                prompt.title,
                prompt.message,
                prompt.confirm_label,
                prompt.cancel_label,
                prompt.confirm_word
            ],
        )?;
    }

    // I contenitori si inseriscono dal più superficiale al più profondo:
    // un figlio non può esistere prima del proprio padre.
    let mut pending: Vec<_> = backup.containers.iter().collect();
    let mut inserted: Vec<String> = Vec::new();
    let mut guard = 0;

    while !pending.is_empty() {
        guard += 1;
        if guard > 64 {
            return Err(anyhow!("gerarchia del backup incoerente: riferimenti circolari"));
        }

        let (ready, rest): (Vec<_>, Vec<_>) = pending.into_iter().partition(|container| {
            container
                .parent_id
                .as_ref()
                .map(|parent| inserted.contains(parent))
                .unwrap_or(true)
        });

        if ready.is_empty() {
            return Err(anyhow!("gerarchia del backup incompleta: padri mancanti"));
        }

        for container in ready {
            conn.execute(
                "INSERT OR REPLACE INTO containers
                   (id, profile_id, parent_id, kind, name, slug, description, icon, color,
                    badge_text, background_id, danger_level, danger_prompt_id,
                    is_favorite, is_archived, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    id_of(&container.id),
                    id_of(&container.profile_id),
                    container.parent_id.as_ref().map(|id| id_of(id)),
                    container.kind,
                    container.name,
                    container.slug,
                    container.description,
                    container.icon,
                    container.color,
                    container.badge_text,
                    container.background_id.as_ref().map(|id| id_of(id)),
                    container.danger_level,
                    container.danger_prompt_id.as_ref().map(|id| id_of(id)),
                    container.is_favorite,
                    container.is_archived,
                    container.sort_order
                ],
            )?;
            inserted.push(container.id.clone());
            summary.containers += 1;
        }

        pending = rest;
    }

    for application in &backup.applications {
        conn.execute(
            "INSERT OR REPLACE INTO applications
               (id, profile_id, container_id, name, description, icon, color,
                danger_level, danger_prompt_id, is_favorite, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                id_of(&application.id),
                id_of(&application.profile_id),
                id_of(&application.container_id),
                application.name,
                application.description,
                application.icon,
                application.color,
                application.danger_level,
                application.danger_prompt_id.as_ref().map(|id| id_of(id)),
                application.is_favorite,
                application.sort_order
            ],
        )?;
        summary.applications += 1;
    }

    for link in &backup.links {
        conn.execute(
            "INSERT OR REPLACE INTO links
               (id, application_id, name, url, kind, description, icon, color,
                danger_level, danger_prompt_id, is_favorite, is_default, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                id_of(&link.id),
                id_of(&link.application_id),
                link.name,
                link.url,
                link.kind,
                link.description,
                link.icon,
                link.color,
                link.danger_level,
                link.danger_prompt_id.as_ref().map(|id| id_of(id)),
                link.is_favorite,
                link.is_default,
                link.sort_order
            ],
        )?;
        summary.links += 1;
    }

    for tag in &backup.tags {
        conn.execute(
            "INSERT OR REPLACE INTO tags (id, profile_id, name, color) VALUES (?1, ?2, ?3, ?4)",
            params![id_of(&tag.id), id_of(&tag.profile_id), tag.name, tag.color],
        )?;
        summary.tags += 1;
    }

    for taggable in &backup.taggables {
        conn.execute(
            "INSERT OR IGNORE INTO taggables (tag_id, entity_type, entity_id) VALUES (?1, ?2, ?3)",
            params![
                id_of(&taggable.tag_id),
                taggable.entity_type,
                id_of(&taggable.entity_id)
            ],
        )?;
    }

    for note in &backup.notes {
        conn.execute(
            "INSERT OR REPLACE INTO notes (id, entity_type, entity_id, content, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                id_of(&note.id),
                note.entity_type,
                id_of(&note.entity_id),
                note.content,
                note.updated_at
            ],
        )?;
        summary.notes += 1;
    }

    for bundle in &backup.bundles {
        conn.execute(
            "INSERT OR REPLACE INTO bundles
               (id, profile_id, name, icon, color, is_temporary, expires_at, open_delay_ms, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id_of(&bundle.id),
                id_of(&bundle.profile_id),
                bundle.name,
                bundle.icon,
                bundle.color,
                bundle.is_temporary,
                bundle.expires_at,
                bundle.open_delay_ms,
                bundle.sort_order
            ],
        )?;
        summary.bundles += 1;
    }

    for item in &backup.bundle_items {
        conn.execute(
            "INSERT OR IGNORE INTO bundle_items (bundle_id, link_id, sort_order) VALUES (?1, ?2, ?3)",
            params![id_of(&item.bundle_id), id_of(&item.link_id), item.sort_order],
        )?;
    }

    Ok(summary)
}

/* ------------------------------------------------------------------ utili */

fn query<T, F>(conn: &Connection, sql: &str, mapper: F) -> Result<Vec<T>>
where
    F: Fn(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    let mut statement = conn.prepare(sql)?;
    let rows = statement.query_map([], mapper)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn map_background(row: &rusqlite::Row<'_>) -> rusqlite::Result<Background> {
    Ok(Background {
        id: row.get("id")?,
        name: row.get("name")?,
        source: row.get("source")?,
        value: row.get("value")?,
        blur: row.get("blur")?,
        overlay_opacity: row.get("overlay_opacity")?,
    })
}

fn map_prompt(row: &rusqlite::Row<'_>) -> rusqlite::Result<DangerPrompt> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, seed};
    use crate::domain::Bundle;

    /// Bundle minimo tipizzato, per non ripetere la struct in ogni test.
    fn empty_bundle(profile_id: &str) -> Bundle {
        Bundle {
            id: new_id(),
            profile_id: profile_id.to_string(),
            name: "Test".into(),
            icon: None,
            color: None,
            is_temporary: false,
            expires_at: None,
            open_delay_ms: 250,
            sort_order: 1000.0,
        }
    }

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
             VALUES ('p', ?1, NULL, 'project', 'ACME')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO containers (id, profile_id, parent_id, kind, name, danger_level)
             VALUES ('e', ?1, 'p', 'environment', 'PROD', 'critical')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO applications (id, profile_id, container_id, name)
             VALUES ('a', ?1, 'e', 'Camunda')",
            [&profile],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO links (id, application_id, name, url, is_default)
             VALUES ('l', 'a', 'Admin', 'https://acme.example/admin', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, entity_type, entity_id, content)
             VALUES ('n', 'container', 'p', 'promemoria')",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn export_captures_the_whole_configuration() {
        let conn = fixture();
        let backup = build(&conn, "0.1.0").unwrap();

        assert_eq!(backup.format_version, FORMAT_VERSION);
        assert_eq!(backup.containers.len(), 2);
        assert_eq!(backup.applications.len(), 1);
        assert_eq!(backup.links.len(), 1);
        assert_eq!(backup.notes.len(), 1);
        // I prompt built-in restano fuori.
        assert!(backup.danger_prompts.is_empty());
    }

    /// La cronologia d'uso è un dato personale: non deve finire in un file
    /// destinato a essere condiviso con un collega.
    #[test]
    fn export_never_contains_usage_history() {
        let conn = fixture();
        conn.execute(
            "INSERT INTO usage_events (entity_type, entity_id) VALUES ('link', 'l')",
            [],
        )
        .unwrap();

        let json = serde_json::to_string(&build(&conn, "0.1.0").unwrap()).unwrap();
        assert!(!json.contains("usageEvents"));
        assert!(!json.contains("openedAt"));
    }

    #[test]
    fn replace_restores_an_identical_database() {
        let conn = fixture();
        let backup = build(&conn, "0.1.0").unwrap();

        conn.execute("DELETE FROM profiles", []).unwrap();
        conn.execute("DELETE FROM notes", []).unwrap();
        assert_eq!(
            0,
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM containers", [], |r| r.get(0))
                .unwrap()
        );

        let summary = apply(&conn, &backup, ImportMode::Replace).unwrap();

        assert_eq!(summary.containers, 2);
        assert_eq!(summary.links, 1);
        // Gli id sono preservati: un ripristino è un ripristino.
        let link_id: String = conn
            .query_row("SELECT id FROM links LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(link_id, "l");
    }

    #[test]
    fn replace_preserves_the_danger_level() {
        let conn = fixture();
        let backup = build(&conn, "0.1.0").unwrap();
        conn.execute("DELETE FROM profiles", []).unwrap();
        apply(&conn, &backup, ImportMode::Replace).unwrap();

        let level: String = conn
            .query_row("SELECT danger_level FROM containers WHERE id = 'e'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(level, "critical");
    }

    /// Importare due volte lo stesso file in merge deve raddoppiare i dati,
    /// non sovrascriverli: è il caso "un collega mi manda la sua struttura".
    #[test]
    fn merge_adds_content_with_fresh_ids() {
        let conn = fixture();
        let backup = build(&conn, "0.1.0").unwrap();

        apply(&conn, &backup, ImportMode::Merge).unwrap();

        let containers: i64 = conn
            .query_row("SELECT COUNT(*) FROM containers", [], |r| r.get(0))
            .unwrap();
        let links: i64 = conn
            .query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0))
            .unwrap();

        assert_eq!(containers, 4, "i due contenitori originali più le copie");
        assert_eq!(links, 2);

        // L'originale non è stato toccato.
        assert_eq!(
            1,
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM links WHERE id = 'l'", [], |r| r
                .get(0))
                .unwrap()
        );
    }

    #[test]
    fn merge_keeps_the_hierarchy_consistent() {
        let conn = fixture();
        let backup = build(&conn, "0.1.0").unwrap();
        apply(&conn, &backup, ImportMode::Merge).unwrap();

        // Ogni ambiente importato deve puntare a un progetto esistente.
        let orphans: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM containers
                  WHERE parent_id IS NOT NULL
                    AND parent_id NOT IN (SELECT id FROM containers)",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphans, 0);
    }

    #[test]
    fn rejects_backups_from_a_newer_format() {
        let conn = fixture();
        let mut backup = build(&conn, "0.1.0").unwrap();
        backup.format_version = FORMAT_VERSION + 1;

        let json = serde_json::to_string(&backup).unwrap();
        let path = std::env::temp_dir().join("llamadesk-newer-backup.json");
        fs::write(&path, json).unwrap();

        let error = read_file(&path).unwrap_err().to_string();
        assert!(error.contains("versione più recente"), "messaggio: {error}");

        fs::remove_file(&path).ok();
    }

    #[test]
    fn round_trip_through_a_file() {
        let conn = fixture();
        let path = std::env::temp_dir().join("llamadesk-roundtrip.json");

        export_to_file(&conn, "0.1.0", &path).unwrap();
        let restored = read_file(&path).unwrap();

        assert_eq!(restored.containers.len(), 2);
        assert_eq!(restored.links[0].url, "https://acme.example/admin");

        fs::remove_file(&path).ok();
    }

    #[test]
    fn import_mode_parsing_is_explicit() {
        assert_eq!(ImportMode::parse("merge").unwrap(), ImportMode::Merge);
        assert_eq!(ImportMode::parse("replace").unwrap(), ImportMode::Replace);
        assert!(ImportMode::parse("qualsiasi").is_err());
    }

    #[test]
    fn bundles_survive_the_round_trip() {
        let conn = fixture();
        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();

        let bundle = empty_bundle(&profile);
        conn.execute(
            "INSERT INTO bundles (id, profile_id, name, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params![bundle.id, bundle.profile_id, bundle.name, bundle.sort_order],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bundle_items (bundle_id, link_id, sort_order) VALUES (?1, 'l', 1000)",
            [&bundle.id],
        )
        .unwrap();

        let backup = build(&conn, "0.1.0").unwrap();
        assert_eq!(backup.bundles.len(), 1);
        assert_eq!(backup.bundle_items.len(), 1);

        conn.execute("DELETE FROM profiles", []).unwrap();
        apply(&conn, &backup, ImportMode::Replace).unwrap();

        let items: i64 = conn
            .query_row("SELECT COUNT(*) FROM bundle_items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(items, 1);
    }
}
