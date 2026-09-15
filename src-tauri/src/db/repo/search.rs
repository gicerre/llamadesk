//! Ricerca globale per la Command Palette.
//!
//! Scelta deliberata: nessun indice FTS5, ma una scansione `LIKE` con
//! punteggio calcolato in Rust. Un workspace personale ha centinaia di link,
//! non milioni: su questi volumi una scansione SQLite e' sotto il millisecondo,
//! e in cambio evitiamo un indice da mantenere sincronizzato a ogni scrittura
//! e una dipendenza dalla presenza di FTS5 nel binario SQLite.
//! Se un giorno i numeri lo giustificheranno, il punto di innesto e' qui.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::Connection;

use crate::db::repo::{containers, usage};
use crate::domain::SearchHit;
use crate::services::danger;

const MAX_RESULTS: usize = 40;

/// Punteggio di attinenza puramente testuale.
fn text_score(needle: &str, haystack: &str, weight: f64) -> f64 {
    let haystack = haystack.to_lowercase();
    if haystack == needle {
        100.0 * weight
    } else if haystack.starts_with(needle) {
        60.0 * weight
    } else if haystack.contains(needle) {
        35.0 * weight
    } else {
        0.0
    }
}

/// Percorso leggibile di un contenitore ("ACME / PRODUZIONE / Cliente A"),
/// memorizzato per non ripetere la CTE su ogni risultato.
fn path_of(
    conn: &Connection,
    container_id: &str,
    cache: &mut HashMap<String, String>,
) -> Result<String> {
    if let Some(cached) = cache.get(container_id) {
        return Ok(cached.clone());
    }

    let mut names: Vec<String> = containers::chain(conn, container_id)?
        .into_iter()
        .map(|node| node.name)
        .collect();
    names.reverse();

    let path = names.join(" / ");
    cache.insert(container_id.to_string(), path.clone());
    Ok(path)
}

pub fn search(conn: &Connection, profile_id: &str, query: &str) -> Result<Vec<SearchHit>> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }

    let pattern = format!("%{needle}%");
    let frecency = usage::frecency(conn, profile_id)?;
    let mut cache: HashMap<String, String> = HashMap::new();
    let mut hits: Vec<SearchHit> = Vec::new();

    /* --- link: il risultato piu' utile, quello che si apre davvero --------- */
    {
        let mut statement = conn.prepare(
            "SELECT l.id, l.name, l.url, l.icon, l.color, l.description,
                    a.name AS application_name, a.container_id,
                    GROUP_CONCAT(t.name, ' ') AS tags
               FROM links l
               JOIN applications a ON a.id = l.application_id
               LEFT JOIN taggables tg ON tg.entity_type = 'link' AND tg.entity_id = l.id
               LEFT JOIN tags t ON t.id = tg.tag_id
              WHERE a.profile_id = ?1
                AND (LOWER(l.name) LIKE ?2 OR LOWER(l.url) LIKE ?2
                     OR LOWER(a.name) LIKE ?2 OR LOWER(IFNULL(l.description, '')) LIKE ?2
                     OR LOWER(IFNULL(t.name, '')) LIKE ?2)
              GROUP BY l.id",
        )?;

        let rows = statement.query_map(rusqlite::params![profile_id, pattern], |row| {
            Ok((
                row.get::<_, String>("id")?,
                row.get::<_, String>("name")?,
                row.get::<_, String>("url")?,
                row.get::<_, Option<String>>("icon")?,
                row.get::<_, Option<String>>("color")?,
                row.get::<_, String>("application_name")?,
                row.get::<_, String>("container_id")?,
                row.get::<_, Option<String>>("tags")?,
            ))
        })?;

        for row in rows {
            let (id, name, url, icon, color, application_name, container_id, tags) = row?;

            let mut score = text_score(&needle, &name, 1.0)
                + text_score(&needle, &application_name, 0.8)
                + text_score(&needle, &url, 0.4)
                + tags
                    .as_deref()
                    .map(|tags| text_score(&needle, tags, 0.6))
                    .unwrap_or(0.0);

            score += frecency.get(&id).copied().unwrap_or(0.0);

            let danger = danger::resolve_for_link(conn, &id)?;

            hits.push(SearchHit {
                entity_type: "link".into(),
                id,
                name: format!("{application_name} · {name}"),
                subtitle: Some(url),
                path: path_of(conn, &container_id, &mut cache)?,
                icon,
                color,
                danger_level: danger.level,
                score,
            });
        }
    }

    /* --- contenitori: progetti, ambienti, contesti, gruppi ---------------- */
    {
        let mut statement = conn.prepare(
            "SELECT id, name, kind, icon, color, parent_id
               FROM containers
              WHERE profile_id = ?1 AND is_archived = 0
                AND (LOWER(name) LIKE ?2 OR LOWER(IFNULL(description, '')) LIKE ?2)",
        )?;

        let rows = statement.query_map(rusqlite::params![profile_id, pattern], |row| {
            Ok((
                row.get::<_, String>("id")?,
                row.get::<_, String>("name")?,
                row.get::<_, String>("kind")?,
                row.get::<_, Option<String>>("icon")?,
                row.get::<_, Option<String>>("color")?,
                row.get::<_, Option<String>>("parent_id")?,
            ))
        })?;

        for row in rows {
            let (id, name, kind, icon, color, parent_id) = row?;
            let danger = danger::resolve_for_container(conn, &id)?;
            let path = match &parent_id {
                Some(parent) => path_of(conn, parent, &mut cache)?,
                None => String::new(),
            };

            // Un contenitore non si "apre": a parita' di testo vale meno di un
            // link, che e' l'azione che l'utente cerca nove volte su dieci.
            let score = text_score(&needle, &name, 0.9);

            hits.push(SearchHit {
                entity_type: "container".into(),
                id,
                name,
                subtitle: Some(kind),
                path,
                icon,
                color,
                danger_level: danger.level,
                score,
            });
        }
    }

    // Ordinamento decrescente per punteggio; a parita', il nome piu' corto
    // (di solito il piu' pertinente) viene prima.
    hits.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.len().cmp(&b.name.len()))
    });
    hits.truncate(MAX_RESULTS);

    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_prefer_exact_then_prefix_then_substring() {
        assert!(
            text_score("camunda", "Camunda", 1.0) > text_score("camunda", "Camunda Admin", 1.0)
        );
        assert!(
            text_score("camunda", "Camunda Admin", 1.0) > text_score("camunda", "Old Camunda", 1.0)
        );
        assert_eq!(text_score("camunda", "Jenkins", 1.0), 0.0);
    }

    #[test]
    fn weight_scales_the_score() {
        assert_eq!(text_score("x", "x", 0.5) * 2.0, text_score("x", "x", 1.0));
    }
}
