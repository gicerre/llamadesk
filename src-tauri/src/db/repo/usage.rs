//! Cronologia d'uso locale.
//!
//! Alimenta i "Recenti", il ranking della Command Palette e l'health check dei
//! link. Non lascia mai il computer: nessun URL viene contattato, nessun ping,
//! nessuna verifica remota. La "salute" di un link e' semplicemente da quanto
//! tempo l'utente non lo apre.

use anyhow::Result;
use rusqlite::{params, Connection};

use crate::domain::LinkUsage;

pub fn record(conn: &Connection, entity_type: &str, entity_id: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO usage_events (entity_type, entity_id) VALUES (?1, ?2)",
        params![entity_type, entity_id],
    )?;
    Ok(())
}

fn classify(days: Option<i64>, stale_days: i64) -> String {
    match days {
        None => "never".to_string(),
        Some(days) if days <= 30 => "fresh".to_string(),
        Some(days) if days < stale_days => "aging".to_string(),
        Some(_) => "dormant".to_string(),
    }
}

/// Statistiche d'uso di tutti i link di un profilo.
pub fn link_usage(conn: &Connection, profile_id: &str, stale_days: i64) -> Result<Vec<LinkUsage>> {
    let mut statement = conn.prepare(
        "SELECT l.id AS link_id,
                MAX(u.opened_at) AS last_opened_at,
                COUNT(u.id) AS open_count,
                CAST(julianday('now') - julianday(MAX(u.opened_at)) AS INTEGER) AS days
           FROM links l
           JOIN applications a ON a.id = l.application_id
           LEFT JOIN usage_events u
                  ON u.entity_type = 'link' AND u.entity_id = l.id
          WHERE a.profile_id = ?1
          GROUP BY l.id",
    )?;

    let rows = statement.query_map([profile_id], |row| {
        let days: Option<i64> = row.get("days")?;
        Ok(LinkUsage {
            link_id: row.get("link_id")?,
            last_opened_at: row.get("last_opened_at")?,
            open_count: row.get("open_count")?,
            days_since_last_open: days,
            staleness: classify(days, stale_days),
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Frecency grezza per la ricerca: quante aperture e quanto di recente.
pub fn frecency(
    conn: &Connection,
    profile_id: &str,
) -> Result<std::collections::HashMap<String, f64>> {
    let mut statement = conn.prepare(
        "SELECT u.entity_id AS id,
                COUNT(*) AS opens,
                CAST(julianday('now') - julianday(MAX(u.opened_at)) AS INTEGER) AS days
           FROM usage_events u
           JOIN links l ON l.id = u.entity_id
           JOIN applications a ON a.id = l.application_id
          WHERE u.entity_type = 'link' AND a.profile_id = ?1
          GROUP BY u.entity_id",
    )?;

    let rows = statement.query_map([profile_id], |row| {
        let id: String = row.get("id")?;
        let opens: i64 = row.get("opens")?;
        let days: Option<i64> = row.get("days")?;
        Ok((id, score(opens, days)))
    })?;

    Ok(rows.collect::<rusqlite::Result<std::collections::HashMap<_, _>>>()?)
}

/// Un link aperto spesso e di recente sale; uno vecchio non scende sotto zero.
pub fn score(opens: i64, days_since_last: Option<i64>) -> f64 {
    let recency = match days_since_last {
        None => 0.0,
        Some(days) if days <= 1 => 30.0,
        Some(days) if days <= 7 => 20.0,
        Some(days) if days <= 30 => 10.0,
        Some(_) => 0.0,
    };
    recency + (opens.min(20) as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_link_staleness() {
        assert_eq!(classify(None, 90), "never");
        assert_eq!(classify(Some(3), 90), "fresh");
        assert_eq!(classify(Some(30), 90), "fresh");
        assert_eq!(classify(Some(60), 90), "aging");
        assert_eq!(classify(Some(120), 90), "dormant");
        // La soglia e' configurabile dall'utente.
        assert_eq!(classify(Some(45), 40), "dormant");
    }

    #[test]
    fn frecency_favours_recent_and_frequent() {
        let recent_frequent = score(15, Some(0));
        let recent_rare = score(1, Some(0));
        let old_frequent = score(15, Some(400));

        assert!(recent_frequent > recent_rare);
        assert!(recent_frequent > old_frequent);
        assert_eq!(score(0, None), 0.0);
        // Il conteggio e' limitato: un link aperto 5000 volte non schiaccia tutto.
        assert_eq!(score(5000, None), 20.0);
    }
}
