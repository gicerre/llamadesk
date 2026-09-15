//! Azioni: che cosa si apre, con quale strumento, e con quali cautele
//! (docs/REDESIGN.md § 8).
//!
//! Un'azione si esegue in due tempi. `plan` legge il database e il disco e
//! produce una lista di passi, senza effetti; il comando Tauri esegue i passi.
//! Cosi' le regole (conferma, eseguibili bloccati, scelta dello strumento) si
//! verificano con `cargo test` senza aprire niente.
//!
//! La barriera di conferma vive qui e non nel frontend: un elemento marcato
//! "chiedi conferma" non si apre senza conferma, da qualunque parte arrivi la
//! richiesta (clic, palette, recenti, Avvio).

use std::fs;
use std::path::Path;

use anyhow::{anyhow, Result};
use rusqlite::Connection;

use crate::db::repo::nodes;
use crate::domain::{ActionPlan, Caution, Node, NodeKind, OpenMode, ToolKind};
use crate::services::tools::{self, Launch, Roots, StoredTool};
use crate::services::{opener, paths, resolve};

/// Errore che il frontend riconosce: serve una conferma prima di procedere.
pub const CONFIRMATION_REQUIRED: &str = "confirmation_required";

pub mod ids {
    /// Link, gruppo di link o percorso con l'applicazione predefinita.
    pub const OPEN: &str = "open";
    /// Link o gruppo con un browser preciso; percorso con un IDE.
    pub const OPEN_WITH: &str = "open_with";
    pub const TERMINAL: &str = "terminal";
    pub const REVEAL: &str = "reveal";
    /// Pagina del repository remoto (`origin`) nel browser.
    pub const OPEN_REMOTE: &str = "open_remote";
}

/// Estensioni che LlamaDesk non avvia: aprire un file deve mostrare un
/// documento, mai eseguire un programma per un clic sbagliato.
const BLOCKED_EXTENSIONS: &[&str] = &[
    "exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi",
    "msp", "scr", "lnk", "pif", "cpl", "hta", "reg", "jar",
];

#[derive(Debug, Clone, PartialEq)]
pub enum Step {
    /// Indirizzo nel browser predefinito.
    Url(String),
    /// File o cartella con l'applicazione associata (cartella: Esplora risorse).
    Path(String),
    /// Seleziona l'elemento in Esplora risorse.
    Reveal(String),
    Spawn(Launch),
}

pub struct Request<'a> {
    pub profile_id: &'a str,
    pub node_id: &'a str,
    pub action_id: &'a str,
    pub tool_id: Option<&'a str>,
    pub via_workspace_id: Option<&'a str>,
}

#[derive(Debug)]
pub struct Plan {
    pub action_id: String,
    pub node: Node,
    pub caution: Caution,
    pub steps: Vec<Step>,
    pub tool: Option<StoredTool>,
    pub browser_profile: Option<String>,
    /// Lo strumento e' stato scelto esplicitamente: i recenti lo ricordano.
    pub explicit_tool: bool,
    pub via_workspace_id: Option<String>,
}

impl Plan {
    pub fn count(&self) -> u32 {
        self.steps.len().max(match self.steps.first() {
            Some(Step::Spawn(launch)) => launch.args.iter().filter(|arg| is_url(arg)).count(),
            _ => 0,
        }) as u32
    }

    pub fn view(&self) -> ActionPlan {
        ActionPlan {
            action_id: self.action_id.clone(),
            node_name: self.node.name.clone(),
            caution: self.caution,
            count: self.count(),
            tool: self.tool.as_ref().map(StoredTool::to_tool),
            browser_profile: self.browser_profile.clone(),
        }
    }

    /// La barriera: `Confirm` vuole una conferma qualsiasi, `TypeName` il nome
    /// dell'elemento (senza distinguere maiuscole e spazi ai lati).
    pub fn check_confirmation(&self, confirmation: Option<&str>) -> Result<()> {
        match (self.caution, confirmation) {
            (Caution::None, _) => Ok(()),
            (Caution::Confirm, Some(_)) => Ok(()),
            (Caution::TypeName, Some(typed))
                if typed.trim().to_lowercase() == self.node.name.trim().to_lowercase() =>
            {
                Ok(())
            }
            _ => Err(anyhow!(CONFIRMATION_REQUIRED)),
        }
    }
}

fn is_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://") || value.starts_with("mailto:")
}

pub fn plan(conn: &Connection, roots: &Roots, request: &Request<'_>) -> Result<Plan> {
    let node = nodes::get(conn, request.node_id)?;
    if !resolve::is_visible(conn, request.profile_id, &node.id)? {
        return Err(anyhow!("elemento non visibile nel profilo attivo"));
    }

    let via = match request.via_workspace_id {
        Some(via) => Some(via.to_string()),
        None => resolve::context_chain(conn, request.profile_id, &node.id, None)?
            .last()
            .filter(|root| root.kind == NodeKind::Workspace)
            .map(|root| root.id.clone()),
    };

    let mut plan = Plan {
        action_id: request.action_id.to_string(),
        caution: Caution::None,
        steps: Vec::new(),
        tool: None,
        browser_profile: None,
        explicit_tool: request.tool_id.is_some(),
        via_workspace_id: via,
        node,
    };

    match (plan.node.kind, request.action_id) {
        (NodeKind::Link | NodeKind::LinkGroup, ids::OPEN | ids::OPEN_WITH) => {
            plan_links(conn, roots, request, &mut plan)?;
        }
        (NodeKind::Path, ids::OPEN) => {
            let path = existing_path(&plan.node)?;
            if Path::new(&path).is_file() && is_blocked(&path) {
                return Err(anyhow!(
                    "per sicurezza LlamaDesk non avvia programmi e script: usa Mostra in Esplora risorse"
                ));
            }
            plan.steps.push(Step::Path(path));
        }
        (NodeKind::Path, ids::OPEN_WITH) => {
            let path = existing_path(&plan.node)?;
            let tool = pick_tool(conn, request, ToolKind::Ide)?;
            plan.steps
                .push(Step::Spawn(tools::launch_for_path(&tool, &path)));
            plan.tool = Some(tool);
        }
        (NodeKind::Path, ids::TERMINAL) => {
            let path = existing_path(&plan.node)?;
            let directory = if Path::new(&path).is_dir() {
                path
            } else {
                Path::new(&path)
                    .parent()
                    .map(|parent| parent.to_string_lossy().into_owned())
                    .ok_or_else(|| anyhow!("il percorso non ha una cartella"))?
            };
            let tool = pick_tool(conn, request, ToolKind::Terminal)?;
            plan.steps
                .push(Step::Spawn(tools::launch_for_path(&tool, &directory)));
            plan.tool = Some(tool);
        }
        (NodeKind::Path, ids::REVEAL) => {
            plan.steps.push(Step::Reveal(existing_path(&plan.node)?));
        }
        (NodeKind::Path, ids::OPEN_REMOTE) => {
            let path = existing_path(&plan.node)?;
            let remote = remote_url(Path::new(&path))
                .ok_or_else(|| anyhow!("il repository non ha un remoto 'origin' apribile"))?;
            plan.steps.push(Step::Url(opener::validate(&remote)?));
        }
        (kind, action) => {
            return Err(anyhow!(
                "l'azione '{action}' non vale per un elemento di tipo {kind}"
            ));
        }
    }

    // Mostrare un file in Esplora risorse non apre niente: niente conferma.
    if request.action_id != ids::REVEAL {
        plan.caution = caution_for(conn, &plan.node)?;
    }

    Ok(plan)
}

/* ------------------------------------------------------------------- link */

fn plan_links(
    conn: &Connection,
    roots: &Roots,
    request: &Request<'_>,
    plan: &mut Plan,
) -> Result<()> {
    let urls: Vec<String> = match plan.node.kind {
        NodeKind::Link => vec![opener::validate(
            plan.node.url.as_deref().unwrap_or_default(),
        )?],
        _ => enabled_links(conn, &plan.node.id)?
            .iter()
            .map(|link| opener::validate(link.url.as_deref().unwrap_or_default()))
            .collect::<Result<_>>()?,
    };
    if urls.is_empty() {
        return Err(anyhow!("il gruppo non ha link attivi"));
    }

    let node = &plan.node;
    let new_window = node.open_mode == Some(OpenMode::NewWindow);

    // Quale browser: quello chiesto, quello salvato sull'elemento, oppure
    // (se servono profilo o nuova finestra, che il sistema non sa chiedere)
    // il browser preferito. Altrimenti il browser predefinito di Windows.
    let tool = if request.tool_id.is_some() {
        Some(pick_tool(conn, request, ToolKind::Browser)?)
    } else if let Some(saved) = &node.browser_tool_id {
        let tool = tools::get(conn, saved)?;
        if !tool.to_tool().available {
            return Err(anyhow!(
                "{} non e' piu' installato: scegli un altro browser",
                tool.name
            ));
        }
        Some(tool)
    } else if new_window || node.browser_profile.is_some() {
        Some(pick_tool(conn, request, ToolKind::Browser)?)
    } else {
        None
    };

    let Some(tool) = tool else {
        plan.steps = urls.into_iter().map(Step::Url).collect();
        return Ok(());
    };

    // Il profilo appartiene al browser salvato sull'elemento: con un altro
    // browser non ha senso.
    let profile = node.browser_profile.as_deref().filter(|_| {
        node.browser_tool_id
            .as_deref()
            .map_or(true, |saved| saved == tool.id)
    });
    if let Some(profile) = profile {
        let known = tools::browser_profiles(&tool.id, roots);
        if !known.iter().any(|candidate| candidate.id == profile) {
            return Err(anyhow!(
                "il profilo '{profile}' non esiste piu' in {}",
                tool.name
            ));
        }
        plan.browser_profile = known
            .into_iter()
            .find(|candidate| candidate.id == profile)
            .map(|candidate| candidate.name);
    }

    plan.steps.push(Step::Spawn(tools::launch_for_urls(
        &tool, &urls, new_window, profile,
    )));
    plan.tool = Some(tool);
    Ok(())
}

fn enabled_links(conn: &Connection, group_id: &str) -> Result<Vec<Node>> {
    Ok(nodes::children(conn, group_id, false)?
        .into_iter()
        .map(|entry| entry.node)
        .filter(|node| node.kind == NodeKind::Link && node.enabled)
        .collect())
}

/// Il livello piu' severo fra l'elemento e i link che aprira'.
fn caution_for(conn: &Connection, node: &Node) -> Result<Caution> {
    let mut level = resolve::caution(conn, &node.id)?.level;
    if node.kind == NodeKind::LinkGroup {
        for link in enabled_links(conn, &node.id)? {
            level = level.max(resolve::caution(conn, &link.id)?.level);
        }
    }
    Ok(level)
}

/* -------------------------------------------------------------- strumenti */

fn pick_tool(conn: &Connection, request: &Request<'_>, kind: ToolKind) -> Result<StoredTool> {
    if let Some(id) = request.tool_id {
        let tool = tools::get(conn, id)?;
        if tool.kind != kind {
            return Err(anyhow!("'{}' non si usa per questa azione", tool.name));
        }
        if !tool.to_tool().available {
            return Err(anyhow!("{} non e' piu' installato", tool.name));
        }
        return Ok(tool);
    }

    tools::effective(
        conn,
        request.profile_id,
        Some(request.node_id),
        request.via_workspace_id,
        kind,
    )?
    .ok_or_else(|| {
        anyhow!(match kind {
            ToolKind::Ide => "nessun IDE trovato: aggiungine uno in Impostazioni › Strumenti",
            ToolKind::Terminal => "nessun terminale trovato",
            ToolKind::Browser =>
                "nessun browser trovato: aggiungine uno in Impostazioni › Strumenti",
        })
    })
}

/* --------------------------------------------------------------- percorsi */

fn existing_path(node: &Node) -> Result<String> {
    let raw = node.path.as_deref().unwrap_or_default();
    let path = paths::expand(raw.trim());
    if !Path::new(&path).exists() {
        return Err(anyhow!("percorso non trovato: {path}"));
    }
    Ok(path)
}

fn is_blocked(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            BLOCKED_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
}

/// Indirizzo web del remoto `origin`, letto da `.git/config` senza eseguire git.
pub fn remote_url(directory: &Path) -> Option<String> {
    let dot_git = directory.join(".git");
    let git_dir = if dot_git.is_dir() {
        dot_git
    } else {
        // Worktree: `.git` punta alla cartella del worktree, la config e' in
        // quella comune (due livelli sopra: `<repo>/.git/worktrees/<nome>`).
        let pointer = fs::read_to_string(&dot_git).ok()?;
        let target = Path::new(pointer.trim().strip_prefix("gitdir:")?.trim()).to_path_buf();
        let target = if target.is_absolute() {
            target
        } else {
            directory.join(target)
        };
        target.parent()?.parent()?.to_path_buf()
    };

    let config = fs::read_to_string(git_dir.join("config")).ok()?;
    let mut in_origin = false;
    for line in config.lines().map(str::trim) {
        if line.starts_with('[') {
            in_origin = line == r#"[remote "origin"]"#;
        } else if in_origin {
            if let Some(value) = line.strip_prefix("url").map(str::trim_start) {
                if let Some(value) = value.strip_prefix('=') {
                    return web_url_for_remote(value.trim());
                }
            }
        }
    }
    None
}

fn web_url_for_remote(remote: &str) -> Option<String> {
    let trimmed = remote.trim_end_matches('/').trim_end_matches(".git");
    let web = if let Some(rest) = trimmed.strip_prefix("git@") {
        // git@github.com:utente/repo
        let (host, path) = rest.split_once(':')?;
        format!("https://{host}/{path}")
    } else if let Some(rest) = trimmed.strip_prefix("ssh://") {
        // ssh://git@host:22/utente/repo
        let rest = rest.split_once('@').map_or(rest, |(_, after)| after);
        let (host, path) = rest.split_once('/')?;
        let host = host.split(':').next()?;
        format!("https://{host}/{path}")
    } else if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        // Le credenziali eventualmente incluse non finiscono nel browser.
        let (scheme, rest) = trimmed.split_once("://")?;
        let rest = rest.split_once('@').map_or(rest, |(_, after)| after);
        format!("{scheme}://{rest}")
    } else {
        return None;
    };
    Some(web)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodePatch;
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir =
                std::env::temp_dir().join(format!("llamadesk-actions-{}", uuid::Uuid::now_v7()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn file(&self, relative: &str, content: &str) -> String {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, content).unwrap();
            path.to_string_lossy().into_owned()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn request<'a>(profile: &'a str, node: &'a str, action: &'a str) -> Request<'a> {
        Request {
            profile_id: profile,
            node_id: node,
            action_id: action,
            tool_id: None,
            via_workspace_id: None,
        }
    }

    fn patch(conn: &Connection, id: &str, patch: NodePatch) {
        nodes::update(conn, id, &patch).unwrap();
    }

    fn path_node(conn: &Connection, profile: &str, parent: &str, path: &str) -> String {
        let id = child(conn, profile, parent, NodeKind::Path, "percorso");
        conn.execute("UPDATE nodes SET path = ?2 WHERE id = ?1", [&id, path])
            .unwrap();
        id
    }

    #[test]
    fn a_group_opens_its_enabled_links_in_the_default_browser() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let group = child(&conn, &profile, &ws, NodeKind::LinkGroup, "Mattina");
        child(&conn, &profile, &group, NodeKind::Link, "posta");
        let off = child(&conn, &profile, &group, NodeKind::Link, "spento");
        child(&conn, &profile, &group, NodeKind::Link, "calendario");
        patch(
            &conn,
            &off,
            NodePatch {
                enabled: Some(false),
                ..NodePatch::default()
            },
        );

        let plan = plan(
            &conn,
            &Roots::default(),
            &request(&profile, &group, ids::OPEN),
        )
        .unwrap();
        assert_eq!(
            plan.steps,
            vec![
                Step::Url("https://example.com/posta".into()),
                Step::Url("https://example.com/calendario".into()),
            ]
        );
        assert_eq!(plan.view().count, 2);
        assert_eq!(plan.via_workspace_id.as_deref(), Some(ws.as_str()));
    }

    #[test]
    fn caution_is_enforced_and_type_name_needs_the_name() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let prod = child(&conn, &profile, &ws, NodeKind::Section, "PROD");
        let group = child(&conn, &profile, &ws, NodeKind::LinkGroup, "Console");
        let admin = child(&conn, &profile, &group, NodeKind::Link, "admin");
        let db = child(&conn, &profile, &prod, NodeKind::Link, "pgAdmin");

        let open =
            |id: &str| plan(&conn, &Roots::default(), &request(&profile, id, ids::OPEN)).unwrap();
        assert!(open(&db).check_confirmation(None).is_ok());

        patch(
            &conn,
            &prod,
            NodePatch {
                caution: Some(Some(Caution::TypeName)),
                ..NodePatch::default()
            },
        );
        let guarded = open(&db);
        assert_eq!(guarded.caution, Caution::TypeName);
        assert_eq!(
            guarded.check_confirmation(None).unwrap_err().to_string(),
            CONFIRMATION_REQUIRED
        );
        assert!(guarded.check_confirmation(Some("PROD")).is_err());
        assert!(guarded.check_confirmation(Some("  pgadmin ")).is_ok());

        // Un link del gruppo che chiede conferma rende prudente tutto il gruppo.
        patch(
            &conn,
            &admin,
            NodePatch {
                caution: Some(Some(Caution::Confirm)),
                ..NodePatch::default()
            },
        );
        let group_plan = open(&group);
        assert_eq!(group_plan.caution, Caution::Confirm);
        assert!(group_plan.check_confirmation(Some("")).is_ok());
    }

    #[test]
    fn paths_block_executables_but_can_be_revealed() {
        let scratch = Scratch::new();
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let script = path_node(&conn, &profile, &ws, &scratch.file("deploy.PS1", "x"));
        let doc = path_node(&conn, &profile, &ws, &scratch.file("note.md", "x"));
        let missing = path_node(&conn, &profile, &ws, r"C:\non\esiste\davvero");

        let roots = Roots::default();
        assert!(plan(&conn, &roots, &request(&profile, &script, ids::OPEN)).is_err());
        assert!(matches!(
            plan(&conn, &roots, &request(&profile, &script, ids::REVEAL))
                .unwrap()
                .steps[0],
            Step::Reveal(_)
        ));
        assert!(matches!(
            plan(&conn, &roots, &request(&profile, &doc, ids::OPEN))
                .unwrap()
                .steps[0],
            Step::Path(_)
        ));
        assert!(plan(&conn, &roots, &request(&profile, &missing, ids::OPEN)).is_err());
        // Un'azione che non vale per il tipo si rifiuta.
        assert!(plan(&conn, &roots, &request(&profile, &doc, ids::OPEN_REMOTE)).is_err());
        assert!(plan(&conn, &roots, &request(&profile, &ws, ids::OPEN)).is_err());
    }

    #[test]
    fn terminal_and_ide_use_the_inherited_preference() {
        let scratch = Scratch::new();
        let exe = |name: &str| scratch.file(name, "");
        let (conn, profile) = database();
        for (id, kind, path, args) in [
            (
                "terminal:cmd",
                "terminal",
                exe("cmd.exe"),
                r#"["/K","cd","/d","{path}"]"#,
            ),
            ("ide:vscode", "ide", exe("Code.exe"), r#"["{path}"]"#),
            ("ide:cursor", "ide", exe("Cursor.exe"), r#"["{path}"]"#),
        ] {
            conn.execute(
                "INSERT INTO tools (id, kind, name, exe_path, args_template, source, detected_at)
                 VALUES (?1, ?2, ?1, ?3, ?4, 'detected', datetime('now'))",
                [id, kind, &path, args],
            )
            .unwrap();
        }

        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let file = scratch.file(r"repo\src\main.rs", "");
        let repo = path_node(&conn, &profile, &project, &file);
        tools::set_preference(
            &conn,
            &profile,
            Some(&project),
            ToolKind::Ide,
            Some("ide:cursor"),
        )
        .unwrap();

        let roots = Roots::default();
        let ide = plan(&conn, &roots, &request(&profile, &repo, ids::OPEN_WITH)).unwrap();
        assert_eq!(ide.tool.as_ref().unwrap().id, "ide:cursor");
        assert!(!ide.explicit_tool);

        let terminal = plan(&conn, &roots, &request(&profile, &repo, ids::TERMINAL)).unwrap();
        let Step::Spawn(launch) = &terminal.steps[0] else {
            panic!("atteso un processo")
        };
        assert!(launch.console);
        assert!(
            launch.args.last().unwrap().ends_with("src"),
            "un file apre il terminale nella sua cartella"
        );

        let mut explicit = request(&profile, &repo, ids::OPEN_WITH);
        explicit.tool_id = Some("ide:vscode");
        let chosen = plan(&conn, &roots, &explicit).unwrap();
        assert_eq!(chosen.tool.as_ref().unwrap().id, "ide:vscode");
        assert!(chosen.explicit_tool);

        explicit.tool_id = Some("terminal:cmd");
        assert!(
            plan(&conn, &roots, &explicit).is_err(),
            "un terminale non e' un IDE"
        );
    }

    #[test]
    fn a_link_with_a_browser_profile_spawns_that_browser() {
        let scratch = Scratch::new();
        let chrome = scratch.file(r"PF\chrome.exe", "");
        scratch.file(
            r"Local\Google\Chrome\User Data\Local State",
            r#"{"profile":{"info_cache":{"Profile 2":{"name":"Cliente"}}}}"#,
        );
        let roots = Roots {
            local_app_data: Some(scratch.0.join("Local")),
            ..Roots::default()
        };

        let (conn, profile) = database();
        conn.execute(
            "INSERT INTO tools (id, kind, name, exe_path, args_template, source, detected_at)
             VALUES ('browser:chrome', 'browser', 'Google Chrome', ?1, '[\"{urls}\"]', 'detected', datetime('now'))",
            [&chrome],
        )
        .unwrap();
        let ws = workspace(&conn, &profile, "Clienti");
        let link = child(&conn, &profile, &ws, NodeKind::Link, "crm");
        conn.execute(
            "UPDATE nodes SET browser_tool_id = 'browser:chrome', browser_profile = 'Profile 2', open_mode = 'new_window'
              WHERE id = ?1",
            [&link],
        )
        .unwrap();

        let plan_link = |roots: &Roots| plan(&conn, roots, &request(&profile, &link, ids::OPEN));
        let planned = plan_link(&roots).unwrap();
        assert_eq!(planned.browser_profile.as_deref(), Some("Cliente"));
        let Step::Spawn(launch) = &planned.steps[0] else {
            panic!("atteso un processo")
        };
        assert_eq!(
            launch.args,
            vec![
                "--profile-directory=Profile 2",
                "--new-window",
                "https://example.com/crm"
            ]
        );
        assert_eq!(planned.view().count, 1);

        // Profilo sparito: meglio fermarsi che aprire con l'account sbagliato.
        assert!(plan_link(&Roots::default()).is_err());
    }

    #[test]
    fn hidden_workspaces_hide_their_actions() {
        let (conn, me) = database();
        conn.execute(
            "INSERT INTO profiles (id, name) VALUES ('demo', 'Demo')",
            [],
        )
        .unwrap();
        let ws = workspace(&conn, &me, "Personale");
        let link = child(&conn, &me, &ws, NodeKind::Link, "banca");

        assert!(plan(&conn, &Roots::default(), &request(&me, &link, ids::OPEN)).is_ok());
        assert!(plan(&conn, &Roots::default(), &request("demo", &link, ids::OPEN)).is_err());
    }

    #[test]
    fn remote_urls_become_web_addresses_without_credentials() {
        assert_eq!(
            web_url_for_remote("git@github.com:llama/desk.git").as_deref(),
            Some("https://github.com/llama/desk")
        );
        assert_eq!(
            web_url_for_remote("https://user:token@dev.azure.com/org/p/_git/repo").as_deref(),
            Some("https://dev.azure.com/org/p/_git/repo")
        );
        assert_eq!(
            web_url_for_remote("ssh://git@gitlab.local:2222/team/app.git").as_deref(),
            Some("https://gitlab.local/team/app")
        );
        assert_eq!(web_url_for_remote(r"C:\repos\bare.git"), None);

        let scratch = Scratch::new();
        scratch.file(
            r"app\.git\config",
            "[core]\n\tbare = false\n[remote \"upstream\"]\n\turl = git@github.com:altri/app.git\n[remote \"origin\"]\n\turl = git@github.com:io/app.git\n",
        );
        assert_eq!(
            remote_url(&scratch.0.join("app")).as_deref(),
            Some("https://github.com/io/app")
        );
    }
}
