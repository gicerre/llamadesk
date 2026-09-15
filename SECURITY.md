# Security Policy

## Supported versions

LlamaDesk is in beta: only the latest release receives fixes. There is no auto-update — the app
never contacts the network — so please install new versions yourself from
[Releases](../../releases).

## Threat model in one paragraph

LlamaDesk is a single-user desktop application with no server, no account and no network
communication. The realistic attack surface is therefore local: the contents of the SQLite
database, the URLs and programs the application hands to the operating system, and the integrity
of the installer you downloaded.

## What LlamaDesk does **not** do

- It never makes a network request. There is no HTTP client in the Rust dependency tree, and a
  CI job fails the build if one is introduced.
- It does not collect analytics, crash reports or usage statistics.
- It does not store credentials or tokens — there is no field to put them in.
- It does not embed a browser for your links: every URL is handed to the operating system or to
  the browser you chose, with your own session and extensions.
- It does not watch your clipboard, your file system or your window titles in the background.

## Hardening already in place

- **URL scheme allow-list.** Only `http`, `https` and `mailto` are ever opened. `file:`,
  `javascript:`, `data:` and custom protocols are rejected in Rust before reaching the OS.
- **Executables are never launched by "Open".** `.exe`, `.bat`, `.cmd`, `.ps1`, `.lnk`, `.msi`
  and friends are refused; you can still reveal them in File Explorer.
- **Programs start with separate arguments, never a shell string**, and only from a tool that
  was detected on disk or added deliberately in Settings.
- **Strict Content-Security-Policy.** `connect-src` is limited to the local IPC channel, so even
  a compromised frontend dependency cannot exfiltrate data. The `asset:` protocol is scoped to
  the covers folder alone.
- **Minimal Tauri capabilities.** The frontend cannot open URLs, run programs, read the
  clipboard or register shortcuts directly — all of it goes through audited Rust commands.
- **The lock.** A per-profile password is stored as an Argon2id hash (OWASP parameters) and never
  leaves Rust. While a session is locked, protected items are stripped of their content before
  they reach the UI and every action on them is refused; three wrong attempts start a growing
  wait. The unlocked state lives only in memory, so restarting locks everything.
- **Transactional migrations with a pre-migration backup**, plus a daily automatic backup. A
  restore verifies the file (SQLite integrity, schema version, expected tables) and keeps the
  previous database as `llamadesk.before-restore.db`.
- **The clipboard is read only on demand.** Quick capture reads it exactly once, in response to
  the shortcut you pressed, in Rust. Nothing is stored unless you save the link.
- **Cover images are copied, not linked**, into the app data folder, and served through Tauri's
  asset protocol with a scope limited to that folder.

## The database is not encrypted

`%APPDATA%\com.llamadesk.app\llamadesk.db` is a plain SQLite file, readable by anything running
as your Windows user. That is a deliberate trade-off: it keeps the app plug & play and your data
portable. **The lock is a privacy lock, not encryption**: it prevents protected content from
appearing on screen or opening by accident, and the interface says so. Backups are plain copies
of the same file. Do not store secrets in URLs, notes or names. If you need encryption at rest,
use Windows BitLocker or an encrypted volume.

## Unsigned installers

Beta installers are not signed with a code-signing certificate, so Windows SmartScreen shows a
warning. Verify the checksum published with the release, or build from source
(`npm run build`) if you prefer.

## Reporting a vulnerability

Please open a [security advisory](../../security/advisories/new) rather than a public issue.
Include the version, your Windows build, and reproduction steps. Expect an initial response
within seven days.

Things we consider valid reports: bypassing the lock or the confirmation from outside the UI,
making LlamaDesk launch an arbitrary program or open a blocked scheme, escaping the asset scope,
or getting data out of the machine in any way at all.
