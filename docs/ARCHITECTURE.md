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

- critical logic (hierarchy rules, inheritance of protection and caution, URL validation,
  migrations, deletion with undo) is unit-testable with `cargo test`;
- a compromised npm dependency cannot reach the database;
- the TypeScript types in `src/types/generated` are generated from the serde structs in
  `src-tauri/src/domain` by `ts-rs` during `cargo test`, so they cannot drift.

Inside Rust: `commands/` orchestrates, `db/repo/` talks to SQLite, `services/` applies rules
(`hierarchy`, `resolve`, `ordering`, `opener`). Multi-row writes go through `db::atomic`, a
SAVEPOINT that composes inside an outer transaction.

## Startup sequence

1. `tauri_plugin_single_instance` — a second launch focuses the running window instead of opening
   a second process on the same database file.
2. `db::initialize` — resolves `%APPDATA%\com.llamadesk.app\`, creates it if needed, opens
   `llamadesk.db`, applies `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL` and
   a 5 s busy timeout.
3. `migrator::run` — reads `PRAGMA user_version`, backs up a populated database, then applies each
   pending migration inside its own transaction.
4. `seed::ensure_seed` — only if `profiles` is empty: one profile named from the system locale,
   the default settings and `firstRun = true`. No workspaces, no projects, no links.
5. Maintenance — the trash is emptied (undo lasts one session) and usage events older than 90
   days are forgotten.
6. Global shortcut registration — **failure here is not fatal**; the status is stored and surfaced
   to the UI.
7. System tray, then the window is shown (it is created hidden to avoid a white flash and to
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

```
src/
  app/          App, router, BootstrapGate, ThemeController (+ appearance.ts), WindowBridge
    shell/      AppShell, TitleBar, PathBar, WindowControls, location context
    sidebar/    Sidebar, WorkspaceSwitcher, ProjectNav, ProfileMenu
  features/     one folder per area: workspace, project, library, create, settings, welcome
  components/   ui/ (presentation only, Radix primitives), NodeIcon, brand/BrandMark
  lib/          ipc (typed commands), queries (TanStack Query), routes, identity, motion, icons,
                i18n, mock/backend (browser preview only, loaded lazily)
  stores/       Zustand: session, ui, dialogs, toasts
  types/generated/  written by ts-rs, never edited by hand
```

Server state (the library) lives in TanStack Query and is invalidated after every mutation: the
database is local and answers in milliseconds, so re-reading beats hand-maintained caches.
Client state (session, sidebar, open dialogs, toasts) lives in small Zustand stores. Shared
dialogs are mounted once in the shell and opened from anywhere through `stores/dialogs`.

Addresses always carry the workspace (`/w/:workspace/p/:project/s/:subproject/n/:section`):
a shared project shows the breadcrumb and accent of the workspace it was reached from.
`lib/routes.ts` builds and parses them and is unit-tested.

## Rendering and materials

The window is `transparent`. On Windows 11 `window::apply_material` applies native **Mica** and
reports it at bootstrap; title bar and sidebar let it through with a thin tint, while the content
sits on a solid surface. Elsewhere (or if the system refuses the effect) the frontend paints solid
colors everywhere. All colors are CSS tokens in `src/styles/index.css`; the workspace accent is
`--ld-accent-base`, a registered property so it can transition when the workspace changes, and
light/dark variants are derived from it in OKLCH to keep contrast.
