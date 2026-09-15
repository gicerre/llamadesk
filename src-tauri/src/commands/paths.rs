//! Percorsi locali: che cosa c'e' sul disco, adesso.

use crate::domain::PathInfo;
use crate::services::paths;

/// Ispeziona piu' percorsi in parallelo. Asincrono e fuori dal thread
/// principale: un disco di rete lento non deve fermare la finestra.
#[tauri::command]
pub async fn inspect_paths(paths_to_inspect: Vec<String>) -> Result<Vec<PathInfo>, String> {
    let handles: Vec<_> = paths_to_inspect
        .into_iter()
        .map(|path| tauri::async_runtime::spawn_blocking(move || paths::inspect(&path)))
        .collect();

    let mut infos = Vec::with_capacity(handles.len());
    for handle in handles {
        infos.push(handle.await.map_err(|error| error.to_string())?);
    }
    Ok(infos)
}
