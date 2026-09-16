# Development

LlamaDesk is a [Tauri 2](https://tauri.app) application: a React 19 interface in a WebView2
window, a Rust backend, and a bundled SQLite database. Everything that must not be bypassable
lives in Rust.

## Environment

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ | CI uses 20 |
| Rust | stable | Installed with `rustup`; `cargo fmt` and `clippy` are required |
| MSVC build tools | 2022 | Rust needs them to link on Windows |
| WebView2 | — | Present on Windows 11 and updated Windows 10 |

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
npm install
```

## Commands

Every command below exists in `package.json`.

| Command | What it does |
| --- | --- |
| `npm run dev` | The real application: Vite on port 1420 plus the Rust backend, hot reload on both sides |
| `npm run dev:vite` | The interface alone in a browser, against an in-memory mock backend |
| `npm run build` | Builds the installers (NSIS and MSI) — see [BUILD.md](BUILD.md) |
| `npm run build:vite` | Builds the frontend only into `dist/` |
| `npm run typecheck` | `tsc --noEmit`, strict mode |
| `npm run lint` / `lint:fix` | ESLint (TypeScript, React hooks, React refresh) |
| `npm run format` / `format:check` | Prettier, with the Tailwind class sorter |
| `npm run test` | Vitest **and** the SQL checker |
| `npm run test:watch` | Vitest in watch mode |
| `npm run check:sql` | Runs every SQL string in the Rust sources against the real schema with sql.js |
| `npm run icons` | Regenerates icons and brand SVGs from `src/components/brand/geometry.json` |
| `cargo test` (in `src-tauri`) | Rust tests; also regenerates `src/types/generated` |
| `cargo clippy --all-targets -- -D warnings` | Lint, warnings are errors |
| `cargo fmt --check` | Formatting |

The browser preview accepts `?vuoto` (empty library), `?lingua=en|it`, `?tema=scuro|chiaro`, and
its lock password is `llama`. It is the fastest way to work on the interface; it is not a
substitute for testing in the app, because tools, paths, the clipboard and backups only exist
there.

## Repository layout

```
src/                          React 19 + TypeScript + Tailwind 4 + Framer Motion
├─ app/                       shell: App, router, BootstrapGate, ThemeController, WindowBridge,
│  │                          Opener (the startup animation)
│  ├─ shell/                  AppShell, TitleBar, PathBar, WindowControls
│  └─ sidebar/                Sidebar, WorkspaceSwitcher, ProjectNav, ProfileMenu
├─ components/                NodeIcon, Cover, brand/, ui/ (Button, Dialog, Menu, fields…)
├─ features/
│  ├─ actions/                action registry, run(), context menu, confirmation dialog
│  ├─ create/                 Add dialog, shared dialogs host
│  ├─ inspector/              details panel and its sections
│  ├─ launch/                 Launch button, steps editor
│  ├─ library/                favorites, recents, node menu, shared page parts
│  ├─ palette/                command palette and app commands
│  ├─ project/                project page, section page, scope content (drag & drop)
│  ├─ protection/             unlock form, lock dialogs, lock bridge
│  ├─ resources/             resource rows, file glyphs, drop from Explorer
│  ├─ settings/               settings page and its groups
│  ├─ onboarding/             first run: profile, tour, first workspace
│  └─ workspace/              workspace home, root redirect
├─ lib/                       ipc, queries, routes, motion, fuzzy, focusNavigation, viewport,
│                             accelerators, icons, identity, pickers, i18n, mock/backend
├─ locales/                   it.json, en.json (+ a test that keeps them in sync)
├─ stores/                    Zustand: session, ui, dialogs, toasts, palette, lock, opener
└─ types/generated/           written by ts-rs, never edited by hand

src-tauri/
├─ src/commands/              the 71 Tauri commands the UI can call
├─ src/db/                    connection, migrations, repositories (nodes, workspaces,
│                             profiles, library)
├─ src/domain/                serde structs shared with the frontend (ts-rs exports)
├─ src/services/              the rules: hierarchy, resolve, ordering, actions, tools, launch,
│                             search, protection, backup, assets, paths, opener
├─ src/{tray,shortcuts,window}.rs   Windows integration
└─ migrations/                0003_schema_v2.sql (the current schema)

scripts/                      brand.mjs (icons and SVGs), check-sql.mjs (SQL validation)
docs/                         this documentation
```

## How a feature flows through the code

Opening a link, end to end:

1. `ScopeContent` renders a `ResourceRow`; a click calls `runAction()` in
   `features/actions/run.ts`.
2. `run.ts` calls `api.executeAction()` in `lib/ipc.ts` — the only file that talks to the
   backend — which invokes the Tauri command `execute_action`.
3. `commands/actions.rs` checks the lock (`Gate`), then asks `services::actions::plan()` for a
   plan: the steps, the confirmation level, the tool.
4. If the item asks for confirmation, the command answers `confirmation_required`; the frontend
   fetches the plan with `prepare_action` and shows the dialog, then repeats the call with the
   confirmation.
5. The steps run on a blocking thread (`tauri_plugin_opener` for URLs and paths,
   `std::process::Command` with separate arguments for programs).
6. The use is recorded, the frontend invalidates the `recents` queries and shows a toast.

The same planner serves the context menu, the palette and Launch, so rules cannot diverge.

## Conventions

- **The frontend never writes SQL.** `src/lib/ipc.ts` is the only place that calls `invoke`; add
  a command there with its argument and result types.
- **Types are generated.** Structs in `src-tauri/src/domain` carry `#[ts(export)]`; `cargo test`
  writes `src/types/generated`, which must be committed (CI checks it).
- **Server state lives in TanStack Query** (`src/lib/queries.ts`) and is invalidated after a
  mutation; client state lives in small Zustand stores.
- **Strings are translated.** No user-visible text in components: add the key to both
  `src/locales/it.json` and `src/locales/en.json` (a test fails if they diverge).
- **Comments are in Italian and explain why**, identifiers are in English.
- **Migrations are append-only.** Add a new file in `src-tauri/src/db/migrations/` and register
  it in `migrator.rs`; never edit one that shipped.
- **Every new command must also exist in the mock** (`src/lib/mock/backend.ts`), or the browser
  preview breaks.

## Tests

| Suite | Where | What it covers |
| --- | --- | --- |
| Rust, 127 tests | next to each module in `src-tauri/src` | hierarchy and sharing rules, inheritance of protection and confirmation, ordering, action planning, blocked executables, tool detection against a fake folder tree, search and ranking, lock and retry delays, backups and restore validation, cover deduplication, migrations |
| Frontend, 45 tests | `src/lib/*.test.ts`, `src/features/actions/registry.test.ts`, `src/locales/locales.test.ts` | routes, fuzzy matching, accelerators, spatial focus navigation, resource parsing, action registry, locale parity |
| SQL check | `scripts/check-sql.mjs` | every SQL string in the Rust sources is prepared against the real schema with sql.js |

Rust tests run against a real in-memory SQLite database (`db::testing`), not mocks.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull request:

- **frontend** (Ubuntu): `lint`, `typecheck`, `format:check`, `test`, `build:vite`, `check:sql`;
- **backend** (Windows): `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --locked`,
  then `git diff --exit-code -- src/types/generated` to catch uncommitted generated types;
- **privacy-guard** (Ubuntu): fails if a network crate appears in `src-tauri/Cargo.toml`.

## Backend commands without an interface

These commands exist and are tested, but nothing in the UI calls them yet: `archive_node`,
`duplicate_node`, `reorder_workspace`, `workspace_profiles`. They are kept because the rules
behind them (archiving, copying a subtree with its launch steps, ordering a profile's workspaces)
are already implemented.

## Next steps

See the roadmap in [docs/README.md](README.md#roadmap-and-open-points) and the manual checklist in
[CHECKLIST.md](CHECKLIST.md).
