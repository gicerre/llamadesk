//! LlamaDesk — launcher e workspace manager local-first.
//!
//! Tutto quello che l'applicazione sa vive in un singolo file SQLite nella
//! cartella dati dell'utente. Nessuna rete, nessun account, nessuna telemetria.

mod commands;
mod db;
mod domain;
mod services;
mod shortcuts;
mod tray;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::ShortcutState;


/// Stato condiviso fra i comandi. Una sola connessione dietro un Mutex: e'
/// un'app monoutente locale, un pool sarebbe complessita' senza guadagno.
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: PathBuf,
    pub shortcuts: Mutex<shortcuts::Registry>,
}

pub fn run() {
    tauri::Builder::default()
        // Deve restare il primo: intercetta il secondo avvio prima di ogni
        // altra inizializzazione, evitando due processi sullo stesso database.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::reveal(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        shortcuts::dispatch(app, shortcut);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();

            // 1. Database: creazione silenziosa, migrazioni, seed del primo avvio.
            let (connection, db_path) = db::initialize(&handle)?;
            let settings = db::seed::read_settings(&connection)?;

            // 2. Manutenzione: workspace temporanei scaduti e annotazioni orfane.
            //    Costa millisecondi e tiene pulito un database che vive per anni.
            let _ = db::repo::bundles::purge_expired(&connection);
            let _ = db::repo::library::prune_orphans(&connection);

            app.manage(AppState {
                db: Mutex::new(connection),
                db_path,
                shortcuts: Mutex::new(shortcuts::Registry::default()),
            });

            // 3. Scorciatoie globali: si registrano DOPO `manage`, perche' il
            //    gestore ha bisogno dello stato per capire quale ha premuto
            //    l'utente. Un fallimento qui non deve impedire l'avvio.
            shortcuts::apply_all(
                &handle,
                &settings.global_shortcut,
                &settings.capture_shortcut,
            );

            // 4. System tray.
            tray::build(&handle, &settings.language)?;

            // 5. Finestra: creata nascosta in tauri.conf.json per evitare il
            //    flash bianco: la mostriamo qui, se non si parte in tray.
            if let Some(window) = app.get_webview_window("main") {
                let should_hide = settings.start_minimized
                    || std::env::args().any(|arg| arg == "--minimized");

                if !should_hide {
                    let _ = window.show();
                }

                // La X non chiude l'app: la ripone nella tray (configurabile).
                let close_handle = handle.clone();
                window.clone().on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let close_to_tray = close_handle
                            .try_state::<AppState>()
                            .and_then(|state| {
                                state
                                    .db
                                    .lock()
                                    .ok()
                                    .and_then(|conn| db::seed::read_settings(&conn).ok())
                            })
                            .map(|settings| settings.close_to_tray)
                            .unwrap_or(true);

                        if close_to_tray {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // avvio, impostazioni, profili, scorciatoia
            commands::app::bootstrap,
            commands::app::complete_onboarding,
            commands::app::get_settings,
            commands::app::set_setting,
            commands::app::list_profiles,
            commands::app::create_profile,
            commands::app::rename_profile,
            commands::app::apply_global_shortcut,
            commands::app::get_shortcut_status,
            // gerarchia
            commands::tree::list_containers,
            commands::tree::get_container_view,
            commands::tree::resolve_sibling_path,
            commands::tree::create_container,
            commands::tree::update_container,
            commands::tree::move_container,
            commands::tree::container_delete_impact,
            commands::tree::delete_container,
            commands::tree::duplicate_container,
            // applicazioni e link
            commands::items::create_application,
            commands::items::update_application,
            commands::items::move_application,
            commands::items::delete_application,
            commands::items::duplicate_application,
            commands::items::create_link,
            commands::items::update_link,
            commands::items::move_link,
            commands::items::delete_link,
            // apertura e danger zone
            commands::open::list_danger_prompts,
            commands::open::prepare_open,
            commands::open::prepare_open_many,
            commands::open::open_link,
            commands::open::open_links,
            // ricerca, recenti, salute dei link
            commands::discover::search_all,
            commands::discover::link_health,
            commands::discover::recent_applications,
            commands::discover::favourite_applications,
            // tag e note
            commands::library::list_tags,
            commands::library::tags_for_entity,
            commands::library::set_entity_tags,
            commands::library::get_note,
            commands::library::set_note,
            // quick workspaces
            commands::workspaces::list_bundles,
            commands::workspaces::create_bundle,
            commands::workspaces::update_bundle,
            commands::workspaces::delete_bundle,
            commands::workspaces::add_bundle_link,
            commands::workspaces::remove_bundle_link,
            commands::workspaces::reorder_bundle_links,
            // backup, sfondi, prompt personalizzati
            commands::data::export_backup,
            commands::data::preview_backup,
            commands::data::import_backup,
            commands::data::list_backgrounds,
            commands::data::create_background,
            commands::data::import_background_image,
            commands::data::delete_background,
            commands::data::set_profile_background,
            commands::data::save_danger_prompt,
            commands::data::delete_danger_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("errore fatale durante l'avvio di LlamaDesk");
}
