//! Backup e ripristino (backup v2).
//!
//! Un backup e' una copia completa e coerente del database, fatta da SQLite
//! stesso con `VACUUM INTO` mentre l'app e' aperta: nessun formato di
//! esportazione da mantenere, nessun dato dimenticato. Restano fuori solo i
//! file che il database nomina (le cover), che vivono accanto.
//!
//!  * **Automatici**: uno al giorno all'avvio in `<dati>/backups`, gli ultimi 7.
//!  * **Manuali**: dove sceglie l'utente.
//!  * **Ripristino**: il file scelto si verifica (integrita', schema) e si mette
//!    da parte; al riavvio, prima di aprire il database, prende il posto di
//!    quello attuale, che resta come `llamadesk.before-restore.db`.
//!
//! Tutto locale: un backup non lascia mai il computer se non lo sposta l'utente.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use rusqlite::{Connection, OpenFlags};

use crate::db::migrator;
use crate::domain::BackupInfo;

const AUTOMATIC_PREFIX: &str = "llamadesk-auto-";
const KEEP_AUTOMATIC: usize = 7;

pub fn backups_dir(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .map_or_else(|| PathBuf::from("backups"), |dir| dir.join("backups"))
}

fn staged_path(db_path: &Path) -> PathBuf {
    db_path.with_file_name("llamadesk.restore.db")
}

/// Data e ora per i nomi dei file: `AAAAMMGG-hhmmss` (UTC).
pub fn file_stamp(time: SystemTime) -> String {
    timestamp(time)
}

fn timestamp(time: SystemTime) -> String {
    // AAAAMMGG-hhmmss in UTC, senza dipendenze per le date.
    let seconds = time.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let days = seconds / 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let rest = seconds % 86_400;
    format!(
        "{year:04}{month:02}{day:02}-{:02}{:02}{:02}",
        rest / 3600,
        (rest % 3600) / 60,
        rest % 60
    )
}

/// Giorni dal 1970-01-01 → data civile (algoritmo di Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// Copia coerente del database in `destination` (sovrascrive).
pub fn create(conn: &Connection, destination: &Path) -> Result<BackupInfo> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    if destination.exists() {
        fs::remove_file(destination)
            .with_context(|| format!("impossibile sostituire {}", destination.display()))?;
    }
    conn.execute("VACUUM INTO ?1", [destination.to_string_lossy().as_ref()])
        .context("la copia del database non e' riuscita")?;
    info(destination)
}

pub fn info(path: &Path) -> Result<BackupInfo> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(BackupInfo {
        path: path.to_string_lossy().into_owned(),
        automatic: file_name.starts_with(AUTOMATIC_PREFIX),
        file_name,
        modified_at: modified
            .duration_since(UNIX_EPOCH)
            .map_or(0.0, |d| d.as_secs_f64()),
        size_bytes: metadata.len() as f64,
    })
}

/// Backup della cartella `backups`, dal piu' recente.
pub fn list(db_path: &Path) -> Result<Vec<BackupInfo>> {
    let dir = backups_dir(db_path);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut backups: Vec<BackupInfo> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "db"))
        .filter_map(|path| info(&path).ok())
        .collect();
    backups.sort_by(|a, b| b.modified_at.total_cmp(&a.modified_at));
    Ok(backups)
}

/// Uno per giorno di calendario (UTC), riconosciuto dal nome del file.
/// Tiene gli ultimi sette.
pub fn automatic(conn: &Connection, db_path: &Path, now: SystemTime) -> Result<Option<BackupInfo>> {
    let stamp = timestamp(now);
    let today = format!("{AUTOMATIC_PREFIX}{}", &stamp[..8]);
    if list(db_path)?
        .iter()
        .any(|backup| backup.file_name.starts_with(&today))
    {
        return Ok(None);
    }

    let destination = backups_dir(db_path).join(format!("{AUTOMATIC_PREFIX}{stamp}.db"));
    let created = create(conn, &destination)?;

    let mut automatic: Vec<BackupInfo> = list(db_path)?
        .into_iter()
        .filter(|backup| backup.automatic)
        .collect();
    // Il nome contiene la data: in ordine decrescente i piu' recenti vengono prima.
    automatic.sort_by(|a, b| b.file_name.cmp(&a.file_name));
    for old in automatic.iter().skip(KEEP_AUTOMATIC) {
        let _ = fs::remove_file(&old.path);
    }
    Ok(Some(created))
}

/// Verifica che un file sia un database di LlamaDesk integro e apribile da
/// questa versione.
pub fn validate(path: &Path) -> Result<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .with_context(|| format!("impossibile aprire {}", path.display()))?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|_| anyhow!("il file non e' un database SQLite"))?;
    if integrity != "ok" {
        return Err(anyhow!("il backup e' danneggiato ({integrity})"));
    }
    let version = migrator::current_version(&conn)?;
    if version < 3 {
        return Err(anyhow!(
            "il backup viene da LlamaDesk 1 e non si puo' ripristinare in questa versione"
        ));
    }
    if version > migrator::target_version() {
        return Err(anyhow!(
            "il backup viene da una versione di LlamaDesk piu' recente di questa"
        ));
    }
    let has_nodes: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nodes')",
        [],
        |row| row.get(0),
    )?;
    if !has_nodes {
        return Err(anyhow!("il file non e' un backup di LlamaDesk"));
    }
    Ok(())
}

/// Mette da parte il backup: prendera' il posto del database al prossimo avvio.
pub fn stage_restore(db_path: &Path, backup: &Path) -> Result<()> {
    validate(backup)?;
    fs::copy(backup, staged_path(db_path)).context("impossibile preparare il ripristino")?;
    Ok(())
}

/// All'avvio, prima di aprire il database: se c'e' un ripristino in attesa,
/// lo applica. Il database precedente resta accanto.
pub fn apply_staged_restore(db_path: &Path) -> Result<bool> {
    let staged = staged_path(db_path);
    if !staged.exists() {
        return Ok(false);
    }
    if let Err(error) = validate(&staged) {
        let _ = fs::remove_file(&staged);
        return Err(error);
    }
    if db_path.exists() {
        let previous = db_path.with_file_name("llamadesk.before-restore.db");
        let _ = fs::remove_file(&previous);
        fs::rename(db_path, &previous).context("impossibile mettere da parte il database")?;
        // I file del WAL appartengono al database precedente.
        for suffix in ["-wal", "-shm"] {
            let sidecar = PathBuf::from(format!("{}{suffix}", db_path.display()));
            let _ = fs::remove_file(sidecar);
        }
    }
    fs::rename(&staged, db_path).context("impossibile completare il ripristino")?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{database, workspace};
    use std::time::Duration;

    const DAY: Duration = Duration::from_secs(24 * 60 * 60);

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir =
                std::env::temp_dir().join(format!("llamadesk-backup-{}", uuid::Uuid::now_v7()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn dates_are_computed_without_a_calendar_crate() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_000), (2022, 1, 8));
        assert_eq!(
            timestamp(UNIX_EPOCH + Duration::from_secs(1_757_944_800)),
            "20250915-140000"
        );
    }

    #[test]
    fn a_backup_restores_the_library_at_the_next_start() {
        let scratch = Scratch::new();
        let (conn, profile) = database();
        workspace(&conn, &profile, "Lavoro");

        let db_path = scratch.0.join("llamadesk.db");
        let copy = scratch.0.join("manuale.db");
        create(&conn, &copy).unwrap();
        validate(&copy).unwrap();

        // Il database "attuale" e' vuoto; il ripristino lo sostituisce.
        Connection::open(&db_path)
            .unwrap()
            .execute_batch("CREATE TABLE x (y)")
            .unwrap();
        stage_restore(&db_path, &copy).unwrap();
        assert!(apply_staged_restore(&db_path).unwrap());
        assert!(!apply_staged_restore(&db_path).unwrap(), "una volta sola");

        let restored = Connection::open(&db_path).unwrap();
        let name: String = restored
            .query_row(
                "SELECT name FROM nodes WHERE kind = 'workspace'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "Lavoro");
        assert!(scratch.0.join("llamadesk.before-restore.db").exists());
    }

    #[test]
    fn foreign_or_broken_files_are_refused() {
        let scratch = Scratch::new();
        let text = scratch.0.join("note.db");
        fs::write(&text, "non sono un database").unwrap();
        assert!(validate(&text).is_err());

        let other = scratch.0.join("altro.db");
        Connection::open(&other)
            .unwrap()
            .execute_batch("CREATE TABLE x (y)")
            .unwrap();
        assert!(validate(&other).is_err());
    }

    #[test]
    fn automatic_backups_are_daily_and_keep_seven() {
        let scratch = Scratch::new();
        let (conn, _) = database();
        let db_path = scratch.0.join("llamadesk.db");
        let start = UNIX_EPOCH + Duration::from_secs(1_757_944_800);

        assert!(automatic(&conn, &db_path, start).unwrap().is_some());
        assert!(
            automatic(&conn, &db_path, start + Duration::from_secs(3600))
                .unwrap()
                .is_none(),
            "uno al giorno"
        );
        for day in 1..10u32 {
            assert!(automatic(&conn, &db_path, start + DAY * day)
                .unwrap()
                .is_some());
        }
        let kept: Vec<String> = list(&db_path)
            .unwrap()
            .into_iter()
            .filter(|backup| backup.automatic)
            .map(|backup| backup.file_name)
            .collect();
        assert_eq!(kept.len(), KEEP_AUTOMATIC);
        assert!(kept
            .iter()
            .all(|name| name.as_str() >= "llamadesk-auto-20250918"));
    }
}
