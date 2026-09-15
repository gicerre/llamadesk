# Data model (schema v2)

The full DDL lives in [`src-tauri/src/db/migrations/0003_schema_v2.sql`](../src-tauri/src/db/migrations/0003_schema_v2.sql),
which is the authoritative source. The product decisions behind it are in
[`REDESIGN.md`](REDESIGN.md); this document explains the technical ones.

Schema versions 1 and 2 belonged to LlamaDesk 1 (git tag `legacy-v1`). Migration 3 replaces them
instead of converting them: the migrator copies the old file to `llamadesk.backup.vN.db` first.

## 1. Nodes and edges

Every object is a row in **`nodes`**, with a `kind`: `workspace`, `project`, `subproject`,
`section`, `link`, `link_group`, `path`. Membership is a row in **`edges`**
(`parent_id`, `child_id`, `sort_order`, `is_pinned`).

Why: moving, reordering, sharing, deleting with undo, duplicating, resolving inheritance and
searching are **one** algorithm for every level. Kind-specific columns (`url`, `path`, `cover_*`,
`open_mode`…) are nullable and guarded by `CHECK` constraints, so a link without a URL or a
section with a cover cannot be written.

Nesting rules are data, in **`allowed_children`** (`parent_kind`, `child_kind`, `shared`):

```
workspace  → project (shared), section, link, link_group, path
project    → subproject, section, link, link_group, path
subproject → section, link, link_group, path
section    → section, link, link_group, path
link_group → link
```

`services::hierarchy` enforces them in Rust, together with the rules the table cannot express:

- a child may have several parents only if its rule is `shared` and all parents share a kind
  (today: a project in several workspaces — one entity, never a copy);
- no node can end up inside one of its own descendants (sections nest without limit);
- removing the last parent of a node is refused: that is a deletion.

Workspaces are roots: they have no parent edge. Which profiles see them is `profile_workspaces`.

## 2. Ordering and pinning belong to the edge

`sort_order` and `is_pinned` live on the edge, not on the node: a shared project has a different
position (and may be pinned) in each workspace. `sort_order` is a REAL: a move writes
`(previous + next) / 2`, one UPDATE; when two neighbours get closer than `1e-6` the scope is
rebalanced. `services::ordering::OrderedList` implements this once for every ordered list
(`edges` by parent, `profile_workspaces` by profile).

## 3. What depends on who is looking

The library is shared by all profiles (decision D1). Everything that depends on the viewer is
keyed by profile:

| Table | Holds |
|---|---|
| `profile_workspaces` | which workspaces a profile sees, their order, the default one, the last route visited |
| `favorites` | a node, or a node + action shortcut ("Backend with IntelliJ") |
| `usage_events` | every action that opened something; 90 days, never exported |
| `tool_preferences` | preferred IDE / terminal / browser on the profile, or as a node override |
| `profile_settings` | the settings overlay (theme, language, density, open delay) |

A workspace must stay visible in at least one profile. Deleting a profile deletes (without
trash) the workspaces only that profile could see.

Tags are global, like the library: a shared workspace shows the same tags to every profile.

## 4. Inheritance

Resolved in `services::resolve`, never stored:

- **Protection** — a node is protected if it or *any* ancestor, along *any* path, is. A shared
  project is protected if one of its workspaces is. Children can add protection, never remove it.
- **Caution** ("ask before opening") — `NULL` inherits; the nearest explicit value wins; at equal
  distance (a shared project's workspaces) the strictest wins. A single link can opt out with
  `none`.
- **Breadcrumb and tool preference** — follow the workspace the user came from (`via`), falling
  back to the first workspace visible to the profile.

Protection and caution are context-independent on purpose: a safety rule cannot depend on which
workspace you happen to be looking from.

## 5. Trash

Deleting marks `deleted_at` and a shared `deletion_id` on the node and on every descendant left
without parents; shared projects survive in their other workspaces. Every read in `repo::nodes`
filters deleted rows. `restore(deletion_id)` undoes it; the trash is emptied at startup, and the
foreign keys then remove edges, favorites, usage and tags of the purged nodes.

## Other notes

- **Ids are UUIDv7** text. Detected tools use stable ids (`ide:vscode`) so preferences survive a
  new detection.
- **The lock password is never serialised**: `Profile` exposes only `hasLock`.
- **Partial updates** (`NodePatch`, `ProfilePatch`) distinguish an absent field (leave it) from
  `null` (clear it) with `domain::nullable`.
- **TypeScript types are generated** from `domain` by `ts-rs` into `src/types/generated` when
  `cargo test` runs; CI fails if they are not committed.
- **Search has no FTS5 index**, as before: hundreds of nodes, not millions.
- **SQL literals are validated** by `scripts/check-sql.mjs` against the real schema, without a
  Rust toolchain.

## 6. Tools, preferences and launch steps

**`tools`** holds what can open something: detected programs (stable ids like `ide:vscode`, so
preferences survive a reinstall) and ones added by hand, each with `exe_path` and an
`args_template` (a JSON array with `{path}`, `{path_ps}` or `{urls}`). `detected_at` is set to
NULL when a program disappears instead of deleting the row.

**`tool_preferences`** is "which tool for which kind", either for a profile or for a node
(`CHECK ((profile_id IS NULL) <> (node_id IS NULL))`, with two partial unique indexes). A node
inherits from its ancestors along the workspace it is being looked at from, then from the
profile, then falls back to the first available tool.

**`launch_steps`** is the Launch sequence of a container: `owner_id`, `target_id`, `action_id`,
optional `tool_id`, `sort_order` (same fractional ordering as everything else). The target must
be inside the owner; duplicating a subtree remaps the steps to the copies.

## 7. Usage, favorites and search

**`usage_events`** records one row per successful action (`node_id`, `action_id`, `tool_id`,
`via_workspace_id`) and is pruned after 90 days. It powers Continue, Recents and the ranking in
the palette; it is per profile and never leaves the machine. **`favorites`** is per profile too,
and can point at a specific action and tool.

Search does not use FTS: it reads the visible nodes with their tags and usage and scores them in
Rust. One less index to keep in sync, and the ranking can use things FTS cannot (inheritance,
the workspace you are in, how recently you opened something).

## 8. Protection and assets

`profiles.lock_hash` holds the Argon2id hash (never leaves Rust) and `lock_auto_minutes` the idle
timeout; `nodes.is_protected` is the flag that cascades. There is no "unlocked" column anywhere:
that state is in memory.

**`assets`** rows are cover images, deduplicated by `sha256`; the file lives in `<data>/covers`
and is deleted when no node or profile references it. Only workspaces and projects may have one
(`CHECK`), and `cover_focus_x/y` say which point stays visible when the banner is cropped.

## 9. Backups

A backup is the database file itself, copied with `VACUUM INTO` — no export format to keep in
sync with the schema. Restores are validated (integrity, `user_version` between 3 and the current
target, expected tables) before they replace anything. Cover images are not part of a backup:
they sit next to the database in `<data>/covers`.
