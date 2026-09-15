-- ============================================================================
--  LlamaDesk — migrazione 0003 "schema_v2"
--
--  La riprogettazione 2.0 (docs/REDESIGN.md) sostituisce il modello precedente
--  invece di convertirlo (decisione D11): le versioni 1 e 2 appartengono a
--  LlamaDesk 1 e restano leggibili nel tag git `legacy-v1`. Un database v1/v2
--  viene copiato dal migratore (llamadesk.backup.vN.db) prima di arrivare qui.
--
--  Il modello:
--   * `nodes`  — ogni oggetto: workspace, progetto, sottoprogetto, sezione,
--                link, gruppo di link, percorso locale;
--   * `edges`  — le appartenenze, con il loro ordine. Solo un progetto puo'
--                avere piu' padri (i workspace che lo condividono);
--   * `allowed_children` — chi puo' contenere chi, come dato e non come schema;
--   * tutto cio' che dipende da CHI guarda (preferiti, recenti, ordine e
--     visibilita' dei workspace, strumenti preferiti) sta in tabelle del profilo.
--
--  Ogni id e' un UUIDv7 testuale; ogni `sort_order` e' un REAL (una UPDATE per
--  spostamento). `caution` NULL significa "eredita".
-- ============================================================================

-- ------------------------------------------------ rimozione del modello v1 --
-- Figli prima dei padri: con le foreign key attive, DROP TABLE di una tabella
-- ancora referenziata fallirebbe.
DROP TABLE IF EXISTS usage_events;
DROP TABLE IF EXISTS dashboard_widgets;
DROP TABLE IF EXISTS bundle_items;
DROP TABLE IF EXISTS bundles;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS taggables;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS allowed_child_kinds;
DROP TABLE IF EXISTS containers;
DROP TABLE IF EXISTS danger_prompts;
DROP TABLE IF EXISTS profile_settings;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS backgrounds;
DROP TABLE IF EXISTS settings;

-- ---------------------------------------------------------------- settings --
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                       -- sempre JSON valido
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------ assets --
-- Immagini importate dall'utente (cover, icone, avatar), copiate in
-- %APPDATA%\assets con nome = sha256: la stessa immagine non si duplica.
CREATE TABLE assets (
  id         TEXT PRIMARY KEY,
  sha256     TEXT NOT NULL UNIQUE,
  mime       TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- profiles --
CREATE TABLE profiles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description       TEXT,
  avatar_asset_id   TEXT REFERENCES assets(id) ON DELETE SET NULL,
  color_main        TEXT,
  color_secondary   TEXT,
  lock_hash         TEXT,                        -- Argon2id; NULL = nessuna password
  lock_auto_minutes INTEGER NOT NULL DEFAULT 10, -- 0 = mai
  sort_order        REAL NOT NULL DEFAULT 1000,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Overlay chiave/valore sulle impostazioni globali (invariato dalla v1).
CREATE TABLE profile_settings (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_id, key)
);

-- ------------------------------------------------------------------- tools --
-- Programmi con cui eseguire le azioni. Gli strumenti rilevati hanno id
-- stabili ("ide:vscode"), cosi' le preferenze sopravvivono a un nuovo
-- rilevamento.
CREATE TABLE tools (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('terminal', 'ide', 'browser')),
  name          TEXT NOT NULL,
  exe_path      TEXT NOT NULL,
  args_template TEXT NOT NULL DEFAULT '{path}',
  source        TEXT NOT NULL CHECK (source IN ('detected', 'custom')),
  is_hidden     INTEGER NOT NULL DEFAULT 0,
  detected_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------- nodes --
CREATE TABLE nodes (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK (kind IN
                          ('workspace', 'project', 'subproject', 'section', 'link', 'link_group', 'path')),
  name                  TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description           TEXT,
  aliases               TEXT,                    -- parole alternative per la ricerca
  icon                  TEXT,                    -- "lucide:<nome>" | "asset:<id>" | NULL
  color_main            TEXT,
  color_secondary       TEXT,                    -- NULL = derivato dal principale
  cover_asset_id        TEXT REFERENCES assets(id) ON DELETE SET NULL,
  cover_focus_x         REAL NOT NULL DEFAULT 0.5 CHECK (cover_focus_x BETWEEN 0 AND 1),
  cover_focus_y         REAL NOT NULL DEFAULT 0.5 CHECK (cover_focus_y BETWEEN 0 AND 1),
  is_protected          INTEGER NOT NULL DEFAULT 0,
  caution               TEXT CHECK (caution IN ('none', 'confirm', 'type_name')),
  url                   TEXT,
  path                  TEXT,
  enabled               INTEGER NOT NULL DEFAULT 1,
  open_mode             TEXT CHECK (open_mode IN ('default', 'new_window')),
  browser_tool_id       TEXT REFERENCES tools(id) ON DELETE SET NULL,
  browser_profile       TEXT,
  created_by_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at           TEXT,
  deleted_at            TEXT,                    -- cestino: ripristinabile fino al riavvio
  deletion_id           TEXT,                    -- raggruppa i nodi eliminati insieme

  -- Le colonne specifiche esistono solo sul tipo a cui appartengono.
  CHECK ((kind = 'link') = (url IS NOT NULL)),
  CHECK ((kind = 'path') = (path IS NOT NULL)),
  CHECK (cover_asset_id IS NULL OR kind IN ('workspace', 'project')),
  CHECK ((open_mode IS NULL AND browser_tool_id IS NULL AND browser_profile IS NULL)
         OR kind IN ('link', 'link_group')),
  CHECK ((deleted_at IS NULL) = (deletion_id IS NULL))
);
CREATE INDEX idx_nodes_kind     ON nodes(kind);
CREATE INDEX idx_nodes_deletion ON nodes(deletion_id);

-- ------------------------------------------------------------------- edges --
CREATE TABLE edges (
  parent_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  sort_order REAL NOT NULL DEFAULT 1000,
  is_pinned  INTEGER NOT NULL DEFAULT 0,          -- "fissato in Home" (progetti)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parent_id, child_id),
  CHECK (parent_id <> child_id)
);
CREATE INDEX idx_edges_parent ON edges(parent_id, sort_order);
CREATE INDEX idx_edges_child  ON edges(child_id);

-- Regole di annidamento. `shared = 1` permette al figlio di avere piu' padri
-- di quel tipo: oggi vale solo per i progetti dentro i workspace.
CREATE TABLE allowed_children (
  parent_kind TEXT NOT NULL,
  child_kind  TEXT NOT NULL,
  shared      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_kind, child_kind)
);

INSERT INTO allowed_children (parent_kind, child_kind, shared) VALUES
  ('workspace',  'project',    1),
  ('workspace',  'section',    0),
  ('workspace',  'link',       0),
  ('workspace',  'link_group', 0),
  ('workspace',  'path',       0),
  ('project',    'subproject', 0),
  ('project',    'section',    0),
  ('project',    'link',       0),
  ('project',    'link_group', 0),
  ('project',    'path',       0),
  ('subproject', 'section',    0),
  ('subproject', 'link',       0),
  ('subproject', 'link_group', 0),
  ('subproject', 'path',       0),
  ('section',    'section',    0),
  ('section',    'link',       0),
  ('section',    'link_group', 0),
  ('section',    'path',       0),
  ('link_group', 'link',       0);

-- ------------------------------------------------------------ launch steps --
-- "Avvio" (D7): azioni eseguite in sequenza da un progetto, sottoprogetto o
-- sezione.
CREATE TABLE launch_steps (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  action_id  TEXT NOT NULL,
  tool_id    TEXT REFERENCES tools(id) ON DELETE SET NULL,
  sort_order REAL NOT NULL DEFAULT 1000
);
CREATE INDEX idx_launch_owner ON launch_steps(owner_id, sort_order);

-- ------------------------------------------------ cio' che dipende dal profilo --
-- La libreria e' comune (D1): ogni profilo sceglie quali workspace vede.
CREATE TABLE profile_workspaces (
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  sort_order     REAL NOT NULL DEFAULT 1000,
  is_default     INTEGER NOT NULL DEFAULT 0,
  last_route     TEXT,                            -- ultima pagina visitata in quel workspace
  last_opened_at TEXT,
  PRIMARY KEY (profile_id, workspace_id)
);
CREATE UNIQUE INDEX ux_profile_default_workspace
  ON profile_workspaces(profile_id) WHERE is_default = 1;
CREATE INDEX idx_profile_workspaces_ws ON profile_workspaces(workspace_id);

-- Preferiti per profilo. `action_id = ''` e' il nodo in se'; un valore e' una
-- scorciatoia "oggetto + azione" (es. "Backend con IntelliJ").
CREATE TABLE favorites (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  action_id  TEXT NOT NULL DEFAULT '',
  tool_id    TEXT REFERENCES tools(id) ON DELETE SET NULL,
  sort_order REAL NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_id, node_id, action_id)
);

-- Un evento per ogni azione che apre qualcosa. Non lascia mai il computer,
-- escluso dall'export, conservato 90 giorni.
CREATE TABLE usage_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  node_id          TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  action_id        TEXT NOT NULL,
  tool_id          TEXT REFERENCES tools(id) ON DELETE SET NULL,
  via_workspace_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usage_profile_at ON usage_events(profile_id, at DESC);
CREATE INDEX idx_usage_node       ON usage_events(node_id);

-- Strumento preferito per tipo: sul profilo (predefinito) o su un nodo
-- (override ereditato dai discendenti).
CREATE TABLE tool_preferences (
  profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  node_id    TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  tool_kind  TEXT NOT NULL CHECK (tool_kind IN ('terminal', 'ide', 'browser')),
  tool_id    TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  CHECK ((profile_id IS NULL) <> (node_id IS NULL))
);
CREATE UNIQUE INDEX ux_tool_pref_profile ON tool_preferences(profile_id, tool_kind)
  WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX ux_tool_pref_node ON tool_preferences(node_id, tool_kind)
  WHERE node_id IS NOT NULL;

-- --------------------------------------------------------------------- tag --
-- Globali come la libreria: un workspace condiviso mostra gli stessi tag a
-- tutti i profili che lo vedono.
CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT
);

CREATE TABLE node_tags (
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, node_id)
);
CREATE INDEX idx_node_tags_node ON node_tags(node_id);
