# Privacy and data

LlamaDesk is a local program. This page says exactly what it keeps, what it reads, and what it
never does — and where the limits are.

## What LlamaDesk never does

- **It never makes a network request.** There is no HTTP client among the Rust dependencies;
  `src-tauri/Cargo.lock` is the evidence, and a CI job fails the build if one is added.
- **No analytics, no crash reporting, no update checks.** Nothing is counted, nothing is sent.
- **No account, no sync, no server.** There is nothing to sign in to.
- **It does not watch anything in the background**: not the clipboard, not your files, not your
  windows.
- **It does not store credentials or tokens.** There is no field for them.
- **It does not embed a browser** for your links: every address is handed to Windows or to the
  browser you chose, with your own session and extensions.

## What it stores, and where

Everything lives in `%APPDATA%\com.llamadesk.app\`:

| File or folder | Contents |
| --- | --- |
| `llamadesk.db` | The library: workspaces, projects, sections, links, paths, tags, favorites, settings, the detected tools, launch steps, and the Argon2id hash of each profile's lock password |
| `backups\` | Copies of that database: one per day (last seven) plus the ones you make |
| `covers\` | Cover images you chose, copied here so they survive the original being moved |

The database also keeps a **history of what you opened** (item, action, tool, workspace, time),
used for "Continue", "Recent" and the ranking in the palette. It is per profile, pruned after 90
days, and never leaves the machine.

## What it reads on your computer, and when

| What | When | Why |
| --- | --- | --- |
| The clipboard | Only when you press the quick-capture shortcut | To pre-fill the address in the Add dialog |
| Paths on disk (existence, type, size, date, Git branch) | Only for the rows shown on screen, and on `F5` | To tell you whether a path is a file, a folder, a repository, or missing |
| Known installation folders | At startup in the background, and when you press "Search again" | To find terminals, IDEs and browsers |
| `Local State` / `profiles.ini` of your browsers | When you open the browser-profile list | To offer the profile names |
| An image you pick as a cover | When you choose it | It is copied into `covers\` |

Nothing else is read, and none of it is sent anywhere.

## What the lock protects — and what it does not

A profile can have a lock password (Argon2id, OWASP parameters, stored as a hash that never
leaves the Rust side). While a session is locked, the backend strips protected items of their
content before the interface sees them, keeps them out of search, recents and favorites, and
refuses every action on them.

**It is not encryption.** `llamadesk.db` is a plain SQLite file: anything running as your Windows
user can read it, and so can anyone with the file. The lock exists so that protected content does
not appear on a shared screen or open by accident. If you need encryption at rest, use BitLocker
or an encrypted volume. Backups are plain copies of the same file.

Two more honest limits:

- a profile without a password can set one and then unlock protected content — profiles are
  lenses of the same person, not separate users;
- "Forgot password?" removes the password *and* the protection from everything the profile sees,
  which is by design: without it, protected items would be unreachable forever.

## What LlamaDesk hands to Windows

- **Addresses**: only `http`, `https` and `mailto`. Anything else (`file:`, `javascript:`,
  `data:`, custom protocols) is refused before it reaches the system.
- **Files and folders**: opened with the program Windows associates with them — except
  executables and scripts, which "Open" always refuses.
- **Programs**: started only from a tool that was detected on disk or added deliberately, with
  arguments passed separately, never as a shell command line.

## Diagnostics

There is no log file and no telemetry. Errors are shown in the window when they happen. Two rare
startup problems (a pre-migration backup or a staged restore that could not be applied) are
printed on standard error, visible only if you run the executable from a terminal.

## Reporting a problem

Security issues go through a private advisory: see [SECURITY.md](../SECURITY.md). When reporting
an ordinary bug, remember that screenshots of LlamaDesk may contain client names and internal
URLs — replace them before posting.
