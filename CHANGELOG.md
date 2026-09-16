# Changelog

All notable changes to LlamaDesk are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/); while the version stays below `0.1.0`, anything can
still change.

## [Unreleased]

Nothing yet.

## [0.0.1] — first public beta

The whole application was redesigned around a single idea: a **workspace launcher**, where
things are grouped by project and opened with the right tool. The design record for this work is
[`docs/REDESIGN.md`](docs/REDESIGN.md) (Italian).

Everything below is new compared to the internal 1.x prototype (tag `legacy-v1`), whose data
model and interface were replaced entirely.

### Library

- **Workspace → Project → Subproject → Sections**, nestable without limit. Sections replace the
  old fixed "environment" level: DEV, TEST and PROD are ordinary sections you create.
- **Shared projects**: the same project can live in several workspaces — one project, not a copy.
- Links, link groups and local paths, added by pasting an address, several addresses, a path, or
  by dragging files from File Explorer.
- Path rows show what the disk says now: file, folder, Git repository with branch, missing, or
  unreachable network share.
- Drag & drop reordering and moving, `Alt+↑/↓` from the keyboard, deletion with an impact summary
  and **Undo**, duplication of whole subtrees, tags, favorites, recents.
- **Profiles are lenses on one library**: each profile chooses which workspaces it sees and keeps
  its own favorites, recents and appearance.

### Opening things

- **Tool detection** on this computer: Windows Terminal, PowerShell 7, Windows PowerShell, CMD,
  Git Bash, WSL, VS Code, Cursor, Zed, Sublime Text, Notepad++, JetBrains IDEs, Visual Studio,
  Chrome, Edge, Firefox, Brave — with browser profiles. Tools can be hidden or added by hand.
- **Preferred tool per profile and per node**, inherited downwards.
- Actions: open, open with a chosen tool, terminal here, show in File Explorer, open the remote
  repository. Row click, context menu, hover buttons, palette and Launch all go through the same
  registry in Rust.
- **Link groups** open in one go, staggered, optionally in a chosen browser, profile and window.
- **Launch**: a project, subproject or section can define a sequence of actions and run it with
  one button.
- **Quick capture**: a global shortcut turns the address in your clipboard into a new link.

### Finding things

- **Command palette** (`Ctrl+K`, or a global shortcut that brings the window forward): fuzzy
  search over names, aliases, tags, parent names, addresses and paths, ranked by how often and
  how recently you open things.
- **Object + verb**: `camunda term` opens a terminal in Camunda's repository; `back cursor` opens
  that repository in Cursor.
- `>` for app commands, `@` for containers, `#tag` to filter; `Tab` lists every action of the
  selected item, `Ctrl+Enter` goes to where it lives.

### Safety

- **Ask before opening**, inheritable and overridable, with a "type the name" level. Enforced in
  Rust, so it applies to every entry point.
- **Protection**: a per-profile lock password (Argon2id). While locked, protected items keep only
  their name, disappear from search, recents and favorites, and every action on them is refused.
  Locks on `Ctrl+L`, on closing to the tray, when switching profile, and after a configurable
  idle time.
- `.exe`, `.bat`, `.ps1` and similar files are never launched by "Open"; programs start with
  separate arguments, never through a shell.

### Data

- **Backups**: one automatic copy per day (last seven kept), manual copies anywhere, and a
  restore that verifies the file and keeps the previous database next to it.
- Everything stays in `%APPDATA%\com.llamadesk.app`: database, backups, cover images.

### Interface

- Windows-native feel: custom title bar, Mica on Windows 11, light/dark/system themes, two
  densities, an accent colour per workspace.
- Cover images for workspaces and projects, with a focal point; 104 icons with search. Workspaces
  and projects without an image get a cover built from their own colour.
- Opening animation of the "L-neck" llama, and a window that appears only once the first frame is
  painted — no white flash. On the very first launch the animation runs slower, so it can be seen.
- **First launch**: profile (name, avatar, colour and language, English by default), an optional
  one-minute tour of five screens, and the first workspace with its icon, colour and cover. It is
  shown once, and the workspace it creates is a real workspace.
- Profiles have an avatar: an icon of your choice, or the initials of the name.
- Italian and English, keyboard navigation with arrows between rows, and a skip link.

### Known limitations

- Windows 11 Snap Layouts do not appear on the custom maximize button (`Win+Z` works).
- Installers are unsigned, so SmartScreen warns on first run.
- Cover images are not included in backups (they live next to the database).
- The lock is a privacy lock: the database itself is not encrypted.

[Unreleased]: ../../compare/v0.0.1...HEAD
[0.0.1]: ../../releases/tag/v0.0.1
