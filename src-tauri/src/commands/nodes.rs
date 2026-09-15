//! Nodi della libreria: lettura di una pagina, creazione, modifica,
//! spostamento, condivisione, cestino, duplicazione, tag.

use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::{library, nodes};
use crate::domain::{DeleteImpact, NewNode, Node, NodeEntry, NodePatch, NodeView, Tag};
use crate::services::{hierarchy, resolve};
use crate::AppState;

/// Tutto cio' che serve per disegnare la pagina di un nodo, lungo il
/// workspace da cui lo si guarda.
#[tauri::command]
pub fn get_node_view(
    state: State<'_, AppState>,
    profile_id: String,
    id: String,
    via_workspace_id: Option<String>,
    include_archived: Option<bool>,
) -> Result<NodeView, String> {
    let conn = db(&state)?;

    if !resolve::is_visible(&conn, &profile_id, &id).map_err(fail)? {
        return Err("questo elemento non e' visibile nel profilo attivo".into());
    }

    let via = via_workspace_id.as_deref();
    Ok(NodeView {
        node: nodes::get(&conn, &id).map_err(fail)?,
        breadcrumb: resolve::breadcrumb(&conn, &profile_id, &id, via).map_err(fail)?,
        workspaces: resolve::workspaces_of(&conn, &id)
            .map_err(fail)?
            .iter()
            .map(Into::into)
            .collect(),
        children: nodes::children(&conn, &id, include_archived.unwrap_or(false)).map_err(fail)?,
        protection: resolve::protection(&conn, &id).map_err(fail)?,
        caution: resolve::caution(&conn, &id).map_err(fail)?,
        tags: library::tags_of(&conn, &id).map_err(fail)?,
        is_favorite: library::is_favorite(&conn, &profile_id, &id).map_err(fail)?,
    })
}

#[tauri::command]
pub fn list_children(
    state: State<'_, AppState>,
    id: String,
    include_archived: Option<bool>,
) -> Result<Vec<NodeEntry>, String> {
    let conn = db(&state)?;
    nodes::children(&conn, &id, include_archived.unwrap_or(false)).map_err(fail)
}

/// Crea un nodo. Senza `parent_id` si crea un workspace, visibile al profilo.
#[tauri::command]
pub fn create_node(
    state: State<'_, AppState>,
    profile_id: String,
    parent_id: Option<String>,
    input: NewNode,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<Node, String> {
    let conn = db(&state)?;
    hierarchy::create(
        &conn,
        &profile_id,
        parent_id.as_deref(),
        &input,
        Some((previous_id.as_deref(), next_id.as_deref())),
    )
    .map_err(fail)
}

/// Un gruppo di link con i suoi link, in un solo passo.
#[tauri::command]
pub fn create_link_group(
    state: State<'_, AppState>,
    profile_id: String,
    parent_id: String,
    name: String,
    links: Vec<NewNode>,
) -> Result<Node, String> {
    let conn = db(&state)?;
    hierarchy::create_group(&conn, &profile_id, &parent_id, &name, &links).map_err(fail)
}

#[tauri::command]
pub fn update_node(
    state: State<'_, AppState>,
    id: String,
    patch: NodePatch,
) -> Result<Node, String> {
    let conn = db(&state)?;
    nodes::update(&conn, &id, &patch).map_err(fail)
}

/// Sposta (o riordina, se il padre non cambia) un nodo fra due vicini.
#[tauri::command]
pub fn move_node(
    state: State<'_, AppState>,
    id: String,
    from_parent_id: Option<String>,
    to_parent_id: String,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<(), String> {
    let conn = db(&state)?;
    hierarchy::move_node(
        &conn,
        &id,
        from_parent_id.as_deref(),
        &to_parent_id,
        (previous_id.as_deref(), next_id.as_deref()),
    )
    .map_err(fail)
}

/// Collega un progetto a un altro workspace, senza copiarlo.
#[tauri::command]
pub fn share_node(state: State<'_, AppState>, id: String, parent_id: String) -> Result<(), String> {
    let conn = db(&state)?;
    hierarchy::share(&conn, &id, &parent_id, None).map_err(fail)
}

/// "Rimuovi da questo workspace".
#[tauri::command]
pub fn unshare_node(
    state: State<'_, AppState>,
    id: String,
    parent_id: String,
) -> Result<(), String> {
    let conn = db(&state)?;
    hierarchy::unshare(&conn, &id, &parent_id).map_err(fail)
}

#[tauri::command]
pub fn set_node_pinned(
    state: State<'_, AppState>,
    parent_id: String,
    child_id: String,
    pinned: bool,
) -> Result<(), String> {
    let conn = db(&state)?;
    nodes::set_pinned(&conn, &parent_id, &child_id, pinned).map_err(fail)
}

#[tauri::command]
pub fn archive_node(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> Result<Node, String> {
    let conn = db(&state)?;
    nodes::set_archived(&conn, &id, archived).map_err(fail)
}

#[tauri::command]
pub fn node_delete_impact(state: State<'_, AppState>, id: String) -> Result<DeleteImpact, String> {
    let conn = db(&state)?;
    hierarchy::delete_impact(&conn, &id).map_err(fail)
}

/// Sposta nel cestino. Restituisce l'id da passare a `restore_deletion` per
/// annullare (il cestino si svuota al riavvio).
#[tauri::command]
pub fn delete_node(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let conn = db(&state)?;
    hierarchy::delete(&conn, &id).map_err(fail)
}

#[tauri::command]
pub fn restore_deletion(state: State<'_, AppState>, deletion_id: String) -> Result<(), String> {
    let conn = db(&state)?;
    hierarchy::restore(&conn, &deletion_id).map_err(fail)
}

#[tauri::command]
pub fn duplicate_node(
    state: State<'_, AppState>,
    profile_id: String,
    id: String,
    parent_id: Option<String>,
    name: Option<String>,
) -> Result<Node, String> {
    let conn = db(&state)?;
    hierarchy::duplicate(
        &conn,
        &profile_id,
        &id,
        parent_id.as_deref(),
        name.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn set_node_tags(
    state: State<'_, AppState>,
    id: String,
    names: Vec<String>,
) -> Result<Vec<Tag>, String> {
    let conn = db(&state)?;
    library::set_tags(&conn, &id, &names).map_err(fail)
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    let conn = db(&state)?;
    library::tags(&conn).map_err(fail)
}
