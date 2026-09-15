//! Widget della dashboard: quali, in che ordine, con quale configurazione.
//!
//! Ogni profilo ha **un widget per tipo**. "Aggiungere" un widget significa
//! renderlo visibile, "toglierlo" nasconderlo: la configurazione sopravvive, e
//! non esistono doppioni da spiegare (due "Recenti" non servono a nessuno).

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, Row};
use serde_json::{Map, Value};

use crate::db::seed::new_id;
use crate::domain::DashboardWidget;
use crate::services::ordering;

const TABLE: &str = "dashboard_widgets";

/// Tutti i tipi previsti dallo schema (il CHECK di `dashboard_widgets`),
/// nell'ordine in cui compaiono a un profilo nuovo.
pub const KINDS: [&str; 7] = [
    "favorites",
    "recents",
    "quick_workspaces",
    "calendars",
    "projects",
    "notes",
    "tags",
];

/// Quelli visibili di partenza; gli altri esistono ma restano nascosti.
pub const DEFAULT_VISIBLE: [&str; 4] = ["favorites", "recents", "quick_workspaces", "calendars"];

/// I widget che sono elenchi, e quindi accettano un numero massimo di righe.
const LISTS: [&str; 6] = [
    "favorites",
    "recents",
    "quick_workspaces",
    "calendars",
    "projects",
    "notes",
];

pub const MAX_LIMIT: u64 = 50;

pub fn map(row: &Row<'_>) -> rusqlite::Result<DashboardWidget> {
    let config: String = row.get("config")?;
    Ok(DashboardWidget {
        id: row.get("id")?,
        profile_id: row.get("profile_id")?,
        kind: row.get("kind")?,
        // Una configurazione illeggibile non deve togliere la dashboard:
        // si riparte da quella di default.
        config: serde_json::from_str(&config).unwrap_or_else(|_| Value::Object(Map::new())),
        is_visible: row.get("is_visible")?,
        sort_order: row.get("sort_order")?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<DashboardWidget> {
    conn.query_row("SELECT * FROM dashboard_widgets WHERE id = ?1", [id], map)
        .map_err(|_| anyhow!("widget non trovato: {id}"))
}

/// Crea i widget che mancano al profilo, in coda.
///
/// Serve ai profili creati dopo il primo avvio, a quelli ripristinati da un
/// export, e a un tipo aggiunto domani allo schema: nessuno di questi casi
/// richiede una migrazione dei dati.
pub fn ensure_all(conn: &Connection, profile_id: &str) -> Result<()> {
    for kind in KINDS {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM dashboard_widgets WHERE profile_id = ?1 AND kind = ?2)",
            params![profile_id, kind],
            |row| row.get(0),
        )?;
        if exists {
            continue;
        }

        let sort_order = ordering::append(conn, TABLE, "profile_id", Some(profile_id))?;
        conn.execute(
            "INSERT INTO dashboard_widgets (id, profile_id, kind, is_visible, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                new_id(),
                profile_id,
                kind,
                DEFAULT_VISIBLE.contains(&kind),
                sort_order
            ],
        )?;
    }
    Ok(())
}

/// Tutti i widget del profilo, visibili e nascosti, nell'ordine della dashboard.
pub fn list(conn: &Connection, profile_id: &str) -> Result<Vec<DashboardWidget>> {
    let mut statement = conn.prepare(
        "SELECT * FROM dashboard_widgets WHERE profile_id = ?1 ORDER BY sort_order, kind",
    )?;
    let rows = statement.query_map([profile_id], map)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Tiene solo le chiavi che il tipo di widget capisce, e rifiuta i valori
/// fuori dominio invece di salvarli e scoprirli al prossimo render.
///
/// * `wide`: occupa tutta la larghezza della griglia (tutti i widget);
/// * `limit`: quante righe mostrare (solo i widget che sono elenchi).
pub fn sanitize_config(kind: &str, config: &Value) -> Result<Value> {
    let incoming = config
        .as_object()
        .ok_or_else(|| anyhow!("la configurazione di un widget e' un oggetto"))?;
    let mut clean = Map::new();

    if let Some(wide) = incoming.get("wide") {
        let wide = wide
            .as_bool()
            .ok_or_else(|| anyhow!("'wide' deve essere vero o falso"))?;
        clean.insert("wide".into(), Value::Bool(wide));
    }

    if let Some(limit) = incoming.get("limit") {
        if !LISTS.contains(&kind) {
            return Err(anyhow!("il widget '{kind}' non ha un numero di righe"));
        }
        let limit = limit
            .as_u64()
            .filter(|value| (1..=MAX_LIMIT).contains(value))
            .ok_or_else(|| anyhow!("'limit' deve essere un intero fra 1 e {MAX_LIMIT}"))?;
        clean.insert("limit".into(), Value::from(limit));
    }

    Ok(Value::Object(clean))
}

/// Cambia visibilità e/o configurazione. `None` = campo non toccato.
pub fn update(
    conn: &Connection,
    id: &str,
    is_visible: Option<bool>,
    config: Option<&Value>,
) -> Result<DashboardWidget> {
    let current = get(conn, id)?;

    if let Some(visible) = is_visible {
        conn.execute(
            "UPDATE dashboard_widgets SET is_visible = ?1 WHERE id = ?2",
            params![visible, id],
        )?;
    }

    if let Some(config) = config {
        let clean = sanitize_config(&current.kind, config)?;
        conn.execute(
            "UPDATE dashboard_widgets SET config = ?1 WHERE id = ?2",
            params![clean.to_string(), id],
        )?;
    }

    get(conn, id)
}

/// Sposta un widget fra due vicini: una sola UPDATE, come per l'albero.
pub fn move_widget(
    conn: &Connection,
    id: &str,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<DashboardWidget> {
    let current = get(conn, id)?;

    let sort_order = ordering::place(
        conn,
        TABLE,
        "profile_id",
        Some(&current.profile_id),
        previous_id,
        next_id,
    )?;
    conn.execute(
        "UPDATE dashboard_widgets SET sort_order = ?1 WHERE id = ?2",
        params![sort_order, id],
    )?;

    get(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrator, repo::profiles, seed};
    use serde_json::json;
    use std::path::Path;

    fn fixture() -> (Connection, String) {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        migrator::run(&mut conn, Path::new("memory.db")).unwrap();
        seed::ensure_seed(&mut conn, "en-US").unwrap();

        let profile: String = conn
            .query_row("SELECT id FROM profiles LIMIT 1", [], |r| r.get(0))
            .unwrap();
        (conn, profile)
    }

    fn kinds(widgets: &[DashboardWidget], visible: bool) -> Vec<&str> {
        widgets
            .iter()
            .filter(|widget| widget.is_visible == visible)
            .map(|widget| widget.kind.as_str())
            .collect()
    }

    #[test]
    fn every_profile_gets_one_widget_per_kind() {
        let (conn, first) = fixture();
        let second = profiles::create(&conn, "Lavoro", None).unwrap().id;

        for profile in [&first, &second] {
            ensure_all(&conn, profile).unwrap();
            // Idempotente: una seconda chiamata non crea doppioni.
            ensure_all(&conn, profile).unwrap();

            let widgets = list(&conn, profile).unwrap();
            assert_eq!(widgets.len(), KINDS.len());
            assert_eq!(kinds(&widgets, true), DEFAULT_VISIBLE);
            assert_eq!(kinds(&widgets, false), ["projects", "notes", "tags"]);
        }
    }

    #[test]
    fn config_keeps_only_what_the_kind_understands() {
        assert_eq!(
            sanitize_config(
                "recents",
                &json!({ "wide": true, "limit": 5, "colour": "red" })
            )
            .unwrap(),
            json!({ "wide": true, "limit": 5 })
        );
        assert_eq!(
            sanitize_config("tags", &json!({ "wide": false })).unwrap(),
            json!({ "wide": false })
        );

        assert!(sanitize_config("tags", &json!({ "limit": 5 })).is_err());
        assert!(sanitize_config("recents", &json!({ "limit": 0 })).is_err());
        assert!(sanitize_config("recents", &json!({ "limit": 51 })).is_err());
        assert!(sanitize_config("recents", &json!({ "wide": "yes" })).is_err());
        assert!(sanitize_config("recents", &json!([1, 2])).is_err());
    }

    #[test]
    fn widgets_can_be_hidden_configured_and_moved() {
        let (conn, profile) = fixture();
        ensure_all(&conn, &profile).unwrap();
        let widgets = list(&conn, &profile).unwrap();
        let id_of = |kind: &str| {
            widgets
                .iter()
                .find(|widget| widget.kind == kind)
                .unwrap()
                .id
                .clone()
        };

        let recents = update(
            &conn,
            &id_of("recents"),
            Some(false),
            Some(&json!({ "limit": 3 })),
        )
        .unwrap();
        assert!(!recents.is_visible);
        assert_eq!(recents.config, json!({ "limit": 3 }));

        // "Calendari" in testa, prima di "Preferiti".
        move_widget(&conn, &id_of("calendars"), None, Some(&id_of("favorites"))).unwrap();
        let order: Vec<String> = list(&conn, &profile)
            .unwrap()
            .into_iter()
            .map(|widget| widget.kind)
            .collect();
        assert_eq!(order[..3], ["calendars", "favorites", "recents"]);
    }
}
