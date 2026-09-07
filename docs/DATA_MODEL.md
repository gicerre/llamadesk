# Data model

The full DDL lives in [`src-tauri/src/db/migrations/0001_init.sql`](../src-tauri/src/db/migrations/0001_init.sql),
which is the authoritative source. This document explains the three decisions behind it.

## 1. One table for the hierarchy

Profile → Project / Workspace → Environment → Context → Group are all rows in **`containers`**,
an adjacency list with a `kind` discriminator. The leaves are typed: `applications` (the logical
tool) and `links` (its concrete destinations).

Why: reordering, moving, duplicating a subtree, building a breadcrumb, resolving danger
inheritance and searching become **one** generic algorithm instead of five parallel ones. Adding
a level later is a row in `allowed_child_kinds`, not a migration.

The nesting rules are enforced in Rust against that table, so the hierarchy stays strict even
though the schema is generic:

```
root        → project, workspace
project     → environment, group
environment → context, group
context     → group
workspace   → group
group       → group
```

## 2. `danger_level NULL` means "inherit"

Every container, application and link has a nullable `danger_level`. `NULL` inherits from the
parent; a value is an explicit override.

**Resolution rule: the nearest explicit override to the leaf wins.**

```
link → application → group → context → environment → project → profile default
```

This satisfies both requirements at once: marking an environment `critical` protects everything
beneath it, while a single link can set `normal` to opt out (or set `critical` to opt in on an
otherwise ordinary branch). The UI always shows where the level came from
("inherited from 🔴 PRODUCTION").

## 3. `sort_order` is a REAL, not an INTEGER

Drag & drop writes `(previous + next) / 2` — **one** UPDATE per move instead of rewriting the
whole list. When the gap between two neighbours drops below `1e-6` the list is rebalanced.

## Other notes

- **Ids are UUIDv7** text: time-sortable, collision-free, which makes export/import and
  duplication trivial (no integer remapping).
- **Built-in danger prompts store i18n keys**, not literal text, so they follow the interface
  language. Editing one produces a copy with `is_builtin = 0` and literal text.
- **`usage_events`** feeds "Recent" and the frecency ranking of the command palette. It never
  leaves the machine and is excluded from exports by default.
- **`bundles`** (Quick Workspaces) are cross-cutting sets of links: they can pull from different
  projects and environments, which is why they are not part of the `containers` tree.
- **Search has no FTS5 index**, deliberately. A personal workspace holds hundreds of links, not
  millions: a `LIKE` scan over that is sub-millisecond, and in exchange we avoid an index to keep
  in sync on every write and a hard dependency on FTS5 being compiled into the SQLite binary.
  Ranking (text relevance + frecency) is computed in Rust, in `db/repo/search.rs` — that is the
  single place to change if the numbers ever justify an index.
- **`sort_order` writes are validated by `scripts/check-sql.mjs`**, which extracts every SQL
  literal from the Rust sources and prepares it against the real schema. It runs in CI without a
  Rust toolchain, so a typo in a query fails the build rather than the first launch.
