//! L'API che React vede. Nessun SQL vive nel frontend: passa tutto da qui,
//! dove le regole critiche (validazione URL, danger zone, migrazioni) sono
//! testabili con `cargo test`.

use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

use crate::commands::{db, fail};
use crate::db::repo::profiles;
use crate::db::seed;
use crate::domain::{
    AppSettings, BootstrapPayload, Profile, ProfileDeleteImpact, ProfilePatch, ProfileSession,
    ShortcutStatus,
};
use crate::shortcuts;
use crate::AppState;

/* ------------------------------------------------------------------ avvio -- */

/// Profilo attivo secondo le impostazioni globali, con ripiego sul primo
/// esistente: un `activeProfileId` che punta a un profilo cancellato non deve
/// lasciare l'applicazione senza contesto.
fn active_profile_id(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    let settings = seed::read_settings(conn).map_err(fail)?;
    let known = profiles::list(conn).map_err(fail)?;

    let active = settings
        .active_profile_id
        .filter(|id| known.iter().any(|profile| &profile.id == id))
        .or_else(|| known.first().map(|profile| profile.id.clone()));

    Ok(active)
}

#[tauri::command]
pub fn bootstrap(app: AppHandle, state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
    let conn = db(&state)?;
    let active = active_profile_id(&conn)?;

    // Le impostazioni consegnate al frontend sono gia' quelle *effettive* del
    // profilo attivo: la UI non deve conoscere il meccanismo dell'overlay per
    // disegnare la finestra giusta al primo frame.
    let (settings, overrides) = match &active {
        Some(profile_id) => (
            seed::read_effective_settings(&conn, profile_id).map_err(fail)?,
            seed::read_profile_overrides(&conn, profile_id).map_err(fail)?,
        ),
        None => (seed::read_settings(&conn).map_err(fail)?, Vec::new()),
    };

    Ok(BootstrapPayload {
        is_first_run: seed::read_flag(&conn, "firstRun").map_err(fail)?,
        app_version: app.package_info().version.to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        system_locale: sys_locale::get_locale().unwrap_or_else(|| "en-US".into()),
        profiles: profiles::list(&conn).map_err(fail)?,
        active_profile_id: active,
        settings,
        profile_overrides: overrides,
        window_material: state.window_material.to_string(),
    })
}

#[tauri::command]
pub fn complete_onboarding(state: State<'_, AppState>) -> Result<(), String> {
    let conn = db(&state)?;
    seed::write_flag(&conn, "firstRun", false).map_err(fail)
}

/* ----------------------------------------------------------- impostazioni -- */

/// Impostazioni effettive del profilo attivo (globali + override).
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = db(&state)?;
    match active_profile_id(&conn)? {
        Some(profile_id) => seed::read_effective_settings(&conn, &profile_id).map_err(fail),
        None => seed::read_settings(&conn).map_err(fail),
    }
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

        let updated: AppSettings = serde_json::from_value(Value::Object(object)).map_err(fail)?;
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
                return Err(format!(
                    "impossibile aggiornare l'avvio automatico: {error}"
                ));
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

    // Restituiamo le impostazioni *effettive*: se il profilo attivo sovrascrive
    // la chiave appena cambiata, la UI deve continuare a vedere l'override.
    let conn = db(&state)?;
    match active_profile_id(&conn)? {
        Some(profile_id) => seed::read_effective_settings(&conn, &profile_id).map_err(fail),
        None => Ok(updated),
    }
}

/// Imposta (o rimuove, con `value = null`) un override per un profilo.
/// Restituisce le impostazioni effettive risultanti.
#[tauri::command]
pub fn set_profile_setting(
    state: State<'_, AppState>,
    profile_id: String,
    key: String,
    value: Option<String>,
) -> Result<AppSettings, String> {
    let conn = db(&state)?;
    seed::write_profile_setting(&conn, &profile_id, &key, value.as_deref()).map_err(fail)?;
    seed::read_effective_settings(&conn, &profile_id).map_err(fail)
}

#[tauri::command]
pub fn get_profile_overrides(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<String>, String> {
    let conn = db(&state)?;
    seed::read_profile_overrides(&conn, &profile_id).map_err(fail)
}

/// Elenco delle chiavi che possono variare per profilo. La UI la usa per
/// decidere dove mostrare l'interruttore "solo per questo profilo", invece di
/// tenersi una copia dell'elenco che prima o poi divergerebbe.
#[tauri::command]
pub fn profile_scoped_keys() -> Vec<String> {
    seed::PROFILE_SCOPED_KEYS
        .iter()
        .map(|key| key.to_string())
        .collect()
}

/* ---------------------------------------------------------------- profili -- */

/// Rende attivo un profilo e ne restituisce il contesto completo.
///
/// Il profilo attivo è una preferenza globale: appartiene all'applicazione,
/// non al profilo (che non può dichiarare di essere quello attivo).
fn enter_profile(conn: &rusqlite::Connection, profile_id: &str) -> Result<ProfileSession, String> {
    let profile = profiles::get(conn, profile_id).map_err(fail)?;

    let mut settings = seed::read_settings(conn).map_err(fail)?;
    settings.active_profile_id = Some(profile_id.to_string());
    seed::write_settings(conn, &settings).map_err(fail)?;

    Ok(ProfileSession {
        profile,
        settings: seed::read_effective_settings(conn, profile_id).map_err(fail)?,
        overrides: seed::read_profile_overrides(conn, profile_id).map_err(fail)?,
    })
}

#[tauri::command]
pub fn activate_profile(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<ProfileSession, String> {
    let conn = db(&state)?;
    // Cambiare profilo richiude i contenuti protetti di tutti.
    state.lock.lock().map_err(fail)?.lock_all();
    enter_profile(&conn, &profile_id)
}

#[tauri::command]
pub fn list_profiles(state: State<'_, AppState>) -> Result<Vec<Profile>, String> {
    let conn = db(&state)?;
    profiles::list(&conn).map_err(fail)
}

#[tauri::command]
pub fn create_profile(state: State<'_, AppState>, name: String) -> Result<Profile, String> {
    let conn = db(&state)?;
    profiles::create(&conn, &name).map_err(fail)
}

#[tauri::command]
pub fn update_profile(
    state: State<'_, AppState>,
    id: String,
    patch: ProfilePatch,
) -> Result<Profile, String> {
    let conn = db(&state)?;
    profiles::update(&conn, &id, &patch).map_err(fail)
}

#[tauri::command]
pub fn profile_delete_impact(
    state: State<'_, AppState>,
    id: String,
) -> Result<ProfileDeleteImpact, String> {
    let conn = db(&state)?;
    profiles::delete_impact(&conn, &id).map_err(fail)
}

/// Elimina un profilo (e i workspace che solo lui vedeva) e restituisce il
/// contesto in cui l'applicazione si ritrova: se era quello attivo si passa
/// al primo rimasto, altrimenti si resta dove si era.
#[tauri::command]
pub fn delete_profile(state: State<'_, AppState>, id: String) -> Result<ProfileSession, String> {
    let mut guard = db(&state)?;
    // Cancellazione e cambio di profilo attivo vanno insieme: un
    // `activeProfileId` rimasto a puntare nel vuoto non deve arrivare su disco.
    let tx = guard.transaction().map_err(fail)?;

    profiles::delete(&tx, &id).map_err(fail)?;
    let active = active_profile_id(&tx)?.ok_or("nessun profilo rimasto")?;
    let session = enter_profile(&tx, &active)?;

    tx.commit().map_err(fail)?;
    Ok(session)
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
