//! Che cosa c'e' davvero dietro un percorso locale.
//!
//! Il tipo di un percorso (file, cartella, repository, percorso di rete) non
//! si salva: si chiede al disco quando la pagina lo mostra. Un tipo salvato
//! diventerebbe falso appena qualcuno sposta un file (docs/REDESIGN.md,
//! "Percorsi locali").
//!
//! Tutto e' locale e in sola lettura: nessun processo esterno, nessuna rete.
//! Il branch Git si legge dal file `HEAD`, senza eseguire `git`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};

use crate::domain::{PathInfo, PathKind};

/// Oltre questo tempo un percorso (tipicamente di rete) si considera
/// non raggiungibile: la pagina non deve restare ferma ad aspettarlo.
pub const TIMEOUT: Duration = Duration::from_millis(1500);

fn is_network(path: &str) -> bool {
    path.starts_with(r"\\") || path.starts_with("//")
}

/// Espande le variabili d'ambiente in stile Windows (`%USERPROFILE%\dev`).
pub fn expand(path: &str) -> String {
    let mut result = String::with_capacity(path.len());
    let mut rest = path;
    while let Some(start) = rest.find('%') {
        let Some(length) = rest[start + 1..].find('%') else {
            break;
        };
        let name = &rest[start + 1..start + 1 + length];
        result.push_str(&rest[..start]);
        match std::env::var(name) {
            Ok(value) if !name.is_empty() => result.push_str(&value),
            _ => result.push_str(&rest[start..start + length + 2]),
        }
        rest = &rest[start + length + 2..];
    }
    result.push_str(rest);
    result
}

/// Branch corrente di un repository, letto da `.git/HEAD`. Gestisce anche i
/// worktree, dove `.git` e' un file che punta alla cartella vera.
pub fn git_branch(directory: &Path) -> Option<String> {
    let dot_git = directory.join(".git");
    let git_dir: PathBuf = if dot_git.is_dir() {
        dot_git
    } else {
        let pointer = fs::read_to_string(&dot_git).ok()?;
        let target = pointer.trim().strip_prefix("gitdir:")?.trim();
        let target = PathBuf::from(target);
        if target.is_absolute() {
            target
        } else {
            directory.join(target)
        }
    };

    let head = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    match head.strip_prefix("ref: refs/heads/") {
        Some(branch) => Some(branch.to_string()),
        // HEAD staccato: si mostra l'inizio del commit, come fa Git.
        None if head.len() >= 7 => Some(head[..7].to_string()),
        None => None,
    }
}

/// Ispezione senza limite di tempo: la usa `inspect` dentro un thread.
fn inspect_now(original: &str) -> PathInfo {
    let expanded = expand(original.trim());
    let path = Path::new(&expanded);
    let network = is_network(&expanded);

    let mut info = PathInfo {
        path: original.to_string(),
        resolved: expanded.clone(),
        kind: PathKind::Missing,
        is_network: network,
        size_bytes: None,
        modified_at: None,
        extension: path
            .extension()
            .map(|extension| extension.to_string_lossy().to_lowercase()),
        git_branch: None,
    };

    let Ok(metadata) = fs::metadata(path) else {
        return info;
    };

    info.modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_secs() as f64);

    if metadata.is_dir() {
        info.extension = None;
        info.git_branch = git_branch(path);
        info.kind = if info.git_branch.is_some() || path.join(".git").exists() {
            PathKind::Repository
        } else {
            PathKind::Directory
        };
    } else {
        info.kind = PathKind::File;
        info.size_bytes = Some(metadata.len() as f64);
    }
    info
}

/// Ispeziona un percorso con un limite di tempo: un disco di rete spento
/// risponde `Unavailable` invece di bloccare l'interfaccia.
pub fn inspect(path: &str) -> PathInfo {
    let (sender, receiver) = mpsc::channel();
    let owned = path.to_string();
    thread::spawn(move || {
        let _ = sender.send(inspect_now(&owned));
    });

    receiver.recv_timeout(TIMEOUT).unwrap_or_else(|_| PathInfo {
        path: path.to_string(),
        resolved: expand(path.trim()),
        kind: PathKind::Unavailable,
        is_network: is_network(path),
        size_bytes: None,
        modified_at: None,
        extension: None,
        git_branch: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cartella temporanea che si cancella da sola.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("llamadesk-test-{}", uuid::Uuid::now_v7()));
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
    fn recognises_files_directories_and_missing_paths() {
        let scratch = Scratch::new();
        let file = scratch.0.join("Architettura v3.PDF");
        fs::write(&file, b"12345").unwrap();

        let as_file = inspect(file.to_str().unwrap());
        assert_eq!(as_file.kind, PathKind::File);
        assert_eq!(as_file.size_bytes, Some(5.0));
        assert_eq!(as_file.extension.as_deref(), Some("pdf"));
        assert!(as_file.modified_at.is_some());

        let as_dir = inspect(scratch.0.to_str().unwrap());
        assert_eq!(as_dir.kind, PathKind::Directory);
        assert_eq!(as_dir.extension, None);

        let missing = inspect(scratch.0.join("sparito").to_str().unwrap());
        assert_eq!(missing.kind, PathKind::Missing);
    }

    #[test]
    fn a_directory_with_git_is_a_repository_with_its_branch() {
        let scratch = Scratch::new();
        fs::create_dir_all(scratch.0.join(".git")).unwrap();
        fs::write(scratch.0.join(".git/HEAD"), "ref: refs/heads/develop\n").unwrap();

        let info = inspect(scratch.0.to_str().unwrap());
        assert_eq!(info.kind, PathKind::Repository);
        assert_eq!(info.git_branch.as_deref(), Some("develop"));
    }

    #[test]
    fn reads_branches_of_worktrees_and_detached_heads() {
        let scratch = Scratch::new();
        let real = scratch.0.join("real-git");
        let worktree = scratch.0.join("worktree");
        fs::create_dir_all(&real).unwrap();
        fs::create_dir_all(&worktree).unwrap();
        fs::write(real.join("HEAD"), "0123456789abcdef\n").unwrap();
        fs::write(
            worktree.join(".git"),
            format!("gitdir: {}\n", real.display()),
        )
        .unwrap();

        assert_eq!(git_branch(&worktree).as_deref(), Some("0123456"));
    }

    #[test]
    fn expands_windows_environment_variables() {
        std::env::set_var("LLAMADESK_TEST_ROOT", r"C:\dev");
        assert_eq!(
            expand(r"%LLAMADESK_TEST_ROOT%\specialhub"),
            r"C:\dev\specialhub"
        );
        // Una variabile sconosciuta resta com'e'.
        assert_eq!(expand(r"%NON_ESISTE_42%\x"), r"%NON_ESISTE_42%\x");
        assert_eq!(expand("100% sicuro"), "100% sicuro");
    }

    #[test]
    fn network_paths_are_flagged() {
        assert!(is_network(r"\\nas\processi"));
        assert!(!is_network(r"C:\dev"));
    }
}
