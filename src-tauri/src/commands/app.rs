//! L'API che React vede. Nessun SQL vive nel frontend: passa tutto da qui,
//! dove le regole critiche (validazione URL, danger zone, migrazioni) sono
//! testabili con `cargo test`.

use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::db::repo::profiles;
use crate::db::seed;
use crate::domain::{AppSettings, BootstrapPayload, Profile, ShortcutStatus};
use crate::shortcuts;
use crate::commands::{db, fail};
use crate::AppState;

/* ------------------------------------------------------------------ avvio -- */

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
    let conn = db(&state)?;

    Ok(BootstrapPayload {
        is_first_run: seed::read_flag(&conn, "firstRun").map_err(fail)?,
        app_version: app.package_info().version.to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        system_locale: sys_locale::get_locale().unwrap_or_else(|| "en-US".into()),
        profiles: profiles::list(&conn).map_err(fail)?,
        settings: seed::read_settings(&conn).map_err(fail)?,
    })
}

#[tauri::command]
pub fn complete_onboarding(state: State<'_, AppState>) -> Result<(), String> {
    let conn = db(&state)?;
    seed::write_flag(&conn, "firstRun", false).map_err(fail)
}

/* ----------------------------------------------------------- impostazioni -- */

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = db(&state)?;
    seed::read_settings(&conn).map_err(fail)
}

/// Aggiorna una singola chiave e restituisce l'intera struct rileggendola dal
/// database: cosi' il frontend non puo' mai divergere dallo stato persistito.
#[tauri::command]
pub fn set_setting(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<AppSettings, String> {
    let updated = {
        let conn = db(&state)?;
        let current = seed::read_settings(&conn).map_err(fail)?;

        let mut object = serde_json::to_value(&current)
            .map_err(fail)?
            .as_object()
            .cloned()
            .ok_or_else(|| "impostazioni non serializzabili".to_string())?;

        if !object.contains_key(&key) {
            return Err(format!("impostazione sconosciuta: {key}"));
        }

        let parsed: Value = serde_json::from_str(&value).map_err(fail)?;
        object.insert(key.clone(), parsed);

        let updated: AppSettings =
            serde_json::from_value(Value::Object(object)).map_err(fail)?;
        seed::write_settings(&conn, &updated).map_err(fail)?;
        updated
    };

    // Effetti collaterali sull'OS, fuori dal lock del database.
    match key.as_str() {
        "autostart" => {
            let launcher = app.autolaunch();
            let result = if updated.autostart {
                launcher.enable()
            } else {
                launcher.disable()
            };
            if let Err(error) = result {
                return Err(format!("impossibile aggiornare l'avvio automatico: {error}"));
            }
        }
        "globalShortcut" => {
            shortcuts::apply_one(&app, shortcuts::Kind::Palette, &updated.global_shortcut);
        }
        "captureShortcut" => {
            shortcuts::apply_one(&app, shortcuts::Kind::Capture, &updated.capture_shortcut);
        }
        _ => {}
    }

    Ok(updated)
}

/* ---------------------------------------------------------------- profili -- */

#[tauri::command]
pub fn list_profiles(state: State<'_, AppState>) -> Result<Vec<Profile>, String> {
    let conn = db(&state)?;
    profiles::list(&conn).map_err(fail)
}

#[tauri::command]
pub fn create_profile(
    state: State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> Result<Profile, String> {
    let conn = db(&state)?;
    profiles::create(&conn, &name, icon.as_deref()).map_err(fail)
}

#[tauri::command]
pub fn rename_profile(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<Profile, String> {
    let conn = db(&state)?;
    profiles::rename(&conn, &id, &name).map_err(fail)
}

/* ------------------------------------------------------ scorciatoia globale -- */

/// Registra un acceleratore e, se ci riesce, lo salva.
/// `kind` vale `palette` oppure `capture`.
#[tauri::command]
pub fn apply_global_shortcut(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
    accelerator: String,
) -> Result<ShortcutStatus, String> {
    let parsed = shortcuts::Kind::parse(&kind)
        .ok_or_else(|| format!("tipo di scorciatoia sconosciuto: {kind}"))?;

    let status = shortcuts::apply_one(&app, parsed, &accelerator);

    // Un acceleratore che non si registra non viene salvato: al riavvio
    // l'utente si ritroverebbe con una scorciatoia che non ha mai funzionato.
    if status.registered {
        let conn = db(&state)?;
        let mut settings = seed::read_settings(&conn).map_err(fail)?;
        match parsed {
            shortcuts::Kind::Palette => settings.global_shortcut = accelerator,
            shortcuts::Kind::Capture => settings.capture_shortcut = accelerator,
        }
        seed::write_settings(&conn, &settings).map_err(fail)?;
    }

    Ok(status)
}

#[tauri::command]
pub fn get_shortcut_status(
    state: State<'_, AppState>,
    kind: String,
) -> Result<ShortcutStatus, String> {
    let parsed = shortcuts::Kind::parse(&kind)
        .ok_or_else(|| format!("tipo di scorciatoia sconosciuto: {kind}"))?;

    let registry = state.shortcuts.lock().map_err(fail)?;
    Ok(registry.status(parsed))
}
