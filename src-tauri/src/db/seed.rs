//! Inizializzazione "Plug & Play" al primo avvio.
//!
//! Filosofia: l'applicazione nasce VUOTA. Qui si crea solo lo stretto
//! indispensabile perche' l'interfaccia abbia senso: un profilo e le
//! impostazioni di default. Nessun workspace, nessun progetto, nessun link:
//! il primo workspace lo crea l'utente dal benvenuto.

use anyhow::Result;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::AppSettings;

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
    let profile_name = if language == "it" {
        "Personale"
    } else {
        "Personal"
    };

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO profiles (id, name, sort_order) VALUES (?1, ?2, 1000)",
        params![profile_id, profile_name],
    )?;

    let settings = AppSettings {
        language: language.to_string(),
        active_profile_id: Some(profile_id.clone()),
        ..AppSettings::default()
    };
    write_settings(&tx, &settings)?;

    // Il flag di benvenuto vive fuori da AppSettings: e' uno stato di ciclo di
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

/* ==================== impostazioni per profilo (overlay) ================== */

/// Le uniche chiavi che un profilo puo' sovrascrivere.
///
/// Fuori da questo elenco restano deliberatamente:
///  * le due scorciatoie globali — sono registrate nell'OS da un solo processo,
///    e lo stesso tasto non puo' significare cose diverse a seconda del profilo
///    attivo dentro l'applicazione;
///  * avvio automatico, avvio minimizzato, chiusura nella tray e animazione di
///    apertura — riguardano il ciclo di vita dell'applicazione, non il
///    contesto di lavoro;
///  * `activeProfileId`, che per definizione e' globale.
pub const PROFILE_SCOPED_KEYS: [&str; 4] = ["theme", "language", "density", "openDelayMs"];

pub fn is_profile_scoped(key: &str) -> bool {
    PROFILE_SCOPED_KEYS.contains(&key)
}

/// Chiavi che questo profilo sovrascrive: servono alla UI per mostrare quali
/// impostazioni sono "solo per questo profilo".
pub fn read_profile_overrides(conn: &Connection, profile_id: &str) -> Result<Vec<String>> {
    let mut statement =
        conn.prepare("SELECT key FROM profile_settings WHERE profile_id = ?1 ORDER BY key")?;
    let rows = statement.query_map([profile_id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Impostazioni effettive: quelle globali, sovrascritte da quelle del profilo.
///
/// Un profilo senza override si comporta esattamente come prima che questa
/// funzionalita' esistesse — ed e' lo stato di partenza di ogni profilo.
pub fn read_effective_settings(conn: &Connection, profile_id: &str) -> Result<AppSettings> {
    let mut object = settings_object(conn, "SELECT key, value FROM settings", None)?;

    let overrides = settings_object(
        conn,
        "SELECT key, value FROM profile_settings WHERE profile_id = ?1",
        Some(profile_id),
    )?;

    for (key, value) in overrides {
        // Una chiave non piu' sovrascrivibile (per esempio dopo un
        // aggiornamento che la toglie dall'elenco) viene semplicemente ignorata.
        if is_profile_scoped(&key) {
            object.insert(key, value);
        }
    }

    Ok(serde_json::from_value(serde_json::Value::Object(object))?)
}

/// Imposta un override per il profilo. `None` lo rimuove: il profilo torna a
/// seguire il valore globale.
pub fn write_profile_setting(
    conn: &Connection,
    profile_id: &str,
    key: &str,
    value: Option<&str>,
) -> Result<()> {
    if !is_profile_scoped(key) {
        return Err(anyhow::anyhow!(
            "l'impostazione '{key}' non puo' variare per profilo"
        ));
    }

    match value {
        None => {
            conn.execute(
                "DELETE FROM profile_settings WHERE profile_id = ?1 AND key = ?2",
                params![profile_id, key],
            )?;
        }
        Some(value) => {
            conn.execute(
                "INSERT INTO profile_settings (profile_id, key, value, updated_at)
                 VALUES (?1, ?2, ?3, datetime('now'))
                 ON CONFLICT(profile_id, key)
                   DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![profile_id, key, value],
            )?;
        }
    }
    Ok(())
}

/// Legge una tabella chiave/valore in un oggetto JSON.
fn settings_object(
    conn: &Connection,
    sql: &str,
    parameter: Option<&str>,
) -> Result<serde_json::Map<String, serde_json::Value>> {
    let mut statement = conn.prepare(sql)?;
    let mapper = |row: &rusqlite::Row<'_>| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?));

    let rows: Vec<(String, String)> = match parameter {
        Some(value) => statement
            .query_map([value], mapper)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
        None => statement
            .query_map([], mapper)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    };

    let mut object = serde_json::Map::new();
    for (key, raw) in rows {
        // Un valore illeggibile non deve far crashare l'avvio: viene ignorato
        // e la chiave ricade sul proprio default.
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
            object.insert(key, parsed);
        }
    }
    Ok(object)
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

    /// I valori dell'overlay sono JSON, come nella tabella `settings`.
    const JSON_DARK: &str = "\"dark\"";
    const JSON_LIGHT: &str = "\"light\"";
    const JSON_IT: &str = "\"it\"";

    fn first_profile(conn: &Connection) -> String {
        conn.query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap()
    }

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
        for table in ["nodes", "edges", "profile_workspaces", "tags", "tools"] {
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

    #[test]
    fn a_profile_without_overrides_follows_the_global_settings() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();
        let profile = first_profile(&conn);

        let global = read_settings(&conn).unwrap();
        let effective = read_effective_settings(&conn, &profile).unwrap();

        assert_eq!(effective.theme, global.theme);
        assert_eq!(effective.language, global.language);
        assert!(read_profile_overrides(&conn, &profile).unwrap().is_empty());
    }

    #[test]
    fn an_override_wins_over_the_global_value() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();
        let profile = first_profile(&conn);

        write_profile_setting(&conn, &profile, "theme", Some(JSON_DARK)).unwrap();
        write_profile_setting(&conn, &profile, "language", Some(JSON_IT)).unwrap();

        let effective = read_effective_settings(&conn, &profile).unwrap();
        assert_eq!(effective.theme, "dark");
        assert_eq!(effective.language, "it");

        // Le impostazioni globali non sono state toccate.
        assert_eq!(read_settings(&conn).unwrap().theme, "system");
        assert_eq!(
            read_profile_overrides(&conn, &profile).unwrap(),
            vec!["language".to_string(), "theme".to_string()]
        );
    }

    /// Togliere un override deve far tornare il profilo al valore globale,
    /// non lasciarlo con l'ultimo valore impostato.
    #[test]
    fn removing_an_override_falls_back_to_global() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();
        let profile = first_profile(&conn);

        write_profile_setting(&conn, &profile, "theme", Some(JSON_DARK)).unwrap();
        write_profile_setting(&conn, &profile, "theme", None).unwrap();

        assert_eq!(
            read_effective_settings(&conn, &profile).unwrap().theme,
            "system"
        );
        assert!(read_profile_overrides(&conn, &profile).unwrap().is_empty());
    }

    /// Le scorciatoie globali sono registrate nell'OS una volta sola: non
    /// possono dipendere dal profilo attivo, e il backend lo impedisce.
    #[test]
    fn global_only_settings_cannot_be_overridden() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();
        let profile = first_profile(&conn);

        for key in [
            "globalShortcut",
            "captureShortcut",
            "autostart",
            "openerAnimation",
            "activeProfileId",
        ] {
            assert!(
                write_profile_setting(&conn, &profile, key, Some(JSON_DARK)).is_err(),
                "'{key}' non dovrebbe essere sovrascrivibile per profilo"
            );
        }
    }

    /// Due profili devono poter avere aspetti diversi nello stesso momento.
    #[test]
    fn two_profiles_keep_separate_appearances() {
        let mut conn = migrated();
        ensure_seed(&mut conn, "en-US").unwrap();
        let work = first_profile(&conn);

        conn.execute(
            "INSERT INTO profiles (id, name, sort_order) VALUES ('personal', 'Personale', 2000)",
            [],
        )
        .unwrap();

        write_profile_setting(&conn, &work, "theme", Some(JSON_DARK)).unwrap();
        write_profile_setting(&conn, "personal", "theme", Some(JSON_LIGHT)).unwrap();

        assert_eq!(read_effective_settings(&conn, &work).unwrap().theme, "dark");
        assert_eq!(
            read_effective_settings(&conn, "personal").unwrap().theme,
            "light"
        );
    }

    /// Cancellare un profilo non deve lasciare i suoi override nel database.
    #[test]
    fn overrides_die_with_their_profile() {
        let mut conn = migrated();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        ensure_seed(&mut conn, "en-US").unwrap();
        let profile = first_profile(&conn);

        write_profile_setting(&conn, &profile, "theme", Some(JSON_DARK)).unwrap();
        conn.execute("DELETE FROM profiles WHERE id = ?1", [&profile])
            .unwrap();

        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM profile_settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
    }
}
