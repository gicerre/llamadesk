//! Avvio: passi di un contenitore e loro esecuzione in sequenza.

use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::commands::actions::run_steps;
use crate::commands::{db, fail, gate};
use crate::db::repo::library;
use crate::db::seed;
use crate::domain::{ActionPlan, LaunchFailure, LaunchOutcome, LaunchStep};
use crate::services::launch;
use crate::services::tools::Roots;
use crate::AppState;

/// Identificativo dell'Avvio fra le azioni recenti.
pub const LAUNCH_ACTION: &str = "launch";

#[tauri::command]
pub fn list_launch_steps(
    state: State<'_, AppState>,
    owner_id: String,
) -> Result<Vec<LaunchStep>, String> {
    let conn = db(&state)?;
    let gate = gate(&state, &conn, None)?;
    if gate.hides(&conn, &owner_id).map_err(fail)? {
        return Ok(Vec::new());
    }
    launch::list(&conn, &owner_id).map_err(fail)
}

#[tauri::command]
pub fn add_launch_step(
    state: State<'_, AppState>,
    owner_id: String,
    target_id: String,
    action_id: String,
    tool_id: Option<String>,
) -> Result<LaunchStep, String> {
    let conn = db(&state)?;
    gate(&state, &conn, None)?
        .ensure(&conn, &owner_id)
        .map_err(fail)?;
    launch::add(&conn, &owner_id, &target_id, &action_id, tool_id.as_deref()).map_err(fail)
}

#[tauri::command]
pub fn remove_launch_step(state: State<'_, AppState>, step_id: String) -> Result<(), String> {
    let conn = db(&state)?;
    let owner = launch::owner_of(&conn, &step_id).map_err(fail)?;
    gate(&state, &conn, None)?
        .ensure(&conn, &owner)
        .map_err(fail)?;
    launch::remove(&conn, &step_id).map_err(fail)
}

#[tauri::command]
pub fn move_launch_step(
    state: State<'_, AppState>,
    step_id: String,
    previous_id: Option<String>,
    next_id: Option<String>,
) -> Result<(), String> {
    let conn = db(&state)?;
    let owner = launch::owner_of(&conn, &step_id).map_err(fail)?;
    gate(&state, &conn, None)?
        .ensure(&conn, &owner)
        .map_err(fail)?;
    launch::move_step(&conn, &step_id, previous_id.as_deref(), next_id.as_deref()).map_err(fail)
}

/// Che cosa aprirebbe l'Avvio: serve al dialogo di conferma.
#[tauri::command]
pub fn prepare_launch(
    state: State<'_, AppState>,
    profile_id: String,
    owner_id: String,
    via_workspace_id: Option<String>,
) -> Result<ActionPlan, String> {
    let conn = db(&state)?;
    gate(&state, &conn, Some(&profile_id))?
        .ensure(&conn, &owner_id)
        .map_err(fail)?;
    let plan = launch::plan(
        &conn,
        &Roots::from_env(),
        &profile_id,
        &owner_id,
        via_workspace_id.as_deref(),
    )
    .map_err(fail)?;
    Ok(ActionPlan {
        action_id: LAUNCH_ACTION.into(),
        node_name: plan.owner_name.clone(),
        caution: plan.caution,
        count: plan.count(),
        tool: None,
        browser_profile: None,
    })
}

/// Esegue i passi in ordine. Un passo che non riesce non ferma gli altri:
/// l'esito li elenca.
#[tauri::command]
pub async fn run_launch(
    app: AppHandle,
    profile_id: String,
    owner_id: String,
    via_workspace_id: Option<String>,
    confirmation: Option<String>,
) -> Result<LaunchOutcome, String> {
    let state = app.state::<AppState>();
    let (plan, delay) = {
        let conn = db(&state)?;
        let gate = gate(&state, &conn, Some(&profile_id))?;
        gate.ensure(&conn, &owner_id).map_err(fail)?;
        let plan = launch::plan(
            &conn,
            &Roots::from_env(),
            &profile_id,
            &owner_id,
            via_workspace_id.as_deref(),
        )
        .map_err(fail)?;
        plan.check_confirmation(confirmation.as_deref())
            .map_err(fail)?;
        // Anche i passi dentro l'Avvio rispettano il blocco.
        for step in &plan.plans {
            gate.ensure(&conn, &step.node.id).map_err(fail)?;
        }
        let delay = seed::read_effective_settings(&conn, &profile_id)
            .map(|settings| settings.open_delay_ms)
            .unwrap_or(250);
        (plan, Duration::from_millis(delay.min(5_000)))
    };

    let runner = app.clone();
    let steps: Vec<(String, Vec<crate::services::actions::Step>, u32)> = plan
        .plans
        .iter()
        .map(|step| (step.node.name.clone(), step.steps.clone(), step.count()))
        .collect();
    let (opened, mut failures) = tauri::async_runtime::spawn_blocking(move || {
        let mut opened = 0;
        let mut failures = Vec::new();
        for (index, (name, actions, count)) in steps.iter().enumerate() {
            if index > 0 {
                std::thread::sleep(delay);
            }
            match run_steps(&runner, actions, delay) {
                Ok(()) => opened += count,
                Err(error) => failures.push(LaunchFailure {
                    step_name: name.clone(),
                    error,
                }),
            }
        }
        (opened, failures)
    })
    .await
    .map_err(fail)?;

    failures.extend(plan.failures.iter().map(|(name, error)| LaunchFailure {
        step_name: name.clone(),
        error: error.clone(),
    }));

    if opened > 0 {
        let conn = db(&state)?;
        let _ = library::record_usage(
            &conn,
            &profile_id,
            &owner_id,
            LAUNCH_ACTION,
            None,
            via_workspace_id.as_deref(),
        );
    }

    Ok(LaunchOutcome {
        steps: (plan.plans.len() + plan.failures.len()) as u32,
        opened,
        failures,
    })
}
