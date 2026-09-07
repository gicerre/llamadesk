//! Comandi sulla gerarchia: navigazione, CRUD, spostamento, duplicazione.

use serde::Serialize;
use tauri::State;

use crate::commands::{db, fail};
use crate::db::repo::{containers, items};
use crate::domain::{Container, ContainerView, Crumb};
use crate::services::{danger, duplicate};
use crate::AppState;

/// Conseguenze di una cancellazione: la conferma deve mostrare i numeri veri.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteImpact {
    pub containers: i64,
    pub applications: i64,
    pub links: i64,
}

/// Tutti i nodi del profilo: la sidebar costruisce l'albero lato React, dove
/// espansione e drag & drop sono gia' in memoria.
#[tauri::command]
pub fn list_containers(state: State<'_, AppState>, profile_id: String) -> Result<Vec<Container>, String> {
    let conn = db(&state)?;
    containers::list_by_profile(&conn, &profile_id).map_err(fail)
}

/// Vista completa di un contenitore: breadcrumb, figli, applicazioni con link,
/// livello di pericolo risolto e ambienti fratelli per lo switcher.
#[tauri::command]
pub fn get_container_view(state: State<'_, AppState>, id: String) -> Result<ContainerView, String> {
    let conn = db(&state)?;

    let container = containers::get(&conn, &id).map_err(fail)?;
    let chain = containers::chain(&conn, &id).map_err(fail)?;

    let breadcrumb = chain
        .iter()
        .rev()
        .map(|node| Crumb {
            id: node.id.clone(),
            name: node.name.clone(),
            kind: node.kind.clone(),
            icon: node.icon.clone(),
            color: node.color.clone(),
            badge_text: node.badge_text.clone(),
        })
        .collect();

    // Environment Switcher: se siamo dentro un ambiente (o sotto di esso),
    // proponiamo gli altri ambienti dello stesso progetto.
    let environment = chain.iter().find(|node| node.kind == "environment");
    let sibling_environments = match environment {
        Some(node) => containers::siblings_of_kind(&conn, node).map_err(fail)?,
        None => Vec::new(),
    };

    Ok(ContainerView {
        breadcrumb,
        children: containers::children(&conn, &container.profile_id, Some(&id)).map_err(fail)?,
        applications: items::list_applications_with_links(&conn, &id).map_err(fail)?,
        danger: danger::resolve_for_container(&conn, &id).map_err(fail)?,
        sibling_environments,
        container,
    })
}

/// Environment Switcher: dato il punto in cui ci si trova, trova il nodo
/// corrispondente sotto un altro ambiente confrontando gli slug del percorso.
/// Se il percorso non esiste nell'ambiente di destinazione, si ricade
/// sull'ambiente stesso: meglio arrivare vicino che non arrivare.
#[tauri::command]
pub fn resolve_sibling_path(
    state: State<'_, AppState>,
    container_id: String,
    target_environment_id: String,
) -> Result<String, String> {
    let conn = db(&state)?;

    let chain = containers::chain(&conn, &container_id).map_err(fail)?;
    let environment_index = chain.iter().position(|node| node.kind == "environment");

    let Some(environment_index) = environment_index else {
        return Ok(target_environment_id);
    };

    // Percorso relativo dall'ambiente al nodo corrente, dall'alto verso il basso.
    let relative: Vec<String> = chain[..environment_index]
        .iter()
        .rev()
        .map(|node| node.slug.clone().unwrap_or_else(|| node.name.to_lowercase()))
        .collect();

    let mut current = target_environment_id.clone();
    for slug in relative {
        let profile_id = containers::get(&conn, &current).map_err(fail)?.profile_id;
        let children = containers::children(&conn, &profile_id, Some(&current)).map_err(fail)?;

        let matched = children.into_iter().find(|child| {
            child.slug.as_deref() == Some(slug.as_str())
                || containers::slugify(&child.name) == slug
        });

        match matched {
            Some(child) => current = child.id,
            None => return Ok(current),
        }
    }

    Ok(current)
}

#[tauri::command]
pub fn create_container(
    state: State<'_, AppState>,
    profile_id: String,
    parent_id: Option<String>,
    kind: String,
    name: String,
) -> Result<Container, String> {
    let conn = db(&state)?;
    containers::create(&conn, &profile_id, parent_id.as_deref(), &kind, &name).map_err(fail)
}

/// Aggiorna i campi passati. Per `danger_level`: campo assente = invariato,
/// `"inherit"` = torna a ereditare dal padre, altrimenti imposta il livello.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_container(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    badge_text: Option<String>,
    danger_level: Option<String>,
    is_favorite: Option<bool>,
) -> Result<Container, String> {
    let conn = db(&state)?;
    containers::update(
        &conn,
        &id,
        name.as_deref(),
        description.as_deref(),
        icon.as_deref(),
        color.as_deref(),
        badge_text.as_deref(),
        danger_level.as_deref(),
        is_favorite,
    )
    .map_err(fail)
}

#[tauri::command]
pub fn move_container(
    state: State<'_, AppState>,
    id: String,
    new_parent_id: Option<String>,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<Container, String> {
    let conn = db(&state)?;
    containers::move_node(
        &conn,
        &id,
        new_parent_id.as_deref(),
        previous_id.as_deref(),
        next_id.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn container_delete_impact(
    state: State<'_, AppState>,
    id: String,
) -> Result<DeleteImpact, String> {
    let conn = db(&state)?;
    let (containers_count, applications, links) =
        containers::descendant_counts(&conn, &id).map_err(fail)?;

    Ok(DeleteImpact {
        containers: containers_count,
        applications,
        links,
    })
}

#[tauri::command]
pub fn delete_container(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db(&state)?;
    containers::delete(&conn, &id).map_err(fail)
}

#[tauri::command]
pub fn duplicate_container(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<Container, String> {
    let mut guard = db(&state)?;
    // Un ramo si duplica tutto o niente: una copia a meta' sarebbe peggio
    // di nessuna copia.
    let tx = guard.transaction().map_err(fail)?;
    let clone = duplicate::duplicate_container(&tx, &id, &new_name).map_err(fail)?;
    tx.commit().map_err(fail)?;
    Ok(clone)
}
