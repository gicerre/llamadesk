//! Modello di dominio serializzato verso il frontend.
//!
//! Tutte le struct usano `camelCase` per combaciare con i tipi TypeScript in
//! `src/types/domain.ts`. In Fase 3 questi tipi verranno generati da qui con
//! `ts-rs`, eliminando ogni possibilita' di divergenza fra Rust e React.

use serde::{Deserialize, Serialize};

/* ============================================================== impostazioni */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub background_id: Option<String>,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

/// Che cosa se ne va con un profilo: la conferma deve mostrare i numeri veri.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDeleteImpact {
    pub containers: i64,
    pub applications: i64,
    pub links: i64,
    pub bundles: i64,
}

/// Impostazioni applicative. `#[serde(default)]` e' essenziale: una chiave
/// mancante nel database (o introdotta da una versione futura) non deve mai
/// impedire l'avvio, deve semplicemente ricadere sul default.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub global_shortcut: String,
    pub capture_shortcut: String,
    pub start_minimized: bool,
    pub close_to_tray: bool,
    pub autostart: bool,
    pub active_profile_id: Option<String>,
    pub background_id: Option<String>,
    pub overlay_opacity: u8,
    pub open_delay_ms: u64,
    pub system_transparency: bool,
    /// Giorni di inattivita' oltre i quali un link viene segnalato come dormiente.
    pub stale_link_days: i64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            language: "en".into(),
            global_shortcut: "CmdOrCtrl+Space".into(),
            capture_shortcut: "CmdOrCtrl+Shift+L".into(),
            start_minimized: false,
            close_to_tray: true,
            autostart: false,
            active_profile_id: None,
            background_id: None,
            overlay_opacity: 30,
            open_delay_ms: 250,
            system_transparency: false,
            stale_link_days: 90,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub is_first_run: bool,
    pub app_version: String,
    pub db_path: String,
    pub system_locale: String,
    pub profiles: Vec<Profile>,
    /// Risolto dal backend: un `activeProfileId` che punta a un profilo
    /// cancellato ricade sul primo esistente.
    pub active_profile_id: Option<String>,
    /// Gia' effettive per il profilo attivo (globali + override).
    pub settings: AppSettings,
    /// Chiavi che il profilo attivo sovrascrive.
    pub profile_overrides: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub accelerator: String,
    pub registered: bool,
    pub error: Option<String>,
}

/* ================================================================= gerarchia */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub profile_id: String,
    pub parent_id: Option<String>,
    pub kind: String,
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub badge_text: Option<String>,
    pub background_id: Option<String>,
    pub danger_level: Option<String>,
    pub danger_prompt_id: Option<String>,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub sort_order: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Application {
    pub id: String,
    pub profile_id: String,
    pub container_id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub danger_level: Option<String>,
    pub danger_prompt_id: Option<String>,
    pub is_favorite: bool,
    pub sort_order: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub application_id: String,
    pub name: String,
    pub url: String,
    pub kind: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub danger_level: Option<String>,
    pub danger_prompt_id: Option<String>,
    pub is_favorite: bool,
    pub is_default: bool,
    pub sort_order: f64,
}

/// Un'applicazione con i suoi link: l'unita' che la UI disegna come card.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationWithLinks {
    #[serde(flatten)]
    pub application: Application,
    pub links: Vec<Link>,
}

/// Un link con il contesto che serve a riconoscerlo fuori dal suo
/// contenitore: sulla dashboard "Calendario" da solo non dice di chi e'.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInContext {
    #[serde(flatten)]
    pub link: Link,
    pub application_name: String,
    pub container_id: String,
    pub container_name: String,
}

/// Un segmento del breadcrumb.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Crumb {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub badge_text: Option<String>,
}

/// Tutto cio' che serve per disegnare la vista di un contenitore.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerView {
    pub container: Container,
    pub breadcrumb: Vec<Crumb>,
    pub children: Vec<Container>,
    pub applications: Vec<ApplicationWithLinks>,
    /// Livello di pericolo effettivo del contenitore, gia' risolto a cascata.
    pub danger: ResolvedDanger,
    /// Ambienti fratelli, per l'Environment Switcher.
    pub sibling_environments: Vec<Container>,
}

/* =============================================================== danger zone */

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedDanger {
    pub level: String,
    /// Entita' che ha definito il livello: `None` se il livello e' il default.
    pub inherited_from_id: Option<String>,
    pub inherited_from_name: Option<String>,
    pub inherited_from_kind: Option<String>,
    /// `true` se il livello e' stato definito sull'entita' stessa.
    pub is_own: bool,
    pub prompt_id: Option<String>,
}

impl ResolvedDanger {
    pub fn normal() -> Self {
        Self {
            level: "normal".into(),
            inherited_from_id: None,
            inherited_from_name: None,
            inherited_from_kind: None,
            is_own: false,
            prompt_id: None,
        }
    }

    pub fn requires_confirmation(&self) -> bool {
        matches!(self.level.as_str(), "warning" | "danger" | "critical")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DangerPrompt {
    pub id: String,
    pub profile_id: Option<String>,
    pub name: String,
    pub level: String,
    pub title: String,
    pub message: String,
    pub confirm_label: String,
    pub cancel_label: String,
    pub confirm_word: Option<String>,
    pub is_builtin: bool,
}

/// Il pacchetto che la UI riceve prima di aprire un link: livello risolto,
/// prompt da mostrare e valori gia' pronti per i segnaposto del messaggio.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenIntent {
    pub link_id: String,
    pub link_name: String,
    pub url: String,
    pub application_name: String,
    pub danger: ResolvedDanger,
    pub prompt: Option<DangerPrompt>,
    /// Segnaposto risolti: {project}, {environment}, {context}, {application}, {link}, {url}.
    pub placeholders: std::collections::BTreeMap<String, String>,
}

/* ==================================================== ricerca e salute link */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub entity_type: String,
    pub id: String,
    pub name: String,
    pub subtitle: Option<String>,
    /// Percorso leggibile, es. "ACME / PRODUZIONE / Cliente A".
    pub path: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub danger_level: String,
    pub score: f64,
}

/// Salute di un link calcolata SOLO dalla cronologia locale: nessuna richiesta
/// di rete, nessun ping all'URL. Serve a scovare i link ormai dimenticati.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkUsage {
    pub link_id: String,
    pub last_opened_at: Option<String>,
    pub open_count: i64,
    pub days_since_last_open: Option<i64>,
    /// `fresh` | `aging` | `dormant` | `never`
    pub staleness: String,
}

/* ============================================================ tag e note */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub content: String,
    pub updated_at: String,
}

/// Una nota con il nome di cio' che annota e il contenitore in cui
/// ritrovarla (`None` per le note del profilo, che non vivono nell'albero).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInContext {
    #[serde(flatten)]
    pub note: Note,
    pub title: String,
    pub container_id: Option<String>,
}

/* ================================================= dashboard ============ */

/// Un widget della dashboard. `config` e' JSON libero nello schema, ma passa
/// sempre da `widgets::sanitize_config` prima di essere salvato.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardWidget {
    pub id: String,
    pub profile_id: String,
    pub kind: String,
    pub config: serde_json::Value,
    pub is_visible: bool,
    pub sort_order: f64,
}

/* ================================================== quick workspaces ==== */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub is_temporary: bool,
    pub expires_at: Option<String>,
    pub open_delay_ms: i64,
    pub sort_order: f64,
}

/// Un workspace con i link che contiene, già risolti.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleWithLinks {
    #[serde(flatten)]
    pub bundle: Bundle,
    pub links: Vec<Link>,
}

/* ============================================================= sfondi === */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Background {
    pub id: String,
    pub name: String,
    /// `builtin` | `file` | `gradient` | `solid`
    pub source: String,
    /// id built-in, percorso del file, gradiente CSS o colore esadecimale.
    pub value: String,
    pub blur: i64,
    pub overlay_opacity: f64,
}

/* ====================================================== backup / restore */

/// Formato dell'export. Contiene SOLO configurazione: nessuna credenziale
/// (l'app non ne ha), e la cronologia d'uso resta fuori per scelta.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    /// Versione del formato, non dell'applicazione.
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub profiles: Vec<Profile>,
    pub containers: Vec<Container>,
    pub applications: Vec<Application>,
    pub links: Vec<Link>,
    pub tags: Vec<Tag>,
    pub taggables: Vec<TaggableRow>,
    pub notes: Vec<Note>,
    pub bundles: Vec<Bundle>,
    pub bundle_items: Vec<BundleItemRow>,
    pub backgrounds: Vec<Background>,
    /// Solo i prompt personalizzati: i built-in vivono nel codice.
    pub danger_prompts: Vec<DangerPrompt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaggableRow {
    pub tag_id: String,
    pub entity_type: String,
    pub entity_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleItemRow {
    pub bundle_id: String,
    pub link_id: String,
    pub sort_order: f64,
}

/// Riepilogo di un'importazione, mostrato all'utente a operazione conclusa.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub profiles: usize,
    pub containers: usize,
    pub applications: usize,
    pub links: usize,
    pub bundles: usize,
    pub notes: usize,
    pub tags: usize,
}
