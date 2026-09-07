# Security Policy

## Threat model in one paragraph

LlamaDesk is a single-user desktop application with no server, no account and no network
communication. The realistic attack surface is therefore local: the contents of the SQLite
database, the URLs the application hands to the operating system, and the integrity of the
installer you downloaded.

## What LlamaDesk does **not** do

- It never makes a network request. There is no HTTP client in the Rust dependency tree, and a
  CI job fails the build if one is introduced.
- It does not collect analytics, crash reports or usage statistics.
- It does not store credentials, tokens or passwords — there is no field to put them in, and the
  JSON export therefore cannot leak them.
- It does not embed a browser for your links: every URL is handed to the operating system, which
  opens it in your default browser with your own session and extensions.

## Hardening already in place

- **URL scheme allow-list.** Only `http`, `https` and `mailto` are ever opened. `file:`,
  `javascript:`, `data:` and custom protocols are rejected in Rust before reaching the OS.
- **Strict Content-Security-Policy.** `connect-src` is limited to the local IPC channel, so even
  a compromised frontend dependency cannot exfiltrate data.
- **Minimal Tauri capabilities.** The frontend has no permission to open URLs, read files or
  register shortcuts directly — all of it goes through audited Rust commands.
- **Transactional migrations with a pre-migration backup**, so an interrupted upgrade cannot
  corrupt your data. The same applies before a backup import that replaces your data.
- **The clipboard is read only on demand.** Quick capture reads it exactly once, in response to
  the shortcut you pressed, in Rust. Nothing watches the clipboard in the background, and what it
  contains is never stored unless you save the link.
- **Wallpapers are copied, not linked.** An imported image is copied into the app data folder and
  served through Tauri's asset protocol, whose scope is limited to that folder alone.

## The database is not encrypted

`%APPDATA%\com.llamadesk.app\llamadesk.db` is a plain SQLite file, readable by anything running
as your Windows user. That is a deliberate trade-off: it keeps the app plug & play and your data
portable. Do not store secrets in link URLs or notes. If you need encryption at rest, use
Windows BitLocker or an encrypted volume.

## Reporting a vulnerability

Please open a [security advisory](../../security/advisories/new) rather than a public issue.
Include the version, your Windows build, and reproduction steps. Expect an initial response
within seven days.
