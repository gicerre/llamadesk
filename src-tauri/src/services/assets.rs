//! Immagini delle cover (solo workspace e progetti, docs/REDESIGN.md § 10).
//!
//! L'immagine scelta si copia in `<dati>/covers/<sha256>.<estensione>`: la
//! cover resta anche se l'originale si sposta, e la stessa immagine usata da
//! due progetti occupa spazio una volta. Il tipo si riconosce dai primi byte,
//! non dall'estensione. Un'immagine che nessun nodo usa piu' (nemmeno nel
//! cestino) si cancella.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::db::repo::nodes;
use crate::db::seed::new_id;
use crate::domain::{Node, NodeKind};

/// Oltre questa dimensione non e' una cover, e' una foto da archivio.
pub const MAX_BYTES: u64 = 15 * 1024 * 1024;

pub fn covers_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("covers")
}

/// Tipo di immagine dai primi byte: PNG, JPEG, WebP, GIF.
fn sniff(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some(("image/png", "png"))
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("image/jpeg", "jpg"))
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("image/webp", "webp"))
    } else if bytes.starts_with(b"GIF8") {
        Some(("image/gif", "gif"))
    } else {
        None
    }
}

/// Copia un'immagine fra le cover (o riusa quella gia' presente). Restituisce l'id.
pub fn import_image(conn: &Connection, data_dir: &Path, source: &Path) -> Result<String> {
    let size = fs::metadata(source)
        .with_context(|| format!("immagine non trovata: {}", source.display()))?
        .len();
    if size > MAX_BYTES {
        return Err(anyhow!("l'immagine supera i 15 MB"));
    }
    let bytes = fs::read(source)?;
    let (mime, extension) = sniff(&bytes)
        .ok_or_else(|| anyhow!("formato non supportato: servono PNG, JPEG, WebP o GIF"))?;
    let sha = format!("{:x}", Sha256::digest(&bytes));

    if let Some(id) = conn
        .query_row("SELECT id FROM assets WHERE sha256 = ?1", [&sha], |row| {
            row.get::<_, String>(0)
        })
        .optional()?
    {
        let path = covers_dir(data_dir).join(file_name(conn, &id)?);
        if !path.exists() {
            fs::write(&path, &bytes)?;
        }
        return Ok(id);
    }

    let name = format!("{sha}.{extension}");
    let dir = covers_dir(data_dir);
    fs::create_dir_all(&dir)?;
    fs::write(dir.join(&name), &bytes).context("impossibile salvare l'immagine")?;

    let id = new_id();
    conn.execute(
        "INSERT INTO assets (id, sha256, mime, file_name) VALUES (?1, ?2, ?3, ?4)",
        params![id, sha, mime, name],
    )?;
    Ok(id)
}

fn file_name(conn: &Connection, id: &str) -> Result<String> {
    conn.query_row("SELECT file_name FROM assets WHERE id = ?1", [id], |row| {
        row.get(0)
    })
    .optional()?
    .ok_or_else(|| anyhow!("immagine non trovata"))
}

/// Percorso assoluto del file di un asset.
pub fn path_of(conn: &Connection, data_dir: &Path, id: &str) -> Result<PathBuf> {
    Ok(covers_dir(data_dir).join(file_name(conn, id)?))
}

/// Imposta (o toglie, con `None`) la cover di un workspace o di un progetto.
/// Il punto focale torna al centro.
pub fn set_cover(
    conn: &Connection,
    data_dir: &Path,
    node_id: &str,
    source: Option<&Path>,
) -> Result<Node> {
    let node = nodes::get(conn, node_id)?;
    if !matches!(node.kind, NodeKind::Workspace | NodeKind::Project) {
        return Err(anyhow!("la cover si imposta solo su workspace e progetti"));
    }
    let asset = source
        .map(|path| import_image(conn, data_dir, path))
        .transpose()?;
    conn.execute(
        "UPDATE nodes SET cover_asset_id = ?2, cover_focus_x = 0.5, cover_focus_y = 0.5,
                          updated_at = datetime('now')
          WHERE id = ?1",
        params![node_id, asset],
    )?;
    collect_garbage(conn, data_dir)?;
    nodes::get(conn, node_id)
}

/// Cancella le immagini che nessun nodo usa piu' (i nodi nel cestino contano).
pub fn collect_garbage(conn: &Connection, data_dir: &Path) -> Result<usize> {
    let orphans: Vec<(String, String)> = {
        let mut statement = conn.prepare(
            "SELECT id, file_name FROM assets
              WHERE id NOT IN (SELECT cover_asset_id FROM nodes WHERE cover_asset_id IS NOT NULL)
                AND id NOT IN (SELECT avatar_asset_id FROM profiles WHERE avatar_asset_id IS NOT NULL)",
        )?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    for (id, name) in &orphans {
        let _ = fs::remove_file(covers_dir(data_dir).join(name));
        conn.execute("DELETE FROM assets WHERE id = ?1", [id])?;
    }
    Ok(orphans.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir =
                std::env::temp_dir().join(format!("llamadesk-assets-{}", uuid::Uuid::now_v7()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
        fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            fs::write(&path, bytes).unwrap();
            path
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];

    #[test]
    fn covers_are_deduplicated_and_cleaned_up() {
        let scratch = Scratch::new();
        let data = scratch.0.join("dati");
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let a = child(&conn, &profile, &ws, NodeKind::Project, "Alfa");
        let b = child(&conn, &profile, &ws, NodeKind::Project, "Beta");
        let section = child(&conn, &profile, &a, NodeKind::Section, "Docs");

        // Stessa immagine con nomi diversi: un file solo.
        let image = scratch.file("mare.jpg.png", PNG);
        let copy = scratch.file("copia.png", PNG);
        let alfa = set_cover(&conn, &data, &a, Some(&image)).unwrap();
        let beta = set_cover(&conn, &data, &b, Some(&copy)).unwrap();
        assert_eq!(alfa.cover_asset_id, beta.cover_asset_id);
        assert_eq!(fs::read_dir(covers_dir(&data)).unwrap().count(), 1);

        assert!(
            set_cover(&conn, &data, &section, Some(&image)).is_err(),
            "non sulle sezioni"
        );
        let text = scratch.file("note.png", b"non e' un'immagine");
        assert!(
            set_cover(&conn, &data, &a, Some(&text)).is_err(),
            "il tipo si legge dai byte"
        );

        // Tolta da uno resta per l'altro; tolta da entrambi se ne va.
        set_cover(&conn, &data, &a, None).unwrap();
        assert_eq!(fs::read_dir(covers_dir(&data)).unwrap().count(), 1);
        set_cover(&conn, &data, &b, None).unwrap();
        assert_eq!(fs::read_dir(covers_dir(&data)).unwrap().count(), 0);
    }
}
