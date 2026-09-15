//! Protezione (D2, docs/REDESIGN.md § 9): una password di blocco per profilo,
//! un flag "protetto" ereditato lungo la gerarchia, uno sblocco che vale per
//! la sessione.
//!
//! E' un blocco di **riservatezza**, non una cifratura: impedisce che un
//! contenuto protetto compaia sullo schermo o si apra per sbaglio (una
//! presentazione, un collega alla scrivania). Chi ha il file del database lo
//! legge comunque; il documento lo dice apertamente.
//!
//! La regola che conta: **a sessione bloccata Rust non restituisce il
//! contenuto dei nodi protetti** e rifiuta di modificarli o aprirli. Lo stato
//! di sblocco vive solo in memoria: un riavvio blocca tutto.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::{Node, NodeEntry};
use crate::services::resolve;

/// Errore che il frontend riconosce: serve lo sblocco.
pub const LOCKED: &str = "locked";
/// Errore che il frontend riconosce: per proteggere serve prima una password.
pub const NO_LOCK: &str = "no_lock";

pub const MIN_PASSWORD_CHARS: usize = 4;

/// Tentativi sbagliati concessi prima dell'attesa.
const FREE_ATTEMPTS: u32 = 3;
const FIRST_WAIT: Duration = Duration::from_secs(30);
const MAX_WAIT: Duration = Duration::from_secs(300);

/* ---------------------------------------------------------------- hash */

fn hasher() -> Argon2<'static> {
    // Nei test parametri minimi: la verifica resta vera, i test restano veloci.
    #[cfg(test)]
    {
        let params = argon2::Params::new(8, 1, 1, None).expect("parametri validi");
        Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params)
    }
    #[cfg(not(test))]
    {
        // Argon2id con i parametri raccomandati da OWASP (19 MiB, 2 passaggi).
        Argon2::default()
    }
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut rand_core::OsRng);
    hasher()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| anyhow!("impossibile proteggere la password: {error}"))
}

fn verify_password(password: &str, stored: &str) -> bool {
    PasswordHash::new(stored)
        .map(|parsed| {
            hasher()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

fn stored_hash(conn: &Connection, profile_id: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT lock_hash FROM profiles WHERE id = ?1",
            [profile_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten())
}

pub fn has_lock(conn: &Connection, profile_id: &str) -> Result<bool> {
    Ok(stored_hash(conn, profile_id)?.is_some())
}

/* ------------------------------------------------------------ sessioni */

#[derive(Debug, Default)]
struct Session {
    unlocked: bool,
    last_activity: Option<Instant>,
    failures: u32,
    retry_at: Option<Instant>,
}

/// Chi e' sbloccato, in memoria. Uno per l'intera applicazione.
#[derive(Debug, Default)]
pub struct LockBook {
    sessions: HashMap<String, Session>,
}

impl LockBook {
    /// Sbloccato e non scaduto per inattivita' (`auto_minutes` = 0: mai).
    pub fn is_unlocked(&mut self, profile_id: &str, auto_minutes: u32, now: Instant) -> bool {
        let Some(session) = self.sessions.get_mut(profile_id) else {
            return false;
        };
        if !session.unlocked {
            return false;
        }
        let idle = session
            .last_activity
            .map_or(Duration::ZERO, |last| now.saturating_duration_since(last));
        if auto_minutes > 0 && idle >= Duration::from_secs(u64::from(auto_minutes) * 60) {
            session.unlocked = false;
            return false;
        }
        true
    }

    /// L'utente sta usando l'app: il blocco automatico riparte da adesso.
    pub fn touch(&mut self, profile_id: &str, now: Instant) {
        if let Some(session) = self.sessions.get_mut(profile_id) {
            if session.unlocked {
                session.last_activity = Some(now);
            }
        }
    }

    pub fn retry_after(&self, profile_id: &str, now: Instant) -> Duration {
        self.sessions
            .get(profile_id)
            .and_then(|session| session.retry_at)
            .map_or(Duration::ZERO, |at| at.saturating_duration_since(now))
    }

    fn record(&mut self, profile_id: &str, success: bool, now: Instant) {
        let session = self.sessions.entry(profile_id.to_string()).or_default();
        if success {
            *session = Session {
                unlocked: true,
                last_activity: Some(now),
                failures: 0,
                retry_at: None,
            };
            return;
        }
        session.failures += 1;
        if session.failures >= FREE_ATTEMPTS {
            // 30 s al terzo errore, poi il doppio a ogni errore, fino a 5 minuti.
            let doublings = (session.failures - FREE_ATTEMPTS).min(8);
            let wait = FIRST_WAIT.saturating_mul(1 << doublings).min(MAX_WAIT);
            session.retry_at = Some(now + wait);
        }
    }

    pub fn lock(&mut self, profile_id: &str) {
        if let Some(session) = self.sessions.get_mut(profile_id) {
            session.unlocked = false;
        }
    }

    pub fn lock_all(&mut self) {
        for session in self.sessions.values_mut() {
            session.unlocked = false;
        }
    }
}

/// Prova a sbloccare. Durante l'attesa dopo troppi errori la password non si
/// verifica nemmeno.
pub fn unlock(
    conn: &Connection,
    book: &mut LockBook,
    profile_id: &str,
    password: &str,
    now: Instant,
) -> Result<bool> {
    if !book.retry_after(profile_id, now).is_zero() {
        return Ok(false);
    }
    let stored = stored_hash(conn, profile_id)?
        .ok_or_else(|| anyhow!("questo profilo non ha una password di blocco"))?;
    let success = verify_password(password, &stored);
    book.record(profile_id, success, now);
    Ok(success)
}

/// Imposta o cambia la password. Per cambiarla serve quella attuale.
pub fn set_password(
    conn: &Connection,
    book: &mut LockBook,
    profile_id: &str,
    current: Option<&str>,
    new_password: &str,
    now: Instant,
) -> Result<()> {
    if new_password.chars().count() < MIN_PASSWORD_CHARS {
        return Err(anyhow!(
            "la password deve avere almeno {MIN_PASSWORD_CHARS} caratteri"
        ));
    }
    if has_lock(conn, profile_id)?
        && !unlock(conn, book, profile_id, current.unwrap_or_default(), now)?
    {
        return Err(anyhow!("la password attuale non e' corretta"));
    }
    let hash = hash_password(new_password)?;
    conn.execute(
        "UPDATE profiles SET lock_hash = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![profile_id, hash],
    )?;
    book.record(profile_id, true, now);
    Ok(())
}

/// Toglie la password e, con lei, la protezione da tutto cio' che il profilo
/// vede: un contenuto protetto senza password non si potrebbe piu' aprire.
/// E' anche la strada della password dimenticata (con avvertenza nell'interfaccia).
pub fn remove_lock(conn: &Connection, book: &mut LockBook, profile_id: &str) -> Result<u32> {
    let cleared = crate::db::atomic(conn, |conn| {
        let cleared = conn.execute(
            "WITH RECURSIVE visible(id, depth) AS (
               SELECT workspace_id, 0 FROM profile_workspaces WHERE profile_id = ?1
               UNION
               SELECT e.child_id, v.depth + 1 FROM visible v JOIN edges e ON e.parent_id = v.id
                WHERE v.depth < 40
             )
             UPDATE nodes SET is_protected = 0, updated_at = datetime('now')
              WHERE is_protected = 1 AND id IN (SELECT id FROM visible)",
            [profile_id],
        )?;
        conn.execute(
            "UPDATE profiles SET lock_hash = NULL, updated_at = datetime('now') WHERE id = ?1",
            [profile_id],
        )?;
        Ok(cleared)
    })?;
    book.lock(profile_id);
    if let Some(session) = book.sessions.get_mut(profile_id) {
        session.failures = 0;
        session.retry_at = None;
    }
    Ok(cleared as u32)
}

/// Quanti elementi il blocco nasconde al profilo: i protetti e tutto cio' che contengono.
pub fn protected_count(conn: &Connection, profile_id: &str) -> Result<u32> {
    Ok(conn.query_row(
        "WITH RECURSIVE visible(id, depth) AS (
           SELECT workspace_id, 0 FROM profile_workspaces WHERE profile_id = ?1
           UNION
           SELECT e.child_id, v.depth + 1 FROM visible v JOIN edges e ON e.parent_id = v.id
            WHERE v.depth < 40
         ),
         protected(id, depth) AS (
           SELECT id, 0 FROM nodes WHERE is_protected = 1 AND deleted_at IS NULL
           UNION
           SELECT e.child_id, p.depth + 1 FROM protected p JOIN edges e ON e.parent_id = p.id
            WHERE p.depth < 40
         )
         SELECT COUNT(DISTINCT p.id) FROM protected p
           JOIN nodes n ON n.id = p.id AND n.deleted_at IS NULL
          WHERE p.id IN (SELECT id FROM visible)",
        [profile_id],
        |row| row.get(0),
    )?)
}

/* ------------------------------------------------------------ cancello */

/// Il controllo che ogni comando applica ai nodi che tocca.
#[derive(Debug, Clone, Copy)]
pub struct Gate {
    pub unlocked: bool,
}

impl Gate {
    /// Il nodo va nascosto: protetto (anche per eredita') e sessione bloccata.
    pub fn hides(&self, conn: &Connection, id: &str) -> Result<bool> {
        if self.unlocked {
            return Ok(false);
        }
        Ok(resolve::protection(conn, id)?.is_protected)
    }

    pub fn ensure(&self, conn: &Connection, id: &str) -> Result<()> {
        if self.hides(conn, id)? {
            return Err(anyhow!(LOCKED));
        }
        Ok(())
    }

    /// Figli di un nodo gia' accessibile: puo' essere protetto solo il figlio
    /// stesso, oppure un progetto condiviso lungo un'altra strada.
    pub fn redact_children(&self, conn: &Connection, entries: &mut [NodeEntry]) -> Result<()> {
        if self.unlocked {
            return Ok(());
        }
        for entry in entries {
            let hidden = entry.node.is_protected
                || (entry.parent_count > 1
                    && resolve::protection(conn, &entry.node.id)?.is_protected);
            if hidden {
                entry.node.is_protected = true;
                redact(&mut entry.node);
                entry.child_count = 0;
            }
        }
        Ok(())
    }
}

/// Resta cio' che si vede in una lista: nome, tipo, colore, icona, lucchetto.
pub fn redact(node: &mut Node) {
    node.url = None;
    node.path = None;
    node.description = None;
    node.aliases = None;
    node.browser_profile = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::nodes;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::{NodeKind, NodePatch};

    fn protect(conn: &Connection, id: &str) {
        let patch = NodePatch {
            is_protected: Some(true),
            ..NodePatch::default()
        };
        nodes::update(conn, id, &patch).unwrap();
    }

    #[test]
    fn unlock_needs_the_right_password_and_slows_down_guessing() {
        let (conn, profile) = database();
        let mut book = LockBook::default();
        let start = Instant::now();

        assert!(
            set_password(&conn, &mut book, &profile, None, "abc", start).is_err(),
            "troppo corta"
        );
        set_password(&conn, &mut book, &profile, None, "segreta", start).unwrap();
        assert!(
            book.is_unlocked(&profile, 10, start),
            "chi la imposta resta sbloccato"
        );

        book.lock(&profile);
        assert!(!book.is_unlocked(&profile, 10, start));
        assert!(!unlock(&conn, &mut book, &profile, "sbagliata", start).unwrap());
        assert!(!unlock(&conn, &mut book, &profile, "sbagliata", start).unwrap());
        assert!(book.retry_after(&profile, start).is_zero());
        assert!(!unlock(&conn, &mut book, &profile, "sbagliata", start).unwrap());
        assert_eq!(book.retry_after(&profile, start), FIRST_WAIT);

        // Durante l'attesa nemmeno la password giusta passa.
        assert!(!unlock(&conn, &mut book, &profile, "segreta", start).unwrap());
        let later = start + FIRST_WAIT;
        assert!(unlock(&conn, &mut book, &profile, "segreta", later).unwrap());
        assert!(book.is_unlocked(&profile, 10, later));
    }

    #[test]
    fn changing_the_password_requires_the_current_one() {
        let (conn, profile) = database();
        let mut book = LockBook::default();
        let now = Instant::now();
        set_password(&conn, &mut book, &profile, None, "prima", now).unwrap();
        assert!(set_password(&conn, &mut book, &profile, Some("errata"), "seconda", now).is_err());
        set_password(&conn, &mut book, &profile, Some("prima"), "seconda", now).unwrap();
        book.lock(&profile);
        assert!(unlock(&conn, &mut book, &profile, "seconda", now).unwrap());

        let stored = stored_hash(&conn, &profile).unwrap().unwrap();
        assert!(stored.starts_with("$argon2id$"));
        assert!(!stored.contains("seconda"));
    }

    #[test]
    fn inactivity_locks_again() {
        let (conn, profile) = database();
        let mut book = LockBook::default();
        let start = Instant::now();
        set_password(&conn, &mut book, &profile, None, "segreta", start).unwrap();

        let nine = start + Duration::from_secs(9 * 60);
        assert!(book.is_unlocked(&profile, 10, nine));
        book.touch(&profile, nine);
        assert!(book.is_unlocked(&profile, 10, nine + Duration::from_secs(9 * 60)));
        assert!(!book.is_unlocked(&profile, 10, nine + Duration::from_secs(10 * 60)));
        // Una volta bloccato, il tocco non sblocca.
        book.touch(&profile, nine + Duration::from_secs(11 * 60));
        assert!(!book.is_unlocked(&profile, 0, nine + Duration::from_secs(11 * 60)));
    }

    #[test]
    fn the_gate_hides_protected_content_until_unlocked() {
        let (conn, profile) = database();
        let clients = workspace(&conn, &profile, "Clienti");
        let work = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &work, NodeKind::Project, "Rossi");
        let secret = child(&conn, &profile, &work, NodeKind::Link, "banca");
        crate::services::hierarchy::share(&conn, &project, &clients, None).unwrap();
        protect(&conn, &clients);
        protect(&conn, &secret);

        let locked = Gate { unlocked: false };
        assert!(
            locked.hides(&conn, &project).unwrap(),
            "protetto lungo l'altra strada"
        );
        assert!(matches!(locked.ensure(&conn, &secret), Err(error) if error.to_string() == LOCKED));
        assert!(locked.ensure(&conn, &work).is_ok());

        let mut children = nodes::children(&conn, &work, false).unwrap();
        locked.redact_children(&conn, &mut children).unwrap();
        let link = children
            .iter()
            .find(|entry| entry.node.id == secret)
            .unwrap();
        assert_eq!(link.node.url, None);
        let shared = children
            .iter()
            .find(|entry| entry.node.id == project)
            .unwrap();
        assert!(shared.node.is_protected);

        let open = Gate { unlocked: true };
        assert!(!open.hides(&conn, &project).unwrap());
        assert_eq!(protected_count(&conn, &profile).unwrap(), 3);
    }

    #[test]
    fn removing_the_lock_clears_protection_for_the_profile() {
        let (conn, profile) = database();
        conn.execute(
            "INSERT INTO profiles (id, name) VALUES ('demo', 'Demo')",
            [],
        )
        .unwrap();
        let mine = workspace(&conn, &profile, "Personale");
        let theirs = workspace(&conn, "demo", "Altro");
        protect(&conn, &mine);
        protect(&conn, &theirs);

        let mut book = LockBook::default();
        set_password(&conn, &mut book, &profile, None, "segreta", Instant::now()).unwrap();
        assert_eq!(remove_lock(&conn, &mut book, &profile).unwrap(), 1);
        assert!(!has_lock(&conn, &profile).unwrap());
        assert!(!nodes::get(&conn, &mine).unwrap().is_protected);
        assert!(
            nodes::get(&conn, &theirs).unwrap().is_protected,
            "non lo vede: resta com'e'"
        );
    }
}
