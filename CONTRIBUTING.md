# Contributing to LlamaDesk

Thanks for being here. LlamaDesk is a small, opinionated application — contributions are very
welcome as long as they respect the constraints below.

## Non-negotiable rules

These are the reasons the project exists. A pull request that breaks any of them will be closed,
however good the code is.

1. **No network calls.** Ever. No HTTP client, no fonts from a CDN, no update check, no icon
   fetched at runtime.
2. **No telemetry**, no analytics, no crash reporting.
3. **No hardcoded user data.** The application starts empty. Example content belongs in an
   importable template file, never in the source.
4. **No external integrations for calendars or accounts.** A calendar is a URL.
5. **Data lives in the user data folder**, never in the installation folder.

## Getting set up

```powershell
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
npm install
npm run dev
```

## Code standards

**TypeScript**

- `strict` mode, no `any`, no `@ts-ignore` without a comment explaining why.
- Components are small and single-purpose. No monolithic files.
- Domain logic lives in `src/features/<feature>/`; `src/components/ui/` holds presentation only.
- Never call `invoke()` outside `src/lib/ipc.ts`.
- Never hardcode a user-visible string — it goes in `src/locales/{en,it}.json`, and both files
  must stay in sync (a test enforces this).

**Motion**

- Physical interactions use springs from `src/lib/motion.ts`. Tweens are allowed only for
  opacity and colour.
- Animate `transform` and `opacity` only. Never animate `width`, `height`, `top` or `margin`
  unless you are using Framer Motion's `layout` prop.

**Rust**

- `cargo fmt` and `cargo clippy --all-targets -- -D warnings` must be clean.
- Every schema change is a new numbered migration in `src-tauri/src/db/migrations/`. Never edit
  an existing migration — someone already has it applied.
- Anything that could damage user data or open the wrong URL gets a unit test.

## Commits and pull requests

- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- One logical change per pull request.
- Describe the user-visible effect, not just the diff. Screenshots for UI changes.
- Run the full gate before pushing:

```bash
npm run lint && npm run typecheck && npm run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Adding a language

1. Copy `src/locales/en.json` to `src/locales/<code>.json` and translate every value.
2. Register the language in `src/lib/i18n.ts` (`SUPPORTED_LANGUAGES`).
3. Add the tray labels in `src-tauri/src/tray.rs` — those are native menus and do not go
   through i18next.
