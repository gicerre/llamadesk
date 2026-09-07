# Architecture

## Layers

```
React (TypeScript)  ──invoke()──▶  Tauri commands (Rust)  ──▶  SQLite (bundled)
       │                                    │
       └── src/lib/ipc.ts                   └── src/commands/ — the whole API surface
           the only file that talks
           to the backend
```

The frontend never issues SQL. Everything goes through typed commands, which means:

- critical logic (Danger Zone resolution, URL validation, migrations, subtree duplication) is
  unit-testable with `cargo test`;
- a compromised npm dependency cannot reach the database;
- the TypeScript types in `src/types/domain.ts` mirror the serde structs in `src-tauri/src/domain`
  (Phase 2 will generate them with `ts-rs` to make drift impossible).

## Startup sequence

1. `tauri_plugin_single_instance` — a second launch focuses the running window instead of opening
   a second process on the same database file.
2. `db::initialize` — resolves `%APPDATA%\com.llamadesk.app\`, creates it if needed, opens
   `llamadesk.db`, applies `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL` and
   a 5 s busy timeout.
3. `migrator::run` — reads `PRAGMA user_version`, backs up a populated database, then applies each
   pending migration inside its own transaction.
4. `seed::ensure_seed` — only if `profiles` is empty: one profile named from the system locale,
   the three built-in danger prompts, the default dashboard widgets, the default settings and
   `firstRun = true`. No projects, no environments, no links.
5. Global shortcut registration — **failure here is not fatal**; the status is stored and surfaced
   to the UI.
6. System tray, then the window is shown (it is created hidden to avoid a white flash and to
   support "start minimized").

## Windows integration

| Concern | Approach |
| --- | --- |
| Closing the window | `CloseRequested` is intercepted and turned into `hide()` when *Close to tray* is on. Real exit only from the tray menu. |
| Global shortcut | `tauri-plugin-global-shortcut`, accelerator read from the database and re-registrable at runtime. `Ctrl+Space` is frequently taken by IMEs, so a failed registration is reported rather than thrown. |
| Opening URLs | `tauri-plugin-opener` → `ShellExecute` → default browser. Scheme allow-list enforced in Rust. |
| Open All | URLs are validated up front (all or nothing), then opened on a dedicated thread with a configurable stagger — opening ten URLs at once makes Chrome and Edge drop or reorder tabs. |
| Window state | `tauri-plugin-window-state` restores position and size. |
| Autostart | `tauri-plugin-autostart`, off by default, toggled from Settings. |

## Frontend structure

`src/features/<slice>/` holds vertical slices — a feature owns its components, hooks and types.
`src/components/ui/` is presentation only and knows nothing about the domain; every variant is
declared with `class-variance-authority` so states never fork the JSX.

`src/lib/motion.ts` is the single source of truth for animation. Three springs (`snappy`,
`bouncy`, `gentle`), shared variants, and the `layoutId` registry used by the sliding sidebar
pill and the palette highlight.

## Rendering and glass

Windows WebView2 cannot blur the desktop behind the window with `backdrop-filter`. The in-app
wallpaper (`src/app/providers/Wallpaper.tsx`) is therefore the layer every glass panel samples.
An overlay of configurable opacity sits between the wallpaper and the UI to guarantee contrast.
A "system transparency" mode using native Acrylic is planned as an opt-in in Settings.
