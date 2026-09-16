# Architecture

## Layers

```
React 19 (TypeScript)  ──invoke()──▶  Tauri commands (Rust)  ──▶  SQLite (bundled)
        │                                      │
        └── src/lib/ipc.ts                     └── src/commands/ — the whole API surface
            the only file that                     71 commands, no SQL ever
            talks to the backend                   reaches the frontend
```

The frontend never issues SQL. Everything goes through typed commands, which means:

- the rules that must not be bypassable (nesting, inheritance of protection and confirmation,
  tool resolution, URL validation, the lock) are unit-testable with `cargo test`;
- a compromised npm dependency cannot reach the database;
- the TypeScript types in `src/types/generated` are generated from the serde structs in
  `src-tauri/src/domain` by `ts-rs` during `cargo test`, so they cannot drift.

Inside Rust: `commands/` orchestrates and applies the lock, `db/repo/` talks to SQLite, and
`services/` holds the rules. Multi-row writes go through `db::atomic`, a SAVEPOINT that composes
inside an outer transaction.

## Startup sequence

1. `tauri_plugin_single_instance` — a second launch focuses the running window instead of opening
   a second process on the same database file.
2. `db::initialize` — applies a staged restore if one is pending, resolves
   `%APPDATA%\com.llamadesk.app\`, opens `llamadesk.db` and sets `journal_mode=WAL`,
   `foreign_keys=ON`, `synchronous=NORMAL` and a 5 s busy timeout.
3. `migrator::run` — reads `PRAGMA user_version`, copies a populated database aside, then applies
   each pending migration inside its own transaction.
4. `seed::ensure_seed` — only if `profiles` is empty: one profile named from the system locale,
   default settings and `firstRun = true`. No workspaces, no projects, no links.
5. Maintenance — the trash is emptied (undo lasts one session), usage events older than 90 days
   are forgotten, unreferenced cover images are deleted, and the daily backup is taken.
6. Window material (Mica or solid) is decided, then the state is shared with `app.manage`.
7. Tool detection runs on a background thread and updates the `tools` table when it finishes.
8. Global shortcuts are registered — **failure here is not fatal**; the status is stored and shown
   in Settings.
9. The tray menu is built. The window stays hidden until the frontend says it painted its first
   frame (`window_ready`), with a three-second fallback.

## Services

| Service | Responsibility |
| --- | --- |
| `hierarchy` | Create, move, share, unshare, delete with undo, duplicate subtrees; enforces `allowed_children` and forbids cycles |
| `resolve` | Inheritance: protection (protected if *any* path to the root is protected), confirmation (nearest wins, strictest on a tie), breadcrumbs and tool preference along the workspace you came from |
| `ordering` | Fractional ordering (`OrderedList`) shared by children, a profile's workspaces and launch steps |
| `tools` | Detection of terminals, IDEs and browsers from known installation paths; browser profiles from `Local State` / `profiles.ini`; custom tools; command building with separate arguments |
| `actions` | Turns a request into a plan (open URL, open path, reveal, spawn) plus the confirmation level and the tool; blocks executables, validates URLs, resolves the tool |
| `launch` | Composes those plans into an ordered sequence for a container; a failing step does not stop the others |
| `search` | Scores the visible library per query: weighted fields, usage, recency, current workspace; object + verb parsing |
| `protection` | Argon2id password per profile, in-memory session state, retry delays, and the `Gate` every command passes through |
| `backup` | `VACUUM INTO` copies, daily rotation, validation and staged restore |
| `assets` | Cover images: type sniffing, deduplication by SHA-256, garbage collection |
| `paths` | What a path is right now (file, folder, repository with branch, missing, unreachable) with a 1.5 s timeout, and `%VARIABLE%` expansion |
| `opener` | URL scheme allow-list (`http`, `https`, `mailto`) |

### How an action is executed

Planning is pure and testable; only the command executes. A plan carries its steps, the
confirmation level (the strictest among the item and, for a group, its enabled links) and the
tool that will be used. The command checks the lock, checks the confirmation, then runs the steps
on a blocking thread: URLs and paths through `tauri-plugin-opener`, programs through
`std::process::Command` with separate arguments — never a shell string — using
`CREATE_NEW_CONSOLE` for terminals and `CREATE_NO_WINDOW` for the `cmd /c` wrapper that starts
`.cmd` launchers.

### How the lock works

`LockBook` lives in `AppState` and only in memory, so a restart locks everything. Every command
that reads or writes a node builds a `Gate`: while locked, a node protected by its own flag or
through **any** of its paths comes back without content (no URL, path, description, children or
tags) and every action on it is refused with `locked`. Search, favorites and recents filter them
out, so the interface has nothing to remember.

## Windows integration

| Concern | Approach |
| --- | --- |
| Title bar | `decorations: false` plus a custom bar; dragging uses `data-tauri-drag-region`. Snap Layouts on the maximize button are not supported yet |
| Window material | `window::apply_material` applies native **Mica** on Windows 11 (build ≥ 22000) and reports `mica` or `solid` at bootstrap |
| First frame | The window is created hidden and revealed by `window_ready`, with a background fallback after three seconds |
| Closing | `CloseRequested` becomes `hide()` when *Close to tray* is on, and locks every session |
| Global shortcuts | `tauri-plugin-global-shortcut`; a failed registration is reported, never fatal |
| Opening URLs and paths | `tauri-plugin-opener` (`ShellExecute`), after the scheme allow-list |
| Starting programs | `std::process::Command` with creation flags, from detected or user-added tools only |
| Tray | Open, Quick search, Settings, Quit — native menu, labels in Italian or English |
| Autostart | `tauri-plugin-autostart` with `--minimized`, off by default |
| Window state | `tauri-plugin-window-state` restores position and size |
| Drag & drop from Explorer | `dragDropEnabled` plus `onDragDropEvent`, turned into path rows |

## Frontend structure

```
src/
  app/          App, router, BootstrapGate, ThemeController, WindowBridge, Opener
    shell/      AppShell, TitleBar, PathBar, WindowControls
    sidebar/    Sidebar, WorkspaceSwitcher, ProjectNav, ProfileMenu
  features/     actions, create, inspector, launch, library, onboarding, palette,
                project, protection, resources, settings, workspace
  components/   ui/ (Radix primitives, presentation only), NodeIcon, Cover, brand/
  lib/          ipc, queries, routes, motion, fuzzy, focusNavigation, viewport,
                accelerators, icons, identity, pickers, i18n, mock/backend
  stores/       Zustand: session, ui, dialogs, toasts, palette, lock, opener
  types/generated/  written by ts-rs, never edited by hand
```

Server state (the library) lives in TanStack Query and is invalidated after every mutation: the
database is local and answers in milliseconds, so re-reading beats hand-maintained caches. Client
state (session, sidebar, dialogs, toasts, palette, lock, opener) lives in small Zustand stores.
Shared dialogs are mounted once in the shell and opened from anywhere.

Addresses always carry the workspace (`/w/:workspace/p/:project/s/:subproject/n/:section`): a
shared project shows the breadcrumb and the accent of the workspace it was reached from.
`lib/routes.ts` builds and parses them and is unit-tested.

Errors from Rust arrive as plain strings and are shown as toasts, except two codes the frontend
recognises: `confirmation_required` (show the confirmation dialog) and `locked` (open the unlock
dialog).

## Rendering and materials

The window is `transparent`. On Windows 11 the title bar and the sidebar let Mica through with a
thin tint, while the content sits on a solid surface; elsewhere the frontend paints solid colours
everywhere. All colours are CSS tokens in `src/styles/index.css`; the workspace accent is
`--ld-accent-base`, a registered property so it can transition when the workspace changes, and
light/dark variants are derived from it in OKLCH to keep contrast.

Motion is limited to `transform` and `opacity`, with the durations in `src/lib/motion.ts`, and is
skipped when the system asks for reduced motion. The opening animation (`app/Opener.tsx`) draws
the symbol part by part over the already-loaded shell and only on a cold start.

## Data

See [DATA_MODEL.md](DATA_MODEL.md) for the schema: one `nodes` table with an `edges` adjacency
list, nesting rules as data, fractional ordering on the edge, and per-profile views of a shared
library.
