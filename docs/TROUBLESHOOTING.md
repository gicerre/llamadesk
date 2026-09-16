# Troubleshooting

LlamaDesk reports problems where they happen: a message at the bottom of the window (a toast)
with the reason, or an inline panel. There is no log file — nothing is written about what you do.

## Windows warns me when I run the installer

The installers are not signed with a code-signing certificate yet, so SmartScreen shows
"Windows protected your PC". Choose **More info → Run anyway**, or check the SHA-256 checksum
published with the release, or build the app yourself ([Build and packaging](BUILD.md)).

## A link or a file does not open

| Message | What it means | What to do |
| --- | --- | --- |
| *"Path not found"* on the row | The folder or file moved or was deleted | Press **Locate…** on the row to point it at the new place, or `F5` to re-check |
| *"Not reachable right now"* | A network share that does not answer within 1.5 seconds | Check the VPN or the server, then `F5` |
| *"For safety LlamaDesk does not run programs and scripts"* | The path is an `.exe`, `.bat`, `.ps1`, `.msi`, `.lnk`… | Use **Show in File Explorer** and start it yourself |
| *"URL not valid"* or *"scheme not allowed"* | Only `http`, `https` and `mailto` are opened | Fix the address in the details panel |
| *"… is no longer installed"* | The saved tool is gone from disk | Settings › Tools → **Search again**, or choose another tool |

## The IDE, terminal or browser I want is missing

Settings › Tools lists what was found in the usual installation folders. If your program lives
somewhere else, add it with **Add tool…**: pick the kind, the executable, and the arguments
(`{path}` for a path, `{urls}` for addresses; leave it empty to pass the path last).

Portable installations and programs installed only for another Windows user are not detected.

## A group of links opens only some tabs

Browsers drop tabs when too many arrive at once. LlamaDesk spaces them out by 250 ms. If your
browser still drops some, open the group in a specific browser (details panel → Opening), which
starts it once with every address.

## The global shortcut does not work

Settings › Shortcuts shows the reason under the shortcut: on Windows `Ctrl+Space` and similar
combinations are often taken by input method editors or other launchers. Press **Change** and
choose another combination. The in-app shortcuts keep working regardless.

## I cannot see a project any more

Three possible reasons:

1. **It is protected and the session is locked** — the page shows the unlock panel, and a line in
   search says how many items are hidden. Unlock with `Ctrl+L` or the padlock.
2. **The workspace is hidden in this profile** — Settings › Profiles → the workspace switches.
3. **It was deleted** — if it happened in this session, the toast offered **Undo**. Otherwise
   restore a backup (Settings › Data and backups), which replaces the whole library.

## I forgot the lock password

Use **Forgot password?** in the unlock panel. It removes the password *and* the protection from
everything the profile sees, and tells you how many items that is. It cannot recover the password
itself: only the Argon2id hash is stored.

## The app starts but the window does not appear

If **Start minimized** is on, or Windows started it with `--minimized`, the window is hidden:
open it from the tray icon. Closing the window also hides it there unless you turned
*Close to the notification area* off.

## Something looks wrong after an update

Take a backup first (Settings › Data and backups), then try restoring the backup taken before the
update: LlamaDesk verifies the file, restarts and keeps the current database next to it as
`llamadesk.before-restore.db`.

## Nothing here matches

Open an issue with the version (Settings › About), your Windows build, and what you did. Please
replace client names and internal URLs with examples. For anything that looks like a security
problem, follow [SECURITY.md](../SECURITY.md) instead.
