//! Materiale della finestra principale.
//!
//! Su Windows 11 la sidebar e la barra del titolo lasciano vedere il
//! materiale Mica del sistema (decisione D8): e' l'unico punto in cui
//! l'interfaccia non e' una superficie solida. Altrove (Windows 10, o se il
//! sistema rifiuta l'effetto) l'interfaccia dipinge tinte solide equivalenti.
//!
//! La finestra e' dichiarata `transparent` in `tauri.conf.json`: per questo il
//! frontend deve sapere quale materiale e' attivo, altrimenti con `solid`
//! lascerebbe vedere il desktop.

use tauri::WebviewWindow;

/// Materiale effettivo: `"mica"` oppure `"solid"`.
pub fn apply_material(window: &WebviewWindow) -> &'static str {
    #[cfg(windows)]
    {
        use tauri::window::{Effect, EffectsBuilder};

        // Mica esiste da Windows 11 (build 22000).
        if windows_version::OsVersion::current().build >= 22000 {
            let effects = EffectsBuilder::new().effect(Effect::Mica).build();
            if window.set_effects(effects).is_ok() {
                return "mica";
            }
        }
    }

    let _ = window;
    "solid"
}

/// Mostra la finestra principale la prima volta, a meno che l'app sia partita
/// nella tray. Chiamata dal frontend al primo fotogramma e dal ripiego a tempo:
/// vince il primo, l'altro non fa nulla.
pub fn reveal_once(app: &tauri::AppHandle, state: &crate::AppState) {
    use std::sync::atomic::Ordering;
    use tauri::Manager;

    if state.started_hidden || state.revealed.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
