-- ============================================================================
--  LlamaDesk — migrazione 0002 "profile_settings"
--
--  Un profilo non separa piu' soltanto i dati: si porta dietro anche il proprio
--  aspetto. Passare da "Lavoro" a "Personale" deve cambiare visibilmente il
--  clima dell'applicazione, non solo il contenuto della sidebar.
--
--  Invece di aggiungere una colonna a `profiles` per ogni preferenza, qui c'e'
--  un overlay chiave/valore: le impostazioni effettive di un profilo sono
--  quelle globali sovrascritte da queste. Aggiungere domani una preferenza
--  personalizzabile per profilo non richiedera' una nuova migrazione.
--
--  Nessun override = il profilo segue l'impostazione globale. E' lo stato
--  iniziale di tutti i profili, quindi questa migrazione non cambia il
--  comportamento di un database esistente.
-- ============================================================================

CREATE TABLE profile_settings (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,                  -- sempre JSON valido, come in `settings`
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_id, key)
);

CREATE INDEX idx_profile_settings_profile ON profile_settings(profile_id);

-- Lo sfondo del profilo viveva gia' in `profiles.background_id`. Lo spostiamo
-- nell'overlay perche' ci sia UN solo meccanismo da capire e da mantenere:
-- la colonna resta nello schema ma smette di essere letta.
INSERT INTO profile_settings (profile_id, key, value)
SELECT id, 'backgroundId', '"' || background_id || '"'
  FROM profiles
 WHERE background_id IS NOT NULL;
