-- ============================================================================
--  LlamaDesk — migrazione 0001 "init"
--
--  Modello ibrido: un'unica tabella `containers` (adjacency list con
--  discriminante `kind`) per tutti i nodi della gerarchia, piu' le foglie
--  tipizzate `applications` e `links`. Riordino, spostamento, duplicazione
--  ricorsiva, breadcrumb ed ereditarieta' della Danger Zone diventano cosi'
--  un solo algoritmo generico invece di sette implementazioni parallele.
--
--  Ogni id e' un UUIDv7 testuale: ordinabile nel tempo e immune a collisioni
--  durante import/export e duplicazione.
--  Ogni `sort_order` e' un REAL: il drag & drop scrive (prev + next) / 2,
--  quindi UNA sola UPDATE per spostamento invece di riscrivere l'intera lista.
--  `danger_level` NULL significa "eredita dal padre"; un valore e' un override.
-- ============================================================================

-- ---------------------------------------------------------------- settings --
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                       -- sempre JSON valido
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------- wallpaper --
CREATE TABLE backgrounds (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('builtin', 'file', 'gradient', 'solid')),
  value           TEXT NOT NULL,                  -- id built-in | path | gradiente CSS | hex
  blur            INTEGER NOT NULL DEFAULT 0,
  overlay_opacity REAL NOT NULL DEFAULT 0.3,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- profiles --
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  icon          TEXT,
  color         TEXT,
  background_id TEXT REFERENCES backgrounds(id) ON DELETE SET NULL,
  sort_order    REAL NOT NULL DEFAULT 1000,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------- prompt di conferma ----
-- I prompt con is_builtin = 1 contengono CHIAVI i18n, non testo letterale:
-- il frontend le risolve nella lingua corrente. Quando l'utente ne modifica
-- uno, viene salvata una copia con is_builtin = 0 e testo letterale.
CREATE TABLE danger_prompts (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = globale
  name          TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('warning', 'danger', 'critical')),
  title         TEXT NOT NULL,   -- placeholder: {project} {environment} {context} {application} {link} {url}
  message       TEXT NOT NULL,
  confirm_label TEXT NOT NULL,
  cancel_label  TEXT NOT NULL,
  confirm_word  TEXT,            -- richiesto solo dal livello 'critical'
  is_builtin    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------- containers --
CREATE TABLE containers (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id        TEXT REFERENCES containers(id) ON DELETE CASCADE,   -- NULL = radice
  kind             TEXT NOT NULL CHECK (kind IN ('project', 'workspace', 'environment', 'context', 'group')),
  name             TEXT NOT NULL,
  slug             TEXT,                          -- usato dall'Environment Switcher
  description      TEXT,
  icon             TEXT,
  color            TEXT,
  badge_text       TEXT,                          -- es. "PROD" nel breadcrumb
  background_id    TEXT REFERENCES backgrounds(id) ON DELETE SET NULL,
  danger_level     TEXT CHECK (danger_level IN ('normal', 'warning', 'danger', 'critical')),
  danger_prompt_id TEXT REFERENCES danger_prompts(id) ON DELETE SET NULL,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  is_archived      INTEGER NOT NULL DEFAULT 0,
  sort_order       REAL NOT NULL DEFAULT 1000,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_containers_parent  ON containers(parent_id, sort_order);
CREATE INDEX idx_containers_profile ON containers(profile_id, kind);
CREATE INDEX idx_containers_slug    ON containers(profile_id, kind, slug);

-- Regole di annidamento: la gerarchia e' rigorosa ma vive nei DATI, non nello
-- schema. Aggiungere un livello domani non richiede una migrazione strutturale.
CREATE TABLE allowed_child_kinds (
  parent_kind TEXT NOT NULL,                      -- 'root' = primo livello del profilo
  child_kind  TEXT NOT NULL,
  PRIMARY KEY (parent_kind, child_kind)
);

INSERT INTO allowed_child_kinds (parent_kind, child_kind) VALUES
  ('root',        'project'),
  ('root',        'workspace'),
  ('project',     'environment'),
  ('project',     'group'),
  ('environment', 'context'),
  ('environment', 'group'),
  ('context',     'group'),
  ('workspace',   'group'),
  ('group',       'group');

-- ------------------------------------------------------------ applications --
-- Una applicazione e' l'entita' logica (es. "Camunda"); i suoi link sono le
-- destinazioni concrete (Admin, Tasklist, Operate).
CREATE TABLE applications (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  container_id     TEXT NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  icon             TEXT,
  color            TEXT,
  danger_level     TEXT CHECK (danger_level IN ('normal', 'warning', 'danger', 'critical')),
  danger_prompt_id TEXT REFERENCES danger_prompts(id) ON DELETE SET NULL,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  sort_order       REAL NOT NULL DEFAULT 1000,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_applications_container ON applications(container_id, sort_order);
CREATE INDEX idx_applications_profile   ON applications(profile_id);

-- ------------------------------------------------------------------- links --
-- `kind = 'calendar'` e' puramente semantico: nessuna integrazione, nessun
-- OAuth, nessun parsing. Un calendario e' un URL che si apre nel browser.
CREATE TABLE links (
  id               TEXT PRIMARY KEY,
  application_id   TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'calendar', 'mail', 'doc', 'other')),
  description      TEXT,
  icon             TEXT,
  color            TEXT,
  danger_level     TEXT CHECK (danger_level IN ('normal', 'warning', 'danger', 'critical')),
  danger_prompt_id TEXT REFERENCES danger_prompts(id) ON DELETE SET NULL,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  is_default       INTEGER NOT NULL DEFAULT 0,    -- aperto dal click sulla card
  sort_order       REAL NOT NULL DEFAULT 1000,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_links_application ON links(application_id, sort_order);
CREATE INDEX idx_links_kind        ON links(kind);

-- -------------------------------------------------------------------- tag ---
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  UNIQUE (profile_id, name)
);

CREATE TABLE taggables (
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('container', 'application', 'link')),
  entity_id   TEXT NOT NULL,
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX idx_taggables_entity ON taggables(entity_type, entity_id);

-- ------------------------------------------------------------------- note --
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('profile', 'container', 'application', 'link')),
  entity_id   TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',           -- markdown, reso localmente
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, entity_id)
);

-- -------------------------------------------- quick workspaces / open all ---
-- Insiemi trasversali di link: possono pescare da progetti e ambienti diversi.
CREATE TABLE bundles (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  icon          TEXT,
  color         TEXT,
  is_temporary  INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT,                             -- ripulito all'avvio successivo
  open_delay_ms INTEGER NOT NULL DEFAULT 250,
  sort_order    REAL NOT NULL DEFAULT 1000,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bundle_items (
  bundle_id  TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  link_id    TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  sort_order REAL NOT NULL DEFAULT 1000,
  PRIMARY KEY (bundle_id, link_id)
);

-- ------------------------------------------------------ dashboard widgets --
CREATE TABLE dashboard_widgets (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('favorites', 'recents', 'quick_workspaces', 'calendars', 'projects', 'notes', 'tags')),
  config     TEXT NOT NULL DEFAULT '{}',
  is_visible INTEGER NOT NULL DEFAULT 1,
  sort_order REAL NOT NULL DEFAULT 1000
);
CREATE INDEX idx_widgets_profile ON dashboard_widgets(profile_id, sort_order);

-- ------------------------------------------------ cronologia d'uso locale --
-- Alimenta "Recenti" e il ranking per frecency della Command Palette.
-- Non lascia mai il computer ed e' escluso dall'export di default.
CREATE TABLE usage_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('link', 'bundle', 'container')),
  entity_id   TEXT NOT NULL,
  opened_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usage_recent ON usage_events(opened_at DESC);
CREATE INDEX idx_usage_entity ON usage_events(entity_type, entity_id);

-- NOTA: l'indice full-text (FTS5) arriva con la migrazione 0002, che ne
-- verifica prima la disponibilita' a runtime e ricade su una ricerca LIKE
-- se il binario SQLite non fosse compilato con FTS5. Metterlo qui
-- impedirebbe l'avvio dell'app in quel caso.
