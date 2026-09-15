# Releasing LlamaDesk

A release is one tag. The workflow in `.github/workflows/release.yml` builds the Windows
installers on a clean runner and publishes them as a **draft** GitHub Release, so nothing becomes
public until a human presses the button.

## Before the first public release (0.0.1)

- [ ] The redesign branch is merged into `main` (the tag must point at what people will read).
- [ ] `docs/CHECKLIST.md` walked through in the **installed** app, not the browser preview.
- [ ] `CHANGELOG.md` has a section for the version, and the "Known limitations" list is honest.
- [ ] The version is the same in three places (see below).
- [ ] A backup of your own database, in case the build you install replaces something.

## 1. Set the version

Semantic versioning; while below `0.1.0` the app is a beta and anything can change.

| File | Field |
| --- | --- |
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `[package] version` (and then `cargo check` to refresh `Cargo.lock`) |

```bash
npm run lint && npm run typecheck && npm run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
git commit -am "Versione 0.0.1"
```

## 2. Tag and push

```bash
git tag -a v0.0.1 -m "LlamaDesk 0.0.1 beta"
git push origin main --follow-tags
```

The workflow runs lint, typecheck, frontend tests and `cargo test` again, then builds:

- `LlamaDesk_0.0.1_x64-setup.exe` — NSIS, per-user install, no administrator rights
- `LlamaDesk_0.0.1_x64_en-US.msi` — MSI, for managed deployment

## 3. Finish the draft release

1. Paste the matching section of `CHANGELOG.md` as the release notes.
2. Say plainly that it is a beta, that the installer is **unsigned** (SmartScreen will warn), and
   where the data lives (`%APPDATA%\com.llamadesk.app`).
3. Add the checksums so people can verify what they downloaded:

   ```powershell
   Get-FileHash .\LlamaDesk_0.0.1_x64-setup.exe -Algorithm SHA256
   ```

4. Attach nothing else: no telemetry, no update feed, no "phone home" URL — there is none.
5. Publish, and mark it as a pre-release while the version is below `0.1.0`.

## 4. After publishing

- Install the artifact on a machine that never ran the development build: first launch must
  create an empty database and show the welcome screen.
- Open an issue for anything the checklist found, so the next beta has a list to work from.

## Signing (not done yet)

Windows SmartScreen will warn until the installers are signed with a code-signing certificate
(OV or EV). Until then the honest path is: publish the SHA-256 checksums, keep the build
reproducible from a public workflow, and tell people they can build it themselves with
`npm run build`. Signing needs a certificate in the repository secrets and
`tauri.conf.json → bundle.windows.certificateThumbprint`; when that happens, note it here.

## Updates

There is no auto-update, by design: the app never talks to the network. People update by
downloading a new installer, which keeps the database in place. Say so in every release note.
