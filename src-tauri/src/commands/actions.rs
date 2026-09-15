//! Azioni e strumenti: aprire link, file, cartelle, IDE e terminali.

use std::process::Command;
use std::time::Duration;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::{db, fail, gate};
use crate::db::repo::library;
use crate::db::seed;
use crate::domain::{
    ActionOutcome, ActionPlan, BrowserProfile, Tool, ToolKind, ToolPreferenceState,
};
use crate::services::actions::{self, Request, Step};
use crate::services::tools::{self, Launch, Roots};
use crate::AppState;

/* ------------------------------------------------------------- strumenti */

#[tauri::command]
pub fn list_tools(
    state: State<'_, AppState>,
    include_hidden: Option<bool>,
) -> Result<Vec<Tool>, String> {
    let conn = db(&state)?;
    let stored = tools::list(&conn, include_hidden.unwrap_or(false)).map_err(fail)?;
    Ok(stored.iter().map(tools::StoredTool::to_tool).collect())
}

/// Cerca di nuovo gli strumenti installati. Il disco si legge fuori dal lock.
#[tauri::command]
pub async fn refresh_tools(app: AppHandle) -> Result<Vec<Tool>, String> {
    let detected = tauri::async_runtime::spawn_blocking(|| tools::detect(&Roots::from_env()))
        .await
        .map_err(fail)?;
    let state = app.state::<AppState>();
    let conn = db(&state)?;
    tools::sync(&conn, &detected).map_err(fail)?;
    let stored = tools::list(&conn, true).map_err(fail)?;
    Ok(stored.iter().map(tools::StoredTool::to_tool).collect())
}

#[tauri::command]
pub fn browser_profiles(tool_id: String) -> Vec<BrowserProfile> {
    tools::browser_profiles(&tool_id, &Roots::from_env())
}

#[tauri::command]
pub fn add_custom_tool(
    state: State<'_, AppState>,
    kind: ToolKind,
    name: String,
    exe_path: String,
    args: String,
) -> Result<Tool, String> {
    let conn = db(&state)?;
    tools::add_custom(&conn, kind, &name, &exe_path, &args)
        .map(|tool| tool.to_tool())
        .map_err(fail)
}

#[tauri::command]
pub fn delete_custom_tool(state: State<'_, AppState>, tool_id: String) -> Result<(), String> {
    let conn = db(&state)?;
    tools::delete_custom(&conn, &tool_id).map_err(fail)
}

#[tauri::command]
pub fn set_tool_hidden(
    state: State<'_, AppState>,
    tool_id: String,
    hidden: bool,
) -> Result<(), String> {
    let conn = db(&state)?;
    tools::set_hidden(&conn, &tool_id, hidden).map_err(fail)
}

/// Strumento preferito per tipo, sul profilo (`node_id` assente) o su un nodo.
#[tauri::command]
pub fn set_tool_preference(
    state: State<'_, AppState>,
    profile_id: String,
    node_id: Option<String>,
    kind: ToolKind,
    tool_id: Option<String>,
) -> Result<(), String> {
    let conn = db(&state)?;
    if let Some(node) = node_id.as_deref() {
        gate(&state, &conn, Some(&profile_id))?
            .ensure(&conn, node)
            .map_err(fail)?;
    }
    tools::set_preference(
        &conn,
        &profile_id,
        node_id.as_deref(),
        kind,
        tool_id.as_deref(),
    )
    .map_err(fail)
}

#[tauri::command]
pub fn tool_preferences(
    state: State<'_, AppState>,
    profile_id: String,
    node_id: Option<String>,
    via_workspace_id: Option<String>,
) -> Result<Vec<ToolPreferenceState>, String> {
    let conn = db(&state)?;
    tools::preference_states(
        &conn,
        &profile_id,
        node_id.as_deref(),
        via_workspace_id.as_deref(),
    )
    .map_err(fail)
}

/* ---------------------------------------------------------------- azioni */

/// Che cosa farebbe un'azione, senza eseguirla: serve al dialogo di conferma.
#[tauri::command]
pub fn prepare_action(
    state: State<'_, AppState>,
    profile_id: String,
    node_id: String,
    action_id: String,
    tool_id: Option<String>,
    via_workspace_id: Option<String>,
) -> Result<ActionPlan, String> {
    let conn = db(&state)?;
    gate(&state, &conn, Some(&profile_id))?
        .ensure(&conn, &node_id)
        .map_err(fail)?;
    let request = Request {
        profile_id: &profile_id,
        node_id: &node_id,
        action_id: &action_id,
        tool_id: tool_id.as_deref(),
        via_workspace_id: via_workspace_id.as_deref(),
    };
    actions::plan(&conn, &Roots::from_env(), &request)
        .map(|plan| plan.view())
        .map_err(fail)
}

/// Esegue un'azione. Se l'elemento chiede conferma e `confirmation` manca (o
/// non e' il nome richiesto) fallisce con `confirmation_required`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn execute_action(
    app: AppHandle,
    profile_id: String,
    node_id: String,
    action_id: String,
    tool_id: Option<String>,
    via_workspace_id: Option<String>,
    confirmation: Option<String>,
) -> Result<ActionOutcome, String> {
    let state = app.state::<AppState>();

    let (plan, delay) = {
        let conn = db(&state)?;
        gate(&state, &conn, Some(&profile_id))?
            .ensure(&conn, &node_id)
            .map_err(fail)?;
        let request = Request {
            profile_id: &profile_id,
            node_id: &node_id,
            action_id: &action_id,
            tool_id: tool_id.as_deref(),
            via_workspace_id: via_workspace_id.as_deref(),
        };
        let plan = actions::plan(&conn, &Roots::from_env(), &request).map_err(fail)?;
        plan.check_confirmation(confirmation.as_deref())
            .map_err(fail)?;
        let delay = seed::read_effective_settings(&conn, &profile_id)
            .map(|settings| settings.open_delay_ms)
            .unwrap_or(250);
        (plan, Duration::from_millis(delay.min(5_000)))
    };

    // Aprire puo' richiedere tempo (dischi di rete, piu' schede distanziate):
    // mai sul thread dell'interfaccia, mai con il database bloccato.
    let steps = plan.steps.clone();
    let runner = app.clone();
    tauri::async_runtime::spawn_blocking(move || run_steps(&runner, &steps, delay))
        .await
        .map_err(fail)??;

    let recorded_tool = plan
        .tool
        .as_ref()
        .filter(|_| plan.explicit_tool)
        .map(|tool| tool.id.as_str());
    {
        let conn = db(&state)?;
        // L'uso non registrato non deve far sembrare fallita un'apertura riuscita.
        let _ = library::record_usage(
            &conn,
            &profile_id,
            &plan.node.id,
            &plan.action_id,
            recorded_tool,
            plan.via_workspace_id.as_deref(),
        );
    }

    Ok(ActionOutcome {
        opened: plan.count(),
        tool_name: plan.tool.as_ref().map(|tool| tool.name.clone()),
        browser_profile: plan.browser_profile.clone(),
    })
}

pub(crate) fn run_steps(app: &AppHandle, steps: &[Step], delay: Duration) -> Result<(), String> {
    for (index, step) in steps.iter().enumerate() {
        // Molte schede tutte insieme: il browser le perde o le riordina.
        if index > 0 && matches!(step, Step::Url(_)) {
            std::thread::sleep(delay);
        }
        match step {
            Step::Url(url) => app.opener().open_url(url, None::<&str>).map_err(fail)?,
            Step::Path(path) => app.opener().open_path(path, None::<&str>).map_err(fail)?,
            Step::Reveal(path) => app.opener().reveal_item_in_dir(path).map_err(fail)?,
            Step::Spawn(launch) => spawn(launch)
                .map_err(|error| format!("impossibile avviare {}: {error}", launch.exe))?,
        }
    }
    Ok(())
}

/// Avvia un processo staccato: eseguibile e argomenti separati, niente shell.
fn spawn(launch: &Launch) -> std::io::Result<()> {
    let mut command = Command::new(&launch.exe);
    command.args(&launch.args);
    if let Some(cwd) = &launch.cwd {
        command.current_dir(cwd);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // Un terminale vuole la sua finestra; lo script `.cmd` che avvia un
        // IDE (JetBrains Toolbox) non deve lasciare una console aperta.
        let wraps_script = launch.exe.eq_ignore_ascii_case("cmd.exe") && !launch.console;
        if launch.console {
            command.creation_flags(CREATE_NEW_CONSOLE);
        } else if wraps_script {
            command.creation_flags(CREATE_NO_WINDOW);
        }
    }

    command.spawn().map(|_| ())
}
