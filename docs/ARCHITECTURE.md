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
  features/     one folder per area: workspace, project, library, create, actions, launch,
                palette, protection, inspector, resources, settings, welcome
  components/   ui/ (presentation only, Radix primitives), NodeIcon, Cover, brand/
  lib/          ipc (typed commands), queries (TanStack Query), routes, identity, motion, icons,
                fuzzy, focusNavigation, viewport, accelerators, pickers,
                mock/backend (browser preview only, loaded lazily)
  stores/       Zustand: session, ui, dialogs, toasts, palette, lock, opener
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

## Actions and tools

`services::tools` finds terminals, IDEs and browsers by looking at known installation paths
(plus the JetBrains and Visual Studio folders) and reads browser profiles from `Local State`
and `profiles.ini`. Nothing is executed during detection, and the search roots come from a
`Roots` struct so the whole catalogue is testable against a fake folder tree. A tool that
disappears keeps its row (`detected_at` goes NULL) so preferences survive a reinstall.

`services::actions` turns a request into a **plan**: a list of steps (open a URL, open a path,
reveal it, or spawn a program with separate arguments) plus the confirmation level and the tool
that will be used. Planning is pure and unit-tested; only the command executes the steps, on a
blocking thread, with the configured stagger between browser tabs. The same planner serves the
row click, the context menu, the palette and Launch, so the rules cannot diverge: visibility in
the profile, the lock, the confirmation barrier, `http`/`https`/`mailto` only, existing paths,
never an executable, and a tool that is actually installed.

`services::launch` composes those plans into a sequence for a project, subproject or section.
A step that cannot be planned (missing path, uninstalled tool) does not stop the others; the
outcome lists it.

## Search

`services::search` reads the visible library on every query (a personal library is a few
thousand rows) and scores each node: fields with different weights (name, aliases, tags, names
of ancestors, address or path, description), then usage and recency, then a small bonus for the
current workspace. Case and accents are folded one character at a time, so the highlight ranges
it returns still point at the original name. The last word can be a **verb** (`term`, `ide`,
`esplora`, or a tool name), in which case the hit carries the action to run — on a container,
its first path. About 30 ms per query over 3,400 nodes in release mode.

## Protection

A per-profile password is stored as an Argon2id hash by `services::protection`; the unlocked
state lives in memory only (`LockBook` in `AppState`), so a restart locks everything. Every
command that reads or writes a node passes through a `Gate`: while locked, a protected node — by
its own flag or through **any** of its paths — comes back without content and every action on it
is refused with `locked`. Search, favorites and recents filter them out, and the frontend never
has to remember to hide anything.

## Backups and covers

`services::backup` makes a consistent copy with SQLite's `VACUUM INTO` (one per calendar day at
startup, last seven kept, plus manual copies). A restore validates the candidate file, stages it
next to the database and applies it at the next launch, before the connection is opened, keeping
the previous file as `llamadesk.before-restore.db`.

`services::assets` copies cover images into `<data>/covers/<sha256>.<ext>`, recognising the type
from the first bytes; identical images are stored once and files nobody references are deleted.
They are served through Tauri's asset protocol, scoped to that folder alone.

## Window and first frame

The window is created hidden. The frontend calls `window_ready` after its first painted frame and
Rust reveals the window then (a background thread reveals it anyway after three seconds, in case
the frontend never answers). The opening animation runs on top of the already-loaded shell, only
on a cold start, and never when the app starts in the tray or the system asks for reduced motion.
