# Release process

A release is one tag. `.github/workflows/release.yml` builds the Windows installers on a clean
runner and publishes them as a **draft pre-release**, so nothing becomes public until someone
presses the button.

## How the workflow works

| | |
| --- | --- |
| Trigger | Pushing a tag that matches `v*`, or running the workflow by hand (`workflow_dispatch`), which asks for the tag as an input |
| Who can trigger it | Only someone who can create a `v*` tag — the `protected-release-tags` ruleset reserves that to repository admins |
| Runner | `windows-latest`, Node 20, Rust stable, cached Cargo target directory |
| Permissions | `contents: read` for the workflow, `contents: write` only on the job that publishes |
| Gates | Tag shaped `vX.Y.Z`, the same version in the three files below, then `npm run lint`, `npm run typecheck`, `npm run test` and `cargo test --locked` |
| Build | `tauri-apps/tauri-action` (pinned to a commit) with `--target x86_64-pc-windows-msvc` |
| Result | A GitHub Release named `LlamaDesk <tag>`, created as a **draft** and marked **pre-release**, with both installers and `SHA256SUMS.txt` attached |

Artifacts:

| File | Notes |
| --- | --- |
| `LlamaDesk_<version>_x64-setup.exe` | NSIS, per-user install, no administrator rights, English/Italian selector |
| `LlamaDesk_<version>_x64_en-US.msi` | MSI package for managed deployment |
| `SHA256SUMS.txt` | SHA-256 of both installers, computed by the workflow on the runner |

No updater artifacts are produced: the app never checks for updates.

## Before releasing

- [ ] The work is merged into `main` **through a pull request** (nobody pushes to `main`
      directly; see [`.github/rulesets/`](../.github/rulesets/README.md)) — the tag must point at
      what people will read.
- [ ] [`CHECKLIST.md`](CHECKLIST.md) walked through in the **installed** app, not the browser
      preview.
- [ ] [`CHANGELOG.md`](../CHANGELOG.md) has a section for the version, with an honest
      "known limitations" list.
- [ ] The version is the same in the three files below.
- [ ] You have a backup of your own database, in case you install the build over it.

## 1. Set the version

Semantic versioning; while below `0.1.0` the app is a beta and anything can change.

| File | Field |
| --- | --- |
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` (this is what names the installers) |
| `src-tauri/Cargo.toml` | `[package] version` — then run `cargo check` so `Cargo.lock` follows |

```bash
npm run lint && npm run typecheck && npm run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
git commit -am "Version 0.0.1"
```

## 2. Tag and push

```bash
git checkout main && git pull
git tag -a v0.0.1 -m "LlamaDesk 0.0.1 beta"
git push origin v0.0.1
```

Only a repository admin can push a `v*` tag. Pushing it starts the workflow; nothing else does.

## 3. Finish the draft

1. Paste the matching section of `CHANGELOG.md` as the release notes.
2. Say plainly that it is a beta, that the installers are **unsigned** (SmartScreen will warn),
   and where the data lives (`%APPDATA%\com.llamadesk.app`).
3. The checksums are already attached as `SHA256SUMS.txt`. Verify one against the file you
   downloaded before publishing:

   ```powershell
   Get-FileHash .\LlamaDesk_0.0.1_x64-setup.exe -Algorithm SHA256
   ```

4. Keep **pre-release** ticked while the version is below `0.1.0`.
5. Publish.

## 4. After publishing

- Install the artifact on a machine that never ran a development build: the first launch must
  create an empty database and show the welcome screen.
- Open an issue for anything the checklist found, so the next beta starts with a list.

## Signing

Not done yet. Until a code-signing certificate is configured
(`bundle.windows.certificateThumbprint` plus the certificate in the repository secrets), the
honest path is: publish SHA-256 checksums, keep the build reproducible from the public workflow,
and tell people they can build it themselves ([BUILD.md](BUILD.md)).

## Updates

There is no auto-update, by design: the app never talks to the network. People update by
downloading a newer installer, which keeps the database in place. Repeat that in every release
note.
