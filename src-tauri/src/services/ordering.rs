//! Ordinamento frazionario per il drag & drop.
//!
//! Spostare un elemento fra due vicini costa UNA sola UPDATE: si scrive il
//! valore intermedio fra i due `sort_order`. Quando lo spazio fra due vicini
//! si esaurisce (dopo molte migliaia di spostamenti nello stesso punto) la
//! lista viene ribilanciata su multipli di 1000.
//!
//! Le liste ordinate sono sempre "elementi dentro uno scope": i figli di un
//! padre (`edges`), i workspace di un profilo (`profile_workspaces`). Una
//! `OrderedList` descrive quale tabella e quali colonne: l'algoritmo e' uno.

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

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

/// Una lista ordinata: `item_column` dentro `scope_column` di `table`.
/// I nomi sono costanti del codice, mai input dell'utente.
pub struct OrderedList {
    pub table: &'static str,
    pub scope_column: &'static str,
    pub item_column: &'static str,
}

/// I figli di un nodo.
pub const CHILDREN: OrderedList = OrderedList {
    table: "edges",
    scope_column: "parent_id",
    item_column: "child_id",
};

/// I workspace visti da un profilo.
pub const PROFILE_WORKSPACES: OrderedList = OrderedList {
    table: "profile_workspaces",
    scope_column: "profile_id",
    item_column: "workspace_id",
};

/// I passi dell'Avvio di un contenitore.
pub const LAUNCH_STEPS: OrderedList = OrderedList {
    table: "launch_steps",
    scope_column: "owner_id",
    item_column: "id",
};

impl OrderedList {
    fn read(&self, conn: &Connection, scope: &str, item: Option<&str>) -> Result<Option<f64>> {
        let Some(item) = item else { return Ok(None) };
        let query = format!(
            "SELECT sort_order FROM {} WHERE {} = ?1 AND {} = ?2",
            self.table, self.scope_column, self.item_column
        );
        Ok(conn
            .query_row(&query, params![scope, item], |row| row.get::<_, f64>(0))
            .optional()?)
    }

    /// Posizione in coda allo scope.
    pub fn append(&self, conn: &Connection, scope: &str) -> Result<f64> {
        let query = format!(
            "SELECT COALESCE(MAX(sort_order), 0) + {STEP} FROM {} WHERE {} = ?1",
            self.table, self.scope_column
        );
        Ok(conn.query_row(&query, [scope], |row| row.get(0))?)
    }

    /// Posizione fra `previous` e `next` (elementi dello stesso scope); senza
    /// vicini, in coda. Ribilancia in automatico se lo spazio e' esaurito.
    pub fn place(
        &self,
        conn: &Connection,
        scope: &str,
        previous: Option<&str>,
        next: Option<&str>,
    ) -> Result<f64> {
        if previous.is_none() && next.is_none() {
            return self.append(conn, scope);
        }

        let before = self.read(conn, scope, previous)?;
        let after = self.read(conn, scope, next)?;

        if needs_rebalance(before, after) {
            self.rebalance(conn, scope)?;
            let before = self.read(conn, scope, previous)?;
            let after = self.read(conn, scope, next)?;
            return Ok(rank_between(before, after));
        }

        Ok(rank_between(before, after))
    }

    /// Scrive la posizione di un elemento gia' presente nello scope.
    pub fn set(&self, conn: &Connection, scope: &str, item: &str, sort_order: f64) -> Result<()> {
        let query = format!(
            "UPDATE {} SET sort_order = ?1 WHERE {} = ?2 AND {} = ?3",
            self.table, self.scope_column, self.item_column
        );
        conn.execute(&query, params![sort_order, scope, item])?;
        Ok(())
    }

    /// Riscrive le posizioni come 1000, 2000, 3000... mantenendo l'ordine.
    fn rebalance(&self, conn: &Connection, scope: &str) -> Result<()> {
        let items: Vec<String> = {
            let query = format!(
                "SELECT {item} FROM {table} WHERE {scope_col} = ?1 ORDER BY sort_order, {item}",
                item = self.item_column,
                table = self.table,
                scope_col = self.scope_column
            );
            let mut statement = conn.prepare(&query)?;
            let rows = statement.query_map([scope], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        for (index, item) in items.iter().enumerate() {
            self.set(conn, scope, item, (index as f64 + 1.0) * STEP)?;
        }
        Ok(())
    }
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

    /// Un gap esaurito viene ribilanciato e l'ordine resta quello di prima.
    #[test]
    fn rebalances_an_exhausted_scope() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE edges (parent_id TEXT, child_id TEXT, sort_order REAL);
             INSERT INTO edges VALUES ('p', 'a', 1000.0), ('p', 'b', 1000.0000000001),
                                      ('p', 'c', 3000.0), ('q', 'z', 5.0);",
        )
        .unwrap();

        let rank = CHILDREN.place(&conn, "p", Some("a"), Some("b")).unwrap();
        let a = CHILDREN.read(&conn, "p", Some("a")).unwrap().unwrap();
        let b = CHILDREN.read(&conn, "p", Some("b")).unwrap().unwrap();

        assert_eq!((a, b), (1000.0, 2000.0));
        assert!(rank > a && rank < b);
        // Gli altri scope non vengono toccati.
        assert_eq!(CHILDREN.read(&conn, "q", Some("z")).unwrap(), Some(5.0));
    }
}
