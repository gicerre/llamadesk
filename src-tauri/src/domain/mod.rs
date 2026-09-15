//! Modello di dominio serializzato verso il frontend.
//!
//! Ogni struct usa `camelCase` e deriva `TS`: `cargo test` rigenera i tipi in
//! `src/types/generated`, cosi' Rust e React non possono divergere.
//! Gli interi a 64 bit sono dichiarati `number` lato TypeScript: i valori
//! reali (conteggi, minuti) restano ben dentro la precisione di un double.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;

/* ================================================================ enumerati */

/// Implementa conversione testuale, `FromSql` e `ToSql` per un enum senza dati.
macro_rules! text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        // Non tutti gli enum usano ogni metodo generato.
        #[allow(dead_code)]
        impl $name {
            pub fn as_str(self) -> &'static str {
                match self { $($name::$variant => $text),+ }
            }

            pub fn parse(value: &str) -> Option<Self> {
                match value { $($text => Some($name::$variant),)+ _ => None }
            }
        }

        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                let text = value.as_str()?;
                $name::parse(text).ok_or_else(|| FromSqlError::Other(
                    format!("valore non valido per {}: {text}", stringify!($name)).into(),
                ))
            }
        }

        impl ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
                Ok(ToSqlOutput::from(self.as_str()))
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
    };
}

/// Tipo di un nodo. Le regole su chi puo' contenere chi stanno nella tabella
/// `allowed_children`, non qui.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum NodeKind {
    Workspace,
    Project,
    Subproject,
    Section,
    Link,
    LinkGroup,
    Path,
}

text_enum!(NodeKind {
    Workspace => "workspace",
    Project => "project",
    Subproject => "subproject",
    Section => "section",
    Link => "link",
    LinkGroup => "link_group",
    Path => "path",
});

/// "Chiedi conferma" prima di aprire. Sul nodo `NULL` significa "eredita".
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Caution {
    /// Nessuna conferma. Serve anche a sfilarsi da una conferma ereditata.
    None,
    /// Dialogo di conferma.
    Confirm,
    /// Conferma digitando il nome dell'elemento.
    TypeName,
}

text_enum!(Caution {
    None => "none",
    Confirm => "confirm",
    TypeName => "type_name",
});

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum OpenMode {
    Default,
    NewWindow,
}

text_enum!(OpenMode {
    Default => "default",
    NewWindow => "new_window",
});

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ToolKind {
    Terminal,
    Ide,
    Browser,
}

text_enum!(ToolKind {
    Terminal => "terminal",
    Ide => "ide",
    Browser => "browser",
});

/* ============================================================ patch parziali */

/// Distingue "campo assente" (non toccare) da "campo null" (svuota):
/// con `#[serde(default)]` un campo mancante resta `None`, un `null` esplicito
/// diventa `Some(None)`.
pub fn nullable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

/* ============================================================== impostazioni */

/// Impostazioni applicative. `#[serde(default)]` e' essenziale: una chiave
/// mancante nel database (o introdotta da una versione futura) non deve mai
/// impedire l'avvio, deve ricadere sul default.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct AppSettings {
    /// `system` | `light` | `dark`
    pub theme: String,
    /// `it` | `en`
    pub language: String,
    /// `comfortable` | `compact`
    pub density: String,
    /// Porta LlamaDesk in primo piano con la palette aperta.
    pub global_shortcut: String,
    /// Cattura dagli appunti.
    pub capture_shortcut: String,
    pub start_minimized: bool,
    pub close_to_tray: bool,
    pub autostart: bool,
    /// Animazione di apertura all'avvio a freddo.
    pub opener_animation: bool,
    pub active_profile_id: Option<String>,
    /// Millisecondi fra un'apertura e l'altra quando si aprono piu' link.
    #[ts(type = "number")]
    pub open_delay_ms: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            language: "en".into(),
            density: "comfortable".into(),
            global_shortcut: "CmdOrCtrl+Alt+Space".into(),
            capture_shortcut: "CmdOrCtrl+Shift+L".into(),
            start_minimized: false,
            close_to_tray: true,
            autostart: false,
            opener_animation: true,
            active_profile_id: None,
            open_delay_ms: 250,
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShortcutStatus {
    pub accelerator: String,
    pub registered: bool,
    pub error: Option<String>,
}

/* ================================================================== profili */

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub avatar_asset_id: Option<String>,
    pub color_main: Option<String>,
    pub color_secondary: Option<String>,
    /// La password non esce mai da Rust: la UI sa solo se esiste.
    pub has_lock: bool,
    pub lock_auto_minutes: u32,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct ProfilePatch {
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub description: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub color_main: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub color_secondary: Option<Option<String>>,
    #[ts(optional)]
    pub lock_auto_minutes: Option<u32>,
}

/// Tutto quello che serve per entrare in un profilo.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProfileSession {
    pub profile: Profile,
    pub settings: AppSettings,
    pub overrides: Vec<String>,
}

/// Che cosa se ne va con un profilo.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProfileDeleteImpact {
    /// Workspace visibili solo in questo profilo: vengono eliminati.
    pub workspaces_deleted: Vec<Crumb>,
    /// Workspace visibili anche in altri profili: restano.
    pub workspaces_kept: u32,
    /// Nodi eliminati in totale (workspace compresi).
    pub nodes_deleted: u32,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BootstrapPayload {
    pub is_first_run: bool,
    pub app_version: String,
    pub db_path: String,
    pub system_locale: String,
    pub profiles: Vec<Profile>,
    /// Risolto dal backend: se punta a un profilo cancellato ricade sul primo.
    pub active_profile_id: Option<String>,
    /// Gia' effettive per il profilo attivo (globali + override).
    pub settings: AppSettings,
    pub profile_overrides: Vec<String>,
    /// `mica` (Windows 11) oppure `solid`: con `solid` l'interfaccia dipinge
    /// tinte opache anche dove altrimenti lascerebbe vedere il materiale.
    pub window_material: String,
}

/* ==================================================================== nodi */

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub description: Option<String>,
    pub aliases: Option<String>,
    pub icon: Option<String>,
    pub color_main: Option<String>,
    pub color_secondary: Option<String>,
    pub cover_asset_id: Option<String>,
    pub cover_focus_x: f64,
    pub cover_focus_y: f64,
    /// Flag proprio; lo stato effettivo e' in `ResolvedProtection`.
    pub is_protected: bool,
    /// Valore proprio; `None` eredita (vedi `ResolvedCaution`).
    pub caution: Option<Caution>,
    pub url: Option<String>,
    pub path: Option<String>,
    pub enabled: bool,
    pub open_mode: Option<OpenMode>,
    pub browser_tool_id: Option<String>,
    pub browser_profile: Option<String>,
    pub created_by_profile_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

/// Un nodo come figlio di un padre preciso: l'ordine e il "fissato" sono
/// della relazione, non del nodo.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NodeEntry {
    pub node: Node,
    pub sort_order: f64,
    pub is_pinned: bool,
    pub child_count: u32,
    /// Quanti padri ha il nodo: > 1 solo per un progetto condiviso.
    pub parent_count: u32,
}

/// Dati per creare un nodo. I campi specifici valgono solo per il loro tipo.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NewNode {
    pub kind: NodeKind,
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub icon: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color_main: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub url: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub path: Option<String>,
}

#[cfg(test)]
impl NewNode {
    pub fn named(kind: NodeKind, name: &str) -> Self {
        Self {
            kind,
            name: name.to_string(),
            description: None,
            icon: None,
            color_main: None,
            url: None,
            path: None,
        }
    }
}

/// Modifica parziale: un campo assente non si tocca, `null` lo svuota.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct NodePatch {
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub description: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub aliases: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub icon: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub color_main: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub color_secondary: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub cover_asset_id: Option<Option<String>>,
    #[ts(optional)]
    pub cover_focus_x: Option<f64>,
    #[ts(optional)]
    pub cover_focus_y: Option<f64>,
    #[ts(optional)]
    pub is_protected: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub caution: Option<Option<Caution>>,
    #[ts(optional)]
    pub url: Option<String>,
    #[ts(optional)]
    pub path: Option<String>,
    #[ts(optional)]
    pub enabled: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub open_mode: Option<Option<OpenMode>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub browser_tool_id: Option<Option<String>>,
    #[serde(deserialize_with = "nullable")]
    #[ts(optional)]
    pub browser_profile: Option<Option<String>>,
}

/// Un tratto del percorso ("Lavoro › SpecialHub › Backend").
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Crumb {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub icon: Option<String>,
    pub color_main: Option<String>,
}

impl From<&Node> for Crumb {
    fn from(node: &Node) -> Self {
        Self {
            id: node.id.clone(),
            kind: node.kind,
            name: node.name.clone(),
            icon: node.icon.clone(),
            color_main: node.color_main.clone(),
        }
    }
}

/* ============================================================= ereditarieta' */

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResolvedProtection {
    pub is_protected: bool,
    /// Il flag e' impostato sul nodo stesso.
    pub is_own: bool,
    /// Il nodo protetto piu' vicino da cui arriva la protezione, se non e' proprio.
    pub inherited_from: Option<Crumb>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResolvedCaution {
    pub level: Caution,
    pub is_own: bool,
    /// Il nodo che impone il livello, se ereditato.
    pub inherited_from: Option<Crumb>,
}

/// Tutto cio' che serve per disegnare la pagina di un nodo.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NodeView {
    pub node: Node,
    /// Dalla radice al nodo, lungo il workspace da cui lo si guarda.
    pub breadcrumb: Vec<Crumb>,
    /// Tutti i workspace in cui il nodo compare (piu' di uno se il suo
    /// progetto e' condiviso).
    pub workspaces: Vec<Crumb>,
    pub children: Vec<NodeEntry>,
    pub protection: ResolvedProtection,
    pub caution: ResolvedCaution,
    pub tags: Vec<Tag>,
    pub is_favorite: bool,
    /// Protetto e sessione bloccata: il nodo arriva senza contenuto (niente
    /// figli, indirizzo, percorso, descrizione, tag).
    pub locked: bool,
}

/* ===================================================== workspace e profili */

/// Un workspace come lo vede un profilo.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceEntry {
    pub node: Node,
    pub sort_order: f64,
    pub is_default: bool,
    pub last_route: Option<String>,
    pub last_opened_at: Option<String>,
    pub project_count: u32,
    /// In quanti profili e' visibile.
    pub profile_count: u32,
}

/* ============================================================ cancellazione */

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KindCount {
    pub kind: NodeKind,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DeleteImpact {
    /// Quanti nodi spariscono, per tipo (il nodo eliminato compreso).
    pub deleted: Vec<KindCount>,
    /// Progetti condivisi che restano negli altri workspace.
    pub detached: Vec<Crumb>,
}

/* ================================================== preferiti, recenti, tag */

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Favorite {
    pub node: Node,
    /// `None` = il nodo in se'; altrimenti la scorciatoia "oggetto + azione".
    pub action_id: Option<String>,
    pub tool_id: Option<String>,
    pub sort_order: f64,
    /// Workspace (visibili al profilo) in cui il nodo compare.
    pub workspace_ids: Vec<String>,
}

/// Un'azione usata di recente, pronta per essere rilanciata identica.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RecentAction {
    pub node: Node,
    pub action_id: String,
    pub tool_id: Option<String>,
    pub via_workspace_id: Option<String>,
    pub last_at: String,
    pub count: u32,
}

/* ========================================================= percorsi locali */

/// Che cosa c'e' dietro un percorso, secondo il disco in questo momento.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PathKind {
    File,
    Directory,
    /// Cartella con `.git`.
    Repository,
    /// Il percorso non esiste.
    Missing,
    /// Non ha risposto in tempo (tipicamente un disco di rete spento).
    Unavailable,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PathInfo {
    /// Il percorso come salvato.
    pub path: String,
    /// Con le variabili d'ambiente espanse.
    pub resolved: String,
    pub kind: PathKind,
    pub is_network: bool,
    pub size_bytes: Option<f64>,
    /// Secondi dall'epoca Unix.
    pub modified_at: Option<f64>,
    /// Minuscola, senza punto; solo per i file.
    pub extension: Option<String>,
    pub git_branch: Option<String>,
}

/* ================================================================ strumenti */

/// Un programma con cui eseguire le azioni: terminale, IDE o browser.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Tool {
    /// Stabile per gli strumenti rilevati ("ide:vscode"): le preferenze sopravvivono.
    pub id: String,
    pub kind: ToolKind,
    pub name: String,
    pub exe_path: String,
    /// `detected` | `custom`
    pub source: String,
    pub is_hidden: bool,
    /// L'eseguibile esiste ancora sul disco.
    pub available: bool,
}

/// Un profilo di un browser, letto dai suoi file locali.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BrowserProfile {
    /// Cio' che si passa al browser (cartella per Chromium, nome per Firefox).
    pub id: String,
    pub name: String,
}

/// Strumento preferito di un tipo, per un profilo o un nodo.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ToolPreferenceState {
    pub kind: ToolKind,
    /// Impostato proprio qui.
    pub own: Option<String>,
    /// Quello che verrebbe usato: il proprio, uno ereditato o il primo disponibile.
    pub effective: Option<String>,
}

/* =================================================================== azioni */

/// Che cosa succedera' eseguendo un'azione, prima di eseguirla.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActionPlan {
    pub action_id: String,
    pub node_name: String,
    /// Livello di conferma richiesto (il piu' severo fra gli elementi coinvolti).
    pub caution: Caution,
    /// Quante cose si apriranno.
    pub count: u32,
    pub tool: Option<Tool>,
    pub browser_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActionOutcome {
    pub opened: u32,
    pub tool_name: Option<String>,
    pub browser_profile: Option<String>,
}

/* ================================================================== ricerca */

/// L'azione che la ricerca propone per un risultato ("camunda term" →
/// terminale nel repository di Camunda).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SuggestedAction {
    pub action_id: String,
    pub tool_id: Option<String>,
    pub tool_name: Option<String>,
    /// L'elemento su cui eseguirla: il risultato stesso o, per un contenitore,
    /// il suo primo percorso.
    pub target: Node,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHit {
    pub node: Node,
    /// Dalla radice al nodo, lungo il workspace scelto (il corrente, se possibile).
    pub breadcrumb: Vec<Crumb>,
    pub workspace_id: String,
    pub score: f64,
    /// Intervalli `[inizio, fine)` del nome che corrispondono, in caratteri.
    pub highlights: Vec<(u32, u32)>,
    /// Campo che ha deciso la corrispondenza (`name`, `alias`, `tag`, `path`...).
    pub matched: String,
    pub action: Option<SuggestedAction>,
}

/* =============================================================== protezione */

/// Stato del blocco per il profilo attivo. La password non esce mai da Rust.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LockStatus {
    pub has_lock: bool,
    pub unlocked: bool,
    /// Elementi protetti visibili al profilo (compresi quelli dentro un contenitore protetto).
    pub protected_count: u32,
    /// Secondi prima di poter riprovare, dopo troppi tentativi sbagliati.
    pub retry_after_seconds: u32,
    /// Minuti di inattivita' prima del blocco automatico; 0 = mai.
    pub auto_minutes: u32,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UnlockOutcome {
    pub unlocked: bool,
    pub retry_after_seconds: u32,
}
