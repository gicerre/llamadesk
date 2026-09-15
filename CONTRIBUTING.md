# Contributing to LlamaDesk

Thanks for being here. LlamaDesk is a small, opinionated application — contributions are very
welcome as long as they respect the constraints below.

## Non-negotiable rules

These are the reasons the project exists. A pull request that breaks any of them will be closed,
however good the code is.

1. **No network calls.** Ever. No HTTP client, no fonts from a CDN, no update check, no icon
   fetched at runtime. CI fails if a network crate appears in `src-tauri/Cargo.toml`.
2. **No telemetry**, no analytics, no crash reporting.
3. **No hardcoded user data.** The application starts empty. Example content belongs in the
   browser preview (`src/lib/mock/backend.ts`), never in the real database.
4. **No external integrations for calendars or accounts.** A calendar is a URL.
5. **Data lives in the user data folder** (`%APPDATA%\com.llamadesk.app`), never in the
   installation folder.
6. **Nothing happens without the user asking.** The clipboard is read only in response to the
   capture shortcut; paths are inspected only for what is on screen; programs are launched only
   through a detected or user-added tool, with separate arguments and never a shell string.

## Getting set up

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
npm install
npm run dev          # the real app
npm run dev:vite     # UI only, in a browser, with the example library
```

## Where things live

| I want to… | Go to |
| --- | --- |
| change a rule that must not be bypassable | `src-tauri/src/services/` (+ a `cargo test`) |
| add an API the UI can call | `src-tauri/src/commands/` and `src/lib/ipc.ts` |
| change what a page looks like | `src/features/<area>/` |
| add a shared control | `src/components/ui/` (presentation only) |
| change wording | `src/locales/{it,en}.json` |
| change the logo or icons | `src/components/brand/geometry.json`, then `npm run icons` |

The browser preview must keep working: if you add a command, add its mock in
`src/lib/mock/backend.ts`.

## Code standards

**TypeScript**

- `strict` mode, no `any`, no `@ts-ignore` without a comment explaining why.
- Components are small and single-purpose. No monolithic files.
- Never call `invoke()` outside `src/lib/ipc.ts`.
- Never hardcode a user-visible string — it goes in `src/locales/{it,en}.json`, and both files
  must stay in sync (a test enforces this).
- Data from the backend is read through TanStack Query (`src/lib/queries.ts`); after a change,
  invalidate rather than patching the cache by hand.

**Motion**

- Animate `transform` and `opacity` only, with the durations and curves in `src/lib/motion.ts`.
  No bouncing. Respect "reduce motion".

**Rust**

- `cargo fmt` and `cargo clippy --all-targets -- -D warnings` must be clean.
- Every schema change is a new numbered migration in `src-tauri/src/db/migrations/`. Never edit
  an existing migration — someone already has it applied.
- Anything that could damage user data, open the wrong URL or bypass the lock gets a unit test.
  Rules are tested through a real in-memory database (`db::testing`), not mocks.
- Types shared with the UI live in `src/domain/` with `#[ts(export)]`; `cargo test` regenerates
  `src/types/generated`, which must be committed.

**Comments and language**

- Code identifiers are in English; comments and user-visible text are in Italian, and English
  translations live in `src/locales/en.json`. Comments explain *why*, not *what*.
- Repository-facing documents (README, this file, SECURITY) are in English; the design record
  `docs/REDESIGN.md` and the manual checklist are in Italian.

## Commits and pull requests

- One logical change per pull request; describe the user-visible effect, with screenshots for UI
  changes (the browser preview is enough).
- Run the full gate before pushing:

```bash
npm run lint && npm run typecheck && npm run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

- If you touched anything a user can see, tick the matching line in `docs/CHECKLIST.md` after
  trying it in the installed app, or say in the PR that it is still untested there.

## Adding a language

1. Copy `src/locales/en.json` to `src/locales/<code>.json` and translate every value.
2. Register the language in `src/lib/i18n.ts`.
3. Add the tray labels in `src-tauri/src/tray.rs` — those are native menus and do not go
   through i18next.
4. Check the long strings: Italian and German are noticeably longer than English, and the
   sidebar and the palette footer are where that shows first.

## Reporting bugs and asking for features

Use the issue templates. For anything security-related, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.
