# Installation

## Requirements

| | |
| --- | --- |
| Operating system | Windows 10 (up to date) or Windows 11 |
| Architecture | 64-bit (x64) |
| WebView2 | Already present on Windows 11 and on updated Windows 10 |
| Disk | A few tens of MB for the app, plus your library (a database of a few hundred KB) |
| Account / internet | None. LlamaDesk works completely offline |

There is no macOS or Linux build: the installers are Windows-only and the parts that find your
terminals, IDEs and browsers look in Windows locations.

## Download

Get the latest files from the [Releases page](../../releases). Two installers are published for
every version:

| File | When to use it |
| --- | --- |
| `LlamaDesk_<version>_x64-setup.exe` | **Recommended.** NSIS installer, installs for the current user, no administrator rights |
| `LlamaDesk_<version>_x64_en-US.msi` | MSI package, for deployment through management tools |

Versions below `0.1.0` are betas and are published as pre-releases.

## Install

1. Run the installer. The NSIS one asks for the interface language (English or Italian) and
   installs only for your user account.
2. Windows SmartScreen will warn you that the publisher is unknown: the installers are not signed
   with a code-signing certificate yet. If you trust the source, choose **More info → Run
   anyway**. You can also compare the SHA-256 checksum published with the release:

   ```powershell
   Get-FileHash .\LlamaDesk_0.0.1_x64-setup.exe -Algorithm SHA256
   ```

3. Start LlamaDesk from the Start menu. On first launch it creates an empty database and shows
   the welcome screen.

## Where your data lives

Everything is inside your user profile, **not** in the installation folder:

```
%APPDATA%\com.llamadesk.app\
├─ llamadesk.db          the whole library (SQLite)
├─ llamadesk.db-wal      SQLite write-ahead log
├─ llamadesk.db-shm      SQLite shared memory file
├─ backups\              automatic and manual backups
└─ covers\               cover images you chose
```

Because of this, uninstalling or updating the app never touches your library. Settings › About
shows the exact path on your machine.

## Updating

There is no automatic update, by design: the app never talks to the network, so it cannot check
for new versions. To update, download the newer installer and run it — it replaces the program
and leaves the database untouched.

Before updating a beta, it is worth making a backup from **Settings › Data and backups → Create a
backup now**.

## Uninstalling

Uninstall LlamaDesk from *Settings › Apps* in Windows. That removes the program only. If you also
want your library gone, delete `%APPDATA%\com.llamadesk.app\` by hand.

## Building it yourself

If you prefer not to run an unsigned installer, you can build one from source — see
[Build and packaging](BUILD.md). It needs Node.js 20+, the Rust toolchain and the MSVC build
tools.
