//! Scorciatoie globali.
//!
//! Due acceleratori, entrambi configurabili:
//!  * **palette** (default `CmdOrCtrl+Space`) apre la ricerca globale;
//!  * **capture** (default `CmdOrCtrl+Shift+L`) legge un URL dagli appunti e
//!    apre la cattura rapida.
//!
//! Punto delicato su Windows: `Ctrl+Space` è spesso già occupato dagli IME
//! (cinese/giapponese/coreano) o da altri launcher. La registrazione può
//! quindi fallire in modo del tutto legittimo: quando succede l'applicazione
//! NON deve crashare, deve avviarsi comunque e segnalarlo all'interfaccia,
//! che continua a funzionare con la scorciatoia a livello di finestra.

use std::str::FromStr;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::domain::ShortcutStatus;
use crate::services::opener;
use crate::AppState;

/// Evento ascoltato dal frontend per aprire/chiudere la Command Palette.
pub const TOGGLE_PALETTE_EVENT: &str = "llamadesk://toggle-palette";
/// Evento della cattura rapida: porta con sé l'URL trovato negli appunti.
pub const QUICK_CAPTURE_EVENT: &str = "llamadesk://quick-capture";

pub const DEFAULT_PALETTE: &str = "CmdOrCtrl+Space";
pub const DEFAULT_CAPTURE: &str = "CmdOrCtrl+Shift+L";

/// Quali acceleratori sono attualmente registrati, e con quale esito.
#[derive(Default)]
pub struct Registry {
    pub palette: Option<Shortcut>,
    pub capture: Option<Shortcut>,
    pub palette_status: Option<ShortcutStatus>,
    pub capture_status: Option<ShortcutStatus>,
}

impl Registry {
    pub fn status(&self, kind: Kind) -> ShortcutStatus {
        let stored = match kind {
            Kind::Palette => &self.palette_status,
            Kind::Capture => &self.capture_status,
        };

        stored.clone().unwrap_or(ShortcutStatus {
            accelerator: String::new(),
            registered: false,
            error: None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Palette,
    Capture,
}

impl Kind {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "palette" => Some(Self::Palette),
            "capture" => Some(Self::Capture),
            _ => None,
        }
    }
}

/// Registra entrambi gli acceleratori, sostituendo quelli attivi.
pub fn apply_all(app: &AppHandle, palette: &str, capture: &str) {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let palette_result = register(app, palette);
    let capture_result = register(app, capture);

    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut registry) = state.shortcuts.lock() {
            registry.palette = palette_result.0;
            registry.palette_status = Some(palette_result.1);
            registry.capture = capture_result.0;
            registry.capture_status = Some(capture_result.1);
        }
    }
}

/// Registra un singolo acceleratore mantenendo l'altro invariato.
pub fn apply_one(app: &AppHandle, kind: Kind, accelerator: &str) -> ShortcutStatus {
    let (palette, capture) = {
        let Some(state) = app.try_state::<AppState>() else {
            return ShortcutStatus {
                accelerator: accelerator.to_string(),
                registered: false,
                error: Some("stato dell'applicazione non disponibile".into()),
            };
        };
        let registry = match state.shortcuts.lock() {
            Ok(registry) => registry,
            Err(_) => {
                return ShortcutStatus {
                    accelerator: accelerator.to_string(),
                    registered: false,
                    error: Some("stato delle scorciatoie non leggibile".into()),
                }
            }
        };

        let palette = registry.status(Kind::Palette).accelerator;
        let capture = registry.status(Kind::Capture).accelerator;
        (palette, capture)
    };

    match kind {
        Kind::Palette => apply_all(app, accelerator, &capture),
        Kind::Capture => apply_all(app, &palette, accelerator),
    }

    app.try_state::<AppState>()
        .and_then(|state| state.shortcuts.lock().ok().map(|registry| registry.status(kind)))
        .unwrap_or(ShortcutStatus {
            accelerator: accelerator.to_string(),
            registered: false,
            error: Some("stato non leggibile dopo la registrazione".into()),
        })
}

fn register(app: &AppHandle, accelerator: &str) -> (Option<Shortcut>, ShortcutStatus) {
    let shortcut = match Shortcut::from_str(accelerator) {
        Ok(shortcut) => shortcut,
        Err(error) => {
            return (
                None,
                ShortcutStatus {
                    accelerator: accelerator.to_string(),
                    registered: false,
                    error: Some(format!("acceleratore non valido: {error}")),
                },
            )
        }
    };

    match app.global_shortcut().register(shortcut) {
        Ok(()) => (
            Some(shortcut),
            ShortcutStatus {
                accelerator: accelerator.to_string(),
                registered: true,
                error: None,
            },
        ),
        Err(error) => (
            None,
            ShortcutStatus {
                accelerator: accelerator.to_string(),
                registered: false,
                error: Some(error.to_string()),
            },
        ),
    }
}

/// Smista la pressione sull'azione giusta.
pub fn dispatch(app: &AppHandle, pressed: &Shortcut) {
    let kind = app
        .try_state::<AppState>()
        .and_then(|state| {
            state.shortcuts.lock().ok().and_then(|registry| {
                if registry.palette.as_ref() == Some(pressed) {
                    Some(Kind::Palette)
                } else if registry.capture.as_ref() == Some(pressed) {
                    Some(Kind::Capture)
                } else {
                    None
                }
            })
        });

    match kind {
        Some(Kind::Palette) => summon(app),
        Some(Kind::Capture) => quick_capture(app),
        None => {}
    }
}

/// Porta la finestra in primo piano e chiede al frontend di aprire la palette.
pub fn summon(app: &AppHandle) {
    reveal(app);
    let _ = app.emit(TOGGLE_PALETTE_EVENT, ());
}

/// Cattura rapida: legge gli appunti, e se contengono un URL valido apre il
/// dialogo di salvataggio già compilato.
///
/// Gli appunti vengono letti SOLO in risposta a questa scorciatoia, mai in
/// background: l'applicazione non osserva ciò che copi.
pub fn quick_capture(app: &AppHandle) {
    let clipboard = app.clipboard().read_text().unwrap_or_default();
    let url = opener::validate(&clipboard).ok();

    reveal(app);
    let _ = app.emit(QUICK_CAPTURE_EVENT, url);
}

fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
