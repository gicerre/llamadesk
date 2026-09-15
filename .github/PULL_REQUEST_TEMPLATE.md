# What this changes

<!-- The user-visible effect, in one or two sentences. Screenshots for UI changes: the browser
     preview (`npm run dev:vite`) is enough. -->

## Why

<!-- The problem it solves. Link the issue if there is one. -->

## Checks

- [ ] `npm run lint && npm run typecheck && npm run test`
- [ ] `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
- [ ] Generated types (`src/types/generated`) committed, if `domain` changed
- [ ] Both `src/locales/it.json` and `src/locales/en.json` updated, if wording changed
- [ ] The browser preview still works (mock added for any new command)
- [ ] Tried in the installed app, or said below what is still untested there

## The rules

- [ ] No network calls, no telemetry, no account, no hardcoded user data
- [ ] Nothing new reads the clipboard, the file system or starts a program without the user asking
- [ ] Schema changes are a **new** migration; existing ones are untouched
