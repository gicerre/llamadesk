//! Password di blocco, sblocco e blocco della sessione.

use std::time::Instant;

use tauri::{AppHandle, Emitter, State};

use crate::commands::{db, fail, gate};
use crate::db::repo::profiles;
use crate::domain::{LockStatus, UnlockOutcome};
use crate::services::protection;
use crate::AppState;

/// Evento verso il frontend: la sessione si e' bloccata (Rust l'ha deciso).
pub const LOCKED_EVENT: &str = "llamadesk://locked";

#[tauri::command]
pub fn lock_status(state: State<'_, AppState>, profile_id: String) -> Result<LockStatus, String> {
    let conn = db(&state)?;
    let unlocked = gate(&state, &conn, Some(&profile_id))?.unlocked;
    let retry = state
        .lock
        .lock()
        .map_err(fail)?
        .retry_after(&profile_id, Instant::now());
    Ok(LockStatus {
        has_lock: protection::has_lock(&conn, &profile_id).map_err(fail)?,
        unlocked,
        protected_count: protection::protected_count(&conn, &profile_id).map_err(fail)?,
        retry_after_seconds: retry.as_secs_f64().ceil() as u32,
        auto_minutes: profiles::get(&conn, &profile_id)
            .map_err(fail)?
            .lock_auto_minutes,
    })
}

#[tauri::command]
pub fn unlock_profile(
    state: State<'_, AppState>,
    profile_id: String,
    password: String,
) -> Result<UnlockOutcome, String> {
    let conn = db(&state)?;
    let mut book = state.lock.lock().map_err(fail)?;
    let now = Instant::now();
    let unlocked =
        protection::unlock(&conn, &mut book, &profile_id, &password, now).map_err(fail)?;
    Ok(UnlockOutcome {
        unlocked,
        retry_after_seconds: book.retry_after(&profile_id, now).as_secs_f64().ceil() as u32,
    })
}

/// Imposta o cambia la password (per cambiarla serve quella attuale).
#[tauri::command]
pub fn set_lock_password(
    state: State<'_, AppState>,
    profile_id: String,
    current: Option<String>,
    password: String,
) -> Result<(), String> {
    let conn = db(&state)?;
    let mut book = state.lock.lock().map_err(fail)?;
    protection::set_password(
        &conn,
        &mut book,
        &profile_id,
        current.as_deref(),
        &password,
        Instant::now(),
    )
    .map_err(fail)
}

/// Toglie la password e la protezione da tutto cio' che il profilo vede.
/// Restituisce quanti elementi non sono piu' protetti.
#[tauri::command]
pub fn remove_lock(state: State<'_, AppState>, profile_id: String) -> Result<u32, String> {
    let conn = db(&state)?;
    let mut book = state.lock.lock().map_err(fail)?;
    protection::remove_lock(&conn, &mut book, &profile_id).map_err(fail)
}

/// `Ctrl+L`: blocca tutte le sessioni.
#[tauri::command]
pub fn lock_session(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.lock.lock().map_err(fail)?.lock_all();
    let _ = app.emit(LOCKED_EVENT, ());
    Ok(())
}

/// L'utente sta usando l'app: rimanda il blocco per inattivita'.
#[tauri::command]
pub fn touch_session(state: State<'_, AppState>, profile_id: String) -> Result<(), String> {
    state
        .lock
        .lock()
        .map_err(fail)?
        .touch(&profile_id, Instant::now());
    Ok(())
}
