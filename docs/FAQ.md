# FAQ

### Is this a bookmark manager?

No. Bookmarks are a flat list of addresses. LlamaDesk groups links, files, folders, repositories
and the tools that open them **by project**, and opens them the way you would: this repository in
your IDE, this group of links in a specific browser profile, this folder in your terminal.

### Which operating systems are supported?

Windows 10 (up to date) and Windows 11, 64-bit. There is no macOS or Linux build.

### Does it need an account or an internet connection?

Neither. There is no sign-up, no sync and no server. The Rust side of the application contains no
HTTP client at all, and a CI job fails the build if one is ever added.

### Where is my data?

In `%APPDATA%\com.llamadesk.app\`: one SQLite file, plus folders for backups and cover images.
Settings › About shows the exact path.

### Does it send anything anywhere?

No. No analytics, no crash reports, no update checks. The only things that leave LlamaDesk are the
programs and addresses **you** ask it to open, handed to Windows.

### Is my data encrypted?

No. The database is a plain SQLite file, readable by anything running as your Windows user. The
lock password hides protected content inside the app; it is a privacy lock, not encryption. For
encryption at rest use BitLocker or an encrypted volume. See [Privacy and data](PRIVACY.md).

### Can two people use the same installation?

Profiles are lenses on one library, meant for one person with different contexts (work,
presentation, personal). They are not user accounts: a profile can set its own password and see
what the others protected.

### Does LlamaDesk store passwords or tokens?

No. There is no field for them, and it never fills anything in for you.

### How do updates work?

By hand: download the newer installer from the Releases page and run it. Your library stays where
it is. The app never checks for updates, because it never talks to the network.

### Can I move my library to another computer?

Copy `%APPDATA%\com.llamadesk.app\llamadesk.db` (or a backup) to the same folder on the other
machine, and the `covers` folder if you use cover images. Local paths obviously only work if the
same folders exist there.

### What happens if I delete something by mistake?

The toast offers **Undo** right away, and the deletion stays undoable until the app restarts.
After that, restore a backup — but a restore replaces the whole library, not a single item.

### Why does a group open its links one after another?

Browsers drop or reorder tabs when many arrive at once, so they are spaced out by 250 ms. If you
choose a specific browser for a group, it is started once with every address instead.

### Can LlamaDesk run a script or a program?

It opens files with the program Windows associates with them, and starts IDEs, terminals and
browsers that were detected or that you added in Settings. It refuses to "open" executables and
scripts (`.exe`, `.bat`, `.ps1`, `.msi`, `.lnk`…), and it never builds a shell command line.

### Is there a portable version?

Not yet. The NSIS installer installs for the current user only and does not need administrator
rights.

### Can I contribute?

Yes — see [CONTRIBUTING.md](../CONTRIBUTING.md). The constraints (no network, no telemetry, no
hardcoded data) are the point of the project, so ideas that need them cannot be accepted.

### How do I try the interface without installing anything?

Clone the repository and run `npm install && npm run dev:vite`. The browser preview runs the real
interface against an in-memory example library. Add `?vuoto` to start empty, `?lingua=en|it` to
force the language, `?tema=scuro|chiaro` to force the theme. The preview lock password is `llama`.
