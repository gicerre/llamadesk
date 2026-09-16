# LlamaDesk documentation

Everything here describes LlamaDesk **as it is today** (version 0.0.1, Windows 10/11).
Anything not yet implemented is listed as such in the [roadmap](#roadmap-and-open-points).

## For people who use LlamaDesk

| Document | What it covers |
| --- | --- |
| [Installation](INSTALLATION.md) | Requirements, installers, where your data is kept, updating, uninstalling |
| [Getting started](GETTING_STARTED.md) | First launch, your first workspace, project and links, in about ten minutes |
| [User guide](USER_GUIDE.md) | Every screen and every feature: library, opening things, Launch, search, protection, profiles |
| [Configuration](CONFIGURATION.md) | Settings, tools, shortcuts, backups, files on disk |
| [Troubleshooting](TROUBLESHOOTING.md) | What to do when something does not open, unlock or start |
| [FAQ](FAQ.md) | Short answers about scope, data, privacy and limits |
| [Privacy and data](PRIVACY.md) | What LlamaDesk stores, what it never does, what the lock protects |

## For people who build LlamaDesk

| Document | What it covers |
| --- | --- |
| [Development](DEVELOPMENT.md) | Environment, repository layout, commands, tests, how a feature flows through the code |
| [Architecture](ARCHITECTURE.md) | Layers, startup sequence, Rust services, Windows integration, rendering |
| [Data model](DATA_MODEL.md) | The SQLite schema and why it is shaped this way |
| [Build and packaging](BUILD.md) | Producing the installers locally, what the bundle contains |
| [Release process](RELEASE.md) | Versioning, tagging, the GitHub workflow, publishing a release |
| [Brand](BRAND.md) | The symbol, the icon set, and how they are generated |
| [Manual test checklist](CHECKLIST.md) | What must be tried in the installed app (Italian) |
| [Redesign record](REDESIGN.md) | The 2.0 design decisions, phase by phase (Italian) |

Contribution rules live in [CONTRIBUTING.md](../CONTRIBUTING.md), the security policy in
[SECURITY.md](../SECURITY.md), and the user-visible history in [CHANGELOG.md](../CHANGELOG.md).

## Language

Documents aimed at the public are written in English. Two internal documents stay in Italian,
because they are working notes for the maintainer: the manual checklist and the redesign record.
The application itself ships in **Italian and English**.

## Roadmap and open points

These are the things the project knows it does not do yet. Nothing else should be assumed.

- **Manual verification of the installed app** is still in progress: the items marked `[ ]` in
  the [checklist](CHECKLIST.md) have only been tested in the browser preview.
- **Windows 11 Snap Layouts** do not appear when hovering the custom maximize button
  (`Win+Z` and dragging to the edges work).
- **Installers are unsigned**, so SmartScreen warns on first run.
- **Cover images are not included in backups** — they live next to the database.
- **No automatic updates**: the app never contacts the network, so new versions are installed by
  hand.
- Some backend commands have no interface yet: archiving a node, duplicating a subtree, and
  reordering the workspaces of a profile.
