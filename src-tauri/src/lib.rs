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
mod window;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::ShortcutState;

/// Stato condiviso fra i comandi. Una sola connessione dietro un Mutex: e'
/// un'app monoutente locale, un pool sarebbe complessita' senza guadagno.
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: PathBuf,
    pub shortcuts: Mutex<shortcuts::Registry>,
    /// Chi e' sbloccato. Solo in memoria: un riavvio blocca tutto.
    pub lock: Mutex<services::protection::LockBook>,
    /// Materiale della finestra (`mica` | `solid`), deciso all'avvio.
    pub window_material: &'static str,
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

            // 2. Manutenzione: il cestino vale per una sessione, la cronologia
            //    d'uso per 90 giorni. Costa millisecondi e tiene pulito un
            //    database che vive per anni.
            let _ = services::hierarchy::empty_trash(&connection);
            let _ = db::repo::library::prune_usage(&connection);

            // Il materiale va deciso prima di mostrare la finestra: il frontend
            // lo legge al bootstrap per sapere se dipingere tinte solide.
            let window_material = app
                .get_webview_window("main")
                .map(|window| window::apply_material(&window))
                .unwrap_or("solid");

            app.manage(AppState {
                db: Mutex::new(connection),
                db_path,
                shortcuts: Mutex::new(shortcuts::Registry::default()),
                lock: Mutex::new(services::protection::LockBook::default()),
                window_material,
            });

            // Strumenti installati: il rilevamento legge il disco, quindi gira
            // in background e aggiorna la tabella quando ha finito.
            let tools_handle = handle.clone();
            std::thread::spawn(move || {
                let detected = services::tools::detect(&services::tools::Roots::from_env());
                if let Some(state) = tools_handle.try_state::<AppState>() {
                    if let Ok(conn) = state.db.lock() {
                        let _ = services::tools::sync(&conn, &detected);
                    }
                }
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
                let should_hide =
                    settings.start_minimized || std::env::args().any(|arg| arg == "--minimized");

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
                        // La finestra sparisce (tray) o si chiude: i contenuti
                        // protetti si richiudono.
                        if let Some(state) = close_handle.try_state::<AppState>() {
                            if let Ok(mut book) = state.lock.lock() {
                                book.lock_all();
                            }
                        }
                        let _ = close_handle.emit(commands::protection::LOCKED_EVENT, ());
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // avvio, impostazioni, profili, scorciatoie
            commands::app::bootstrap,
            commands::app::complete_onboarding,
            commands::app::get_settings,
            commands::app::set_setting,
            commands::app::set_profile_setting,
            commands::app::get_profile_overrides,
            commands::app::profile_scoped_keys,
            commands::app::activate_profile,
            commands::app::list_profiles,
            commands::app::create_profile,
            commands::app::update_profile,
            commands::app::profile_delete_impact,
            commands::app::delete_profile,
            commands::app::apply_global_shortcut,
            commands::app::get_shortcut_status,
            // workspace del profilo
            commands::workspaces::list_workspaces,
            commands::workspaces::workspace_profiles,
            commands::workspaces::set_workspace_visibility,
            commands::workspaces::reorder_workspace,
            commands::workspaces::set_default_workspace,
            commands::workspaces::remember_workspace_route,
            // libreria
            commands::nodes::get_node_view,
            commands::nodes::list_children,
            commands::nodes::create_node,
            commands::nodes::create_link_group,
            commands::nodes::update_node,
            commands::nodes::move_node,
            commands::nodes::share_node,
            commands::nodes::unshare_node,
            commands::nodes::set_node_pinned,
            commands::nodes::archive_node,
            commands::nodes::node_delete_impact,
            commands::nodes::delete_node,
            commands::nodes::restore_deletion,
            commands::nodes::duplicate_node,
            commands::nodes::set_node_tags,
            commands::nodes::list_tags,
            // preferiti e recenti
            commands::library::toggle_favorite,
            commands::library::list_favorites,
            commands::library::list_recents,
            // percorsi locali
            commands::paths::inspect_paths,
            // azioni e strumenti
            commands::actions::list_tools,
            commands::actions::refresh_tools,
            commands::actions::browser_profiles,
            commands::actions::add_custom_tool,
            commands::actions::delete_custom_tool,
            commands::actions::set_tool_hidden,
            commands::actions::set_tool_preference,
            commands::actions::tool_preferences,
            commands::actions::prepare_action,
            commands::actions::execute_action,
            // command palette
            commands::search::search_library,
            // protezione
            commands::protection::lock_status,
            commands::protection::unlock_profile,
            commands::protection::set_lock_password,
            commands::protection::remove_lock,
            commands::protection::lock_session,
            commands::protection::touch_session,
        ])
        .run(tauri::generate_context!())
        .expect("errore fatale durante l'avvio di LlamaDesk");
}
