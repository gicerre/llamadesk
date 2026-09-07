//! System tray: l'app vive nella barra delle applicazioni anche a finestra chiusa.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use crate::shortcuts;

struct Labels {
    open: &'static str,
    search: &'static str,
    settings: &'static str,
    quit: &'static str,
}

/// Le etichette della tray sono native, non passano da i18next: le teniamo qui
/// nelle due lingue supportate.
fn labels(language: &str) -> Labels {
    if language == "it" {
        Labels {
            open: "Apri LlamaDesk",
            search: "Ricerca rapida",
            settings: "Impostazioni",
            quit: "Esci",
        }
    } else {
        Labels {
            open: "Open LlamaDesk",
            search: "Quick search",
            settings: "Settings",
            quit: "Quit",
        }
    }
}

pub fn build(app: &AppHandle, language: &str) -> tauri::Result<()> {
    let text = labels(language);

    let open = MenuItem::with_id(app, "tray:open", text.open, true, None::<&str>)?;
    let search = MenuItem::with_id(app, "tray:search", text.search, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "tray:settings", text.settings, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray:quit", text.quit, true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open,
            &search,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("LlamaDesk")
        .menu(&menu)
        // Il click sinistro apre la finestra; il menu resta sul tasto destro.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray:open" => reveal(app),
            "tray:search" => shortcuts::summon(app),
            "tray:settings" => {
                reveal(app);
                // La navigazione vera avviene lato React: qui basta l'evento.
                let _ = tauri::Emitter::emit(app, "llamadesk://open-settings", ());
            }
            "tray:quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// Mostra e mette a fuoco la finestra principale, ovunque si trovasse.
pub fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
