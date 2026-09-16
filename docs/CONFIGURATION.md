# Configuration

Everything is configured inside the app: there is no configuration file to edit, no environment
variable and no command-line flag other than `--minimized`.

Open **Settings** with `Ctrl+,`, from the profile menu, or from the tray icon.

![Settings: tools, data and backups](assets/screenshots/settings-tools.jpg)

## Appearance

| Setting | Values | Notes |
| --- | --- | --- |
| Theme | System, Light, Dark | The window frame follows the app, not the system, when you force one |
| Language | Italiano, English | Chosen from your Windows language on first run |
| Density | Comfortable, Compact | Compact fits more rows in the same window |

The accent colour is not a setting: it is the colour of the workspace you are in.

## General

| Setting | Default | What it does |
| --- | --- | --- |
| Start with Windows | Off | Starts LlamaDesk at sign-in, in the notification area |
| Start minimized | Off | The window stays hidden until you open it |
| Close to the notification area | On | The X hides the window; quit from the tray menu |
| Opening animation | On | Plays only on a cold start, never when the window returns from the tray |

## Profiles

Rename a profile, give it a colour, choose **which workspaces it sees**, or delete it (the dialog
says which workspaces would go with it and which stay because another profile sees them). The
last visible workspace of a profile cannot be hidden.

## Shortcuts

Two shortcuts are global — they work while you are in another application:

| Shortcut | Default | What it does |
| --- | --- | --- |
| Search from any app | `Ctrl+Alt+Space` | Brings LlamaDesk forward with the palette open |
| Quick capture | `Ctrl+Shift+L` | Turns the address you copied into a new link |

Press **Change** and then the combination you want; at least `Ctrl` or `Alt` is required (a
function key on its own is also accepted). If Windows refuses the combination because another
program already owns it, the row says so and the old shortcut stays.

The same page lists the shortcuts that work inside the window; they are not configurable.

## Protection

| Setting | Notes |
| --- | --- |
| Lock password | Per profile, stored as an Argon2id hash. Changing it asks for the current one |
| Automatic lock | Never, or after 1, 5, 10, 15, 30 or 60 minutes without using the app |
| Lock now | Same as `Ctrl+L` |
| Remove the lock password | Also removes protection from everything the profile sees, with a count |

## Tools

- **Defaults per kind** — which IDE, terminal and browser to use when a project does not choose
  one. "Automatic" means the first one found.
- **The list of tools found**, grouped by kind, with the path of the executable. A switch hides a
  tool from the menus; a tool that disappeared from disk is marked *not found*.
- **Search again** re-runs the detection (it also runs at every startup, in the background).
- **Add tool…** adds a program by hand: kind, name, executable, and arguments where `{path}`
  becomes the path and `{urls}` the addresses. Leave the arguments empty to pass the path last.

Browser profiles are read from the browser's own files (`Local State` for Chromium browsers,
`profiles.ini` for Firefox) and appear in the details panel of a link or a group.

## Data and backups

- **Create a backup now** — writes a copy into the backups folder.
- **Save a copy to…** — writes it wherever you choose.
- **Restore…** — from the list of recent backups or from a file. LlamaDesk checks the file,
  restarts, and keeps your current database next to it as `llamadesk.before-restore.db`.
- **Open backups folder** — opens it in File Explorer.

One backup is created automatically at the first start of each day, and the last seven are kept.
A backup is the database file itself; cover images are not included (they live in the `covers`
folder next to it).

## Files on disk

```
%APPDATA%\com.llamadesk.app\
├─ llamadesk.db                     the library
├─ llamadesk.db-wal, .db-shm        SQLite working files
├─ backups\llamadesk-auto-*.db      automatic backups (last seven)
├─ backups\llamadesk-*.db           manual backups
├─ covers\<sha256>.<ext>            cover images
└─ llamadesk.before-restore.db      the database replaced by the last restore
```

Settings › About shows the version, the database path and whether the window is using Windows 11
Mica or a solid colour.

## Command-line options

| Option | Effect |
| --- | --- |
| `--minimized` | Starts without showing the window (used by "Start with Windows") |

Starting LlamaDesk a second time does not open a second window: the running one comes forward.
