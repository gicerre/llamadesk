//! Inizializzazione "Plug & Play" al primo avvio.
//!
//! Filosofia: l'applicazione nasce VUOTA. Qui si crea solo lo stretto
//! indispensabile perche' l'interfaccia abbia senso — un profilo, le
//! impostazioni di default, i tre prompt di conferma predefiniti e i widget
//! della dashboard. Nessun progetto, nessun ambiente, nessun link: la struttura
//! la costruisce l'utente.

use anyhow::Result;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::AppSettings;

/// I prompt built-in contengono CHIAVI i18n: il frontend le risolve nella
/// lingua corrente. Diventano testo letterale solo quando l'utente li modifica.
const BUILTIN_PROMPTS: [(&str, &str, &str); 3] = [
    ("warning", "danger.builtin.warning", "Warning"),
    ("danger", "danger.builtin.danger", "Danger"),
    ("critical", "danger.builtin.critical", "Critical"),
];

const DEFAULT_WIDGETS: [&str; 4] = ["favorites", "recents", "quick_workspaces", "calendars"];

pub fn new_id() -> String {
    Uuid::now_v7().to_string()
}

/// Vero se il database non conteneva ancora alcun profilo.
pub fn is_empty(conn: &Connection) -> Result<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))?;
    Ok(count == 0)
}

/// Crea il minimo indispensabile. Non fa nulla se il database e' gia' popolato.
pub fn ensure_seed(conn: &mut Connection, system_locale: &str) -> Result<()> {
    if !is_empty(conn)? {
        return Ok(());
    }

    let language = normalize_language(system_locale);
    let profile_id = new_id();
    let profile_name = if language == "it" { "Personale" } else { "Personal" };

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO profiles (id, name, icon, sort_order) VALUES (?1, ?2, ?3, 1000)",
        params![profile_id, profile_name, "\u{1F999}"],
    )?;

    for (level, key, name) in BUILTIN_PROMPTS {
        tx.execute(
            "INSERT INTO danger_prompts
               (id, profile_id, name, level, title, message, confirm_label, cancel_label, confirm_word, is_builtin)
             VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)",
            params![
                new_id(),
                name,
                level,
                format!("{key}.title"),
                format!("{key}.message"),
                format!("{key}.confirm"),
                format!("{key}.cancel"),
                if level == "critical" { Some("PROCEED") } else { None },
            ],
        )?;
    }

    for (index, kind) in DEFAULT_WIDGETS.iter().enumerate() {
        tx.execute(
            "INSERT INTO dashboard_widgets (id, profile_id, kind, sort_order)
             VALUES (?1, ?2, ?3, ?4)",
            params![new_id(), profile_id, kind, (index as f64 + 1.0) * 1000.0],
        )?;
    }

    let settings = AppSettings {
        language: language.to_string(),
        active_profile_id: Some(profile_id.clone()),
        ..AppSettings::default()
    };
    write_settings(&tx, &settings)?;

    // Il flag di onboarding vive fuori da AppSettings: e' uno stato di ciclo di
    // vita, non una preferenza, e viene consumato una volta sola.
    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('firstRun', 'true')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [],
    )?;

    tx.commit()?;
    Ok(())
}

/// Serializza l'intera struct impostazioni come righe chiave/valore JSON.
pub fn write_settings(conn: &Connection, settings: &AppSettings) -> Result<()> {
    let value = serde_json::to_value(settings)?;
    let object = value
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("le impostazioni non sono un oggetto JSON"))?;

    for (key, entry) in object {
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, entry.to_string()],
        )?;
    }
    Ok(())
}

/// Rilegge le impostazioni. Le chiavi assenti ricadono sul default della struct.
pub fn read_settings(conn: &Connection) -> Result<AppSettings> {
    let mut statement = conn.prepare("SELECT key, value FROM settings")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut object = serde_json::Map::new();
    for row in rows {
        let (key, raw) = row?;
        // Un valore illeggibile non deve far crashare l'avvio: viene ignorato
        // e la chiave ricade sul proprio default.
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
            object.insert(key, parsed);
        }
    }

    Ok(serde_json::from_value(serde_json::Value::Object(object))?)
}

pub fn read_flag(conn: &Connection, key: &str) -> Result<bool> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .ok();
    Ok(matches!(raw.as_deref(), Some("true")))
}

pub fn write_flag(conn: &Connection, key: &str, value: bool) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, if value { "true" } else { "false" }],
    )?;
    Ok(())
}

/// "it-IT" -> "it". Qualsiasi lingua non supportata ricade sull'inglese.
fn normalize_language(locale: &str) -> &'static str {
    match locale.get(0..2).map(str::to_ascii_lowercase).as_deref() {
        Some("it") => "it",
        _ => "en",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrator;
    use std::path::Path;

    fn migrated() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        conn
    }

    #[test]
    fn seeds_exactly_one_profile_and_nothing_else() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "it-IT").unwrap();

        let profiles: i64 = conn
            .query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(profiles, 1);

        // L'app nasce vuota: nessun contenuto precaricato.
        for table in ["containers", "applications", "links", "tags", "bundles"] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 0, "la tabella {table} dovrebbe essere vuota");
        }
    }

    #[test]
    fn seeding_is_idempotent() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();
        ensure_seed(&mut conn, "en-US").unwrap();

        let profiles: i64 = conn
            .query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(profiles, 1);
    }

    #[test]
    fn adopts_system_language_on_first_run() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "it-IT").unwrap();

        let settings = read_settings(&conn).unwrap();
        assert_eq!(settings.language, "it");
        assert!(settings.active_profile_id.is_some());
        assert!(read_flag(&conn, "firstRun").unwrap());
    }

    #[test]
    fn unknown_locale_falls_back_to_english() {
        assert_eq!(normalize_language("de-DE"), "en");
        assert_eq!(normalize_language(""), "en");
        assert_eq!(normalize_language("IT"), "it");
    }

    #[test]
    fn settings_roundtrip_preserves_values() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();

        let mut settings = read_settings(&conn).unwrap();
        settings.theme = "dark".into();
        settings.open_delay_ms = 400;
        write_settings(&conn, &settings).unwrap();

        let reloaded = read_settings(&conn).unwrap();
        assert_eq!(reloaded.theme, "dark");
        assert_eq!(reloaded.open_delay_ms, 400);
    }
}
