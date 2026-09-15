//! Ordinamento frazionario per il drag & drop.
//!
//! Spostare un elemento fra due vicini costa UNA sola UPDATE: si scrive il
//! valore intermedio fra i due `sort_order`. Quando lo spazio fra due vicini
//! si esaurisce (dopo molte migliaia di spostamenti nello stesso punto) la
//! lista viene ribilanciata su multipli di 1000.

use anyhow::Result;
use rusqlite::Connection;

/// Distanza minima ammessa fra due posizioni prima di dover ribilanciare.
pub const MIN_GAP: f64 = 1e-6;
pub const STEP: f64 = 1000.0;

/// Calcola la posizione fra due vicini. `None` significa "estremo della lista".
pub fn rank_between(previous: Option<f64>, next: Option<f64>) -> f64 {
    match (previous, next) {
        (None, None) => STEP,
        (Some(previous), None) => previous + STEP,
        (None, Some(next)) => next - STEP,
        (Some(previous), Some(next)) => (previous + next) / 2.0,
    }
}

/// Vero se fra i due vicini non c'e' piu' spazio utile.
pub fn needs_rebalance(previous: Option<f64>, next: Option<f64>) -> bool {
    match (previous, next) {
        (Some(previous), Some(next)) => (next - previous).abs() < MIN_GAP * 2.0,
        _ => false,
    }
}

/// Riscrive le posizioni di un insieme come 1000, 2000, 3000...
/// `scope_sql` deve contenere un solo segnaposto `?1` per il valore di scope.
fn rebalance(
    conn: &Connection,
    table: &str,
    scope_column: &str,
    scope: Option<&str>,
) -> Result<()> {
    let ids: Vec<String> = {
        let query = format!(
            "SELECT id FROM {table} WHERE {scope_column} IS ?1 ORDER BY sort_order, created_at"
        );
        let mut statement = conn.prepare(&query)?;
        let rows = statement.query_map([scope], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let update = format!("UPDATE {table} SET sort_order = ?1 WHERE id = ?2");
    for (index, id) in ids.iter().enumerate() {
        conn.execute(&update, rusqlite::params![(index as f64 + 1.0) * STEP, id])?;
    }
    Ok(())
}

/// Posizione da assegnare a un elemento inserito fra `previous_id` e `next_id`.
/// Ribilancia in automatico se lo spazio e' esaurito, e in quel caso ricalcola.
pub fn place(
    conn: &Connection,
    table: &str,
    scope_column: &str,
    scope: Option<&str>,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<f64> {
    let read = |id: Option<&str>| -> Result<Option<f64>> {
        let Some(id) = id else { return Ok(None) };
        let query = format!("SELECT sort_order FROM {table} WHERE id = ?1");
        Ok(conn
            .query_row(&query, [id], |row| row.get::<_, f64>(0))
            .ok())
    };

    let previous = read(previous_id)?;
    let next = read(next_id)?;

    if needs_rebalance(previous, next) {
        rebalance(conn, table, scope_column, scope)?;
        let previous = read(previous_id)?;
        let next = read(next_id)?;
        return Ok(rank_between(previous, next));
    }

    Ok(rank_between(previous, next))
}

/// Posizione in coda a un insieme, usata dalle creazioni.
pub fn append(
    conn: &Connection,
    table: &str,
    scope_column: &str,
    scope: Option<&str>,
) -> Result<f64> {
    let query = format!(
        "SELECT COALESCE(MAX(sort_order), 0) + {STEP} FROM {table} WHERE {scope_column} IS ?1"
    );
    Ok(conn.query_row(&query, [scope], |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn places_between_neighbours() {
        assert_eq!(rank_between(Some(1000.0), Some(2000.0)), 1500.0);
        assert_eq!(rank_between(Some(1000.0), None), 2000.0);
        assert_eq!(rank_between(None, Some(1000.0)), 0.0);
        assert_eq!(rank_between(None, None), 1000.0);
    }

    #[test]
    fn detects_exhausted_gaps() {
        assert!(!needs_rebalance(Some(1000.0), Some(1000.5)));
        assert!(needs_rebalance(Some(1000.0), Some(1000.0 + 1e-9)));
        assert!(!needs_rebalance(None, Some(1000.0)));
    }

    /// Ripetere lo spostamento nello stesso punto non deve mai produrre
    /// due posizioni identiche: e' il caso che romperebbe l'ordinamento.
    #[test]
    fn repeated_insertions_stay_ordered() {
        let mut previous = 1000.0_f64;
        let next = 2000.0_f64;
        for _ in 0..40 {
            let value = rank_between(Some(previous), Some(next));
            if needs_rebalance(Some(previous), Some(next)) {
                break;
            }
            assert!(
                value > previous && value < next,
                "posizione fuori intervallo"
            );
            previous = value;
        }
    }
}
