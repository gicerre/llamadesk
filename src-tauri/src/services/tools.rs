//! Strumenti con cui eseguire le azioni: terminali, IDE, browser.
//!
//! Il rilevamento e' locale e in sola lettura: si cercano gli eseguibili nei
//! percorsi d'installazione noti di Windows, e i profili dei browser nei loro
//! file di configurazione. Nessun processo lanciato, nessuna rete.
//!
//! Le cartelle di sistema arrivano da `Roots`: nei test puntano a un albero
//! finto, cosi' il rilevamento si verifica senza dipendere dal PC.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::{BrowserProfile, Tool, ToolKind, ToolPreferenceState};
use crate::services::resolve;

/* ------------------------------------------------------------------ radici */

/// Le cartelle di sistema da cui partono i percorsi d'installazione.
#[derive(Debug, Clone, Default)]
pub struct Roots {
    pub local_app_data: Option<PathBuf>,
    pub app_data: Option<PathBuf>,
    pub program_files: Option<PathBuf>,
    pub program_files_x86: Option<PathBuf>,
    pub system_root: Option<PathBuf>,
}

impl Roots {
    pub fn from_env() -> Self {
        let var = |name: &str| std::env::var_os(name).map(PathBuf::from);
        Self {
            local_app_data: var("LOCALAPPDATA"),
            app_data: var("APPDATA"),
            program_files: var("ProgramFiles"),
            program_files_x86: var("ProgramFiles(x86)"),
            system_root: var("SystemRoot"),
        }
    }
}

#[derive(Clone, Copy)]
enum Base {
    LocalAppData,
    ProgramFiles,
    ProgramFilesX86,
    SystemRoot,
}

impl Base {
    fn resolve(self, roots: &Roots) -> Option<&PathBuf> {
        match self {
            Base::LocalAppData => roots.local_app_data.as_ref(),
            Base::ProgramFiles => roots.program_files.as_ref(),
            Base::ProgramFilesX86 => roots.program_files_x86.as_ref(),
            Base::SystemRoot => roots.system_root.as_ref(),
        }
    }
}

/* --------------------------------------------------------------- catalogo */

/// Segnaposto negli argomenti: `{path}` il percorso, `{path_ps}` il percorso
/// con gli apici raddoppiati (dentro una stringa PowerShell).
struct Candidate {
    id: &'static str,
    kind: ToolKind,
    name: &'static str,
    locations: &'static [(Base, &'static str)],
    args: &'static [&'static str],
}

/// L'ordine conta: a parita' di preferenza si propone il primo disponibile.
const CATALOG: &[Candidate] = &[
    Candidate {
        id: "terminal:wt",
        kind: ToolKind::Terminal,
        name: "Windows Terminal",
        locations: &[(Base::LocalAppData, r"Microsoft\WindowsApps\wt.exe")],
        args: &["-d", "{path}"],
    },
    Candidate {
        id: "terminal:pwsh",
        kind: ToolKind::Terminal,
        name: "PowerShell 7",
        locations: &[(Base::ProgramFiles, r"PowerShell\7\pwsh.exe")],
        args: &["-NoExit", "-WorkingDirectory", "{path}"],
    },
    Candidate {
        id: "terminal:powershell",
        kind: ToolKind::Terminal,
        name: "Windows PowerShell",
        locations: &[(
            Base::SystemRoot,
            r"System32\WindowsPowerShell\v1.0\powershell.exe",
        )],
        args: &[
            "-NoExit",
            "-Command",
            "Set-Location -LiteralPath '{path_ps}'",
        ],
    },
    Candidate {
        id: "terminal:cmd",
        kind: ToolKind::Terminal,
        name: "Prompt dei comandi",
        locations: &[(Base::SystemRoot, r"System32\cmd.exe")],
        args: &["/K", "cd", "/d", "{path}"],
    },
    Candidate {
        id: "terminal:gitbash",
        kind: ToolKind::Terminal,
        name: "Git Bash",
        locations: &[
            (Base::ProgramFiles, r"Git\git-bash.exe"),
            (Base::LocalAppData, r"Programs\Git\git-bash.exe"),
        ],
        args: &["--cd={path}"],
    },
    Candidate {
        id: "terminal:wsl",
        kind: ToolKind::Terminal,
        name: "WSL",
        locations: &[(Base::SystemRoot, r"System32\wsl.exe")],
        args: &["--cd", "{path}"],
    },
    Candidate {
        id: "ide:vscode",
        kind: ToolKind::Ide,
        name: "Visual Studio Code",
        locations: &[
            (Base::LocalAppData, r"Programs\Microsoft VS Code\Code.exe"),
            (Base::ProgramFiles, r"Microsoft VS Code\Code.exe"),
        ],
        args: &["{path}"],
    },
    Candidate {
        id: "ide:cursor",
        kind: ToolKind::Ide,
        name: "Cursor",
        locations: &[(Base::LocalAppData, r"Programs\cursor\Cursor.exe")],
        args: &["{path}"],
    },
    Candidate {
        id: "ide:zed",
        kind: ToolKind::Ide,
        name: "Zed",
        locations: &[(Base::LocalAppData, r"Programs\Zed\zed.exe")],
        args: &["{path}"],
    },
    Candidate {
        id: "ide:sublime",
        kind: ToolKind::Ide,
        name: "Sublime Text",
        locations: &[(Base::ProgramFiles, r"Sublime Text\sublime_text.exe")],
        args: &["{path}"],
    },
    Candidate {
        id: "ide:notepadpp",
        kind: ToolKind::Ide,
        name: "Notepad++",
        locations: &[(Base::ProgramFiles, r"Notepad++\notepad++.exe")],
        args: &["{path}"],
    },
    Candidate {
        id: "browser:chrome",
        kind: ToolKind::Browser,
        name: "Google Chrome",
        locations: &[
            (Base::ProgramFiles, r"Google\Chrome\Application\chrome.exe"),
            (
                Base::ProgramFilesX86,
                r"Google\Chrome\Application\chrome.exe",
            ),
            (Base::LocalAppData, r"Google\Chrome\Application\chrome.exe"),
        ],
        args: &["{urls}"],
    },
    Candidate {
        id: "browser:edge",
        kind: ToolKind::Browser,
        name: "Microsoft Edge",
        locations: &[
            (
                Base::ProgramFilesX86,
                r"Microsoft\Edge\Application\msedge.exe",
            ),
            (Base::ProgramFiles, r"Microsoft\Edge\Application\msedge.exe"),
        ],
        args: &["{urls}"],
    },
    Candidate {
        id: "browser:firefox",
        kind: ToolKind::Browser,
        name: "Mozilla Firefox",
        locations: &[
            (Base::ProgramFiles, r"Mozilla Firefox\firefox.exe"),
            (Base::ProgramFilesX86, r"Mozilla Firefox\firefox.exe"),
        ],
        args: &["{urls}"],
    },
    Candidate {
        id: "browser:brave",
        kind: ToolKind::Browser,
        name: "Brave",
        locations: &[
            (
                Base::ProgramFiles,
                r"BraveSoftware\Brave-Browser\Application\brave.exe",
            ),
            (
                Base::LocalAppData,
                r"BraveSoftware\Brave-Browser\Application\brave.exe",
            ),
        ],
        args: &["{urls}"],
    },
];

/// IDE JetBrains: si riconoscono dal nome dell'eseguibile, ovunque siano
/// installati (Toolbox o installer classico).
const JETBRAINS: &[(&str, &str, &str)] = &[
    ("idea64.exe", "ide:intellij", "IntelliJ IDEA"),
    ("webstorm64.exe", "ide:webstorm", "WebStorm"),
    ("pycharm64.exe", "ide:pycharm", "PyCharm"),
    ("rider64.exe", "ide:rider", "Rider"),
    ("goland64.exe", "ide:goland", "GoLand"),
    ("clion64.exe", "ide:clion", "CLion"),
    ("phpstorm64.exe", "ide:phpstorm", "PhpStorm"),
    ("datagrip64.exe", "ide:datagrip", "DataGrip"),
    ("rustrover64.exe", "ide:rustrover", "RustRover"),
];

/// Un eseguibile c'e'. Gli alias di esecuzione di Windows (`wt.exe` in
/// `WindowsApps`) sono reparse point che `is_file` non segue: basta che la voce
/// esista.
pub fn exists(path: &Path) -> bool {
    path.is_file() || fs::symlink_metadata(path).is_ok_and(|meta| !meta.is_dir())
}

/// Uno strumento trovato sul disco.
#[derive(Debug, Clone, PartialEq)]
pub struct Detected {
    pub id: String,
    pub kind: ToolKind,
    pub name: String,
    pub exe: PathBuf,
    pub args: Vec<String>,
}

pub fn detect(roots: &Roots) -> Vec<Detected> {
    let mut found = Vec::new();

    for candidate in CATALOG {
        let exe = candidate
            .locations
            .iter()
            .filter_map(|(root, relative)| root.resolve(roots).map(|base| base.join(relative)))
            .find(|path| exists(path));
        if let Some(exe) = exe {
            found.push(Detected {
                id: candidate.id.to_string(),
                kind: candidate.kind,
                name: candidate.name.to_string(),
                exe,
                args: candidate.args.iter().map(|arg| arg.to_string()).collect(),
            });
        }
        // Gli IDE JetBrains vanno subito dopo VS Code nell'ordine proposto.
        if candidate.id == "ide:vscode" {
            found.extend(detect_jetbrains(roots));
        }
    }

    found.extend(detect_visual_studio(roots));
    found
}

/// Cartelle in cui cercare `bin\<ide>64.exe`: installer classico e Toolbox.
fn jetbrains_homes(roots: &Roots) -> Vec<PathBuf> {
    let mut parents = Vec::new();
    if let Some(program_files) = &roots.program_files {
        parents.push(program_files.join("JetBrains"));
    }
    if let Some(local) = &roots.local_app_data {
        parents.push(local.join("Programs"));
        parents.push(local.join(r"JetBrains\Toolbox\apps"));
    }

    let mut homes = Vec::new();
    for parent in parents {
        let Ok(entries) = fs::read_dir(&parent) else {
            continue;
        };
        let mut children: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
        children.sort();
        homes.extend(children.into_iter().filter(|path| path.is_dir()));
    }
    homes
}

fn detect_jetbrains(roots: &Roots) -> Vec<Detected> {
    let homes = jetbrains_homes(roots);
    let mut found = Vec::new();
    for (exe_name, id, name) in JETBRAINS {
        // Installazioni piu' recenti hanno nomi di cartella piu' "alti": si
        // prende l'ultima in ordine alfabetico.
        let exe = homes
            .iter()
            .map(|home| home.join("bin").join(exe_name))
            .rfind(|path| path.is_file());
        if let Some(exe) = exe {
            found.push(Detected {
                id: id.to_string(),
                kind: ToolKind::Ide,
                name: name.to_string(),
                exe,
                args: vec!["{path}".into()],
            });
        }
    }
    found
}

fn detect_visual_studio(roots: &Roots) -> Vec<Detected> {
    let Some(program_files) = &roots.program_files else {
        return Vec::new();
    };
    let base = program_files.join(r"Microsoft Visual Studio\2022");
    let Ok(editions) = fs::read_dir(&base) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = editions
        .flatten()
        .map(|edition| edition.path().join(r"Common7\IDE\devenv.exe"))
        .filter(|path| path.is_file())
        .collect();
    paths.sort();
    paths
        .pop()
        .map(|exe| Detected {
            id: "ide:visualstudio".into(),
            kind: ToolKind::Ide,
            name: "Visual Studio 2022".into(),
            exe,
            args: vec!["{path}".into()],
        })
        .into_iter()
        .collect()
}

/* ------------------------------------------------------ profili dei browser */

fn chromium_user_data(id: &str, roots: &Roots) -> Option<PathBuf> {
    let local = roots.local_app_data.as_ref()?;
    Some(match id {
        "browser:chrome" => local.join(r"Google\Chrome\User Data"),
        "browser:edge" => local.join(r"Microsoft\Edge\User Data"),
        "browser:brave" => local.join(r"BraveSoftware\Brave-Browser\User Data"),
        _ => return None,
    })
}

pub fn is_chromium(id: &str) -> bool {
    matches!(id, "browser:chrome" | "browser:edge" | "browser:brave")
}

/// Profili di un browser rilevato. Si leggono solo i nomi dei profili.
pub fn browser_profiles(id: &str, roots: &Roots) -> Vec<BrowserProfile> {
    if let Some(user_data) = chromium_user_data(id, roots) {
        let Ok(raw) = fs::read_to_string(user_data.join("Local State")) else {
            return Vec::new();
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
            return Vec::new();
        };
        let Some(cache) = json
            .pointer("/profile/info_cache")
            .and_then(|value| value.as_object())
        else {
            return Vec::new();
        };
        let mut profiles: Vec<BrowserProfile> = cache
            .iter()
            .map(|(directory, info)| BrowserProfile {
                id: directory.clone(),
                name: info
                    .get("name")
                    .and_then(|name| name.as_str())
                    .unwrap_or(directory)
                    .to_string(),
            })
            .collect();
        // "Default" per primo, poi "Profile 1", "Profile 2"...
        profiles.sort_by_key(|profile| {
            let number = profile
                .id
                .strip_prefix("Profile ")
                .and_then(|n| n.parse::<u32>().ok());
            (
                profile.id != "Default",
                number.unwrap_or(u32::MAX),
                profile.id.clone(),
            )
        });
        return profiles;
    }

    if id == "browser:firefox" {
        let Some(app_data) = &roots.app_data else {
            return Vec::new();
        };
        let Ok(ini) = fs::read_to_string(app_data.join(r"Mozilla\Firefox\profiles.ini")) else {
            return Vec::new();
        };
        return ini
            .lines()
            .filter_map(|line| line.trim().strip_prefix("Name="))
            .map(|name| BrowserProfile {
                id: name.to_string(),
                name: name.to_string(),
            })
            .collect();
    }

    Vec::new()
}

/* ---------------------------------------------------------------- comandi */

/// Un processo da avviare: eseguibile e argomenti separati, mai una stringa
/// di shell.
#[derive(Debug, Clone, PartialEq)]
pub struct Launch {
    pub exe: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    /// I terminali hanno bisogno di una finestra di console propria.
    pub console: bool,
}

fn stored_args(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw)
        .unwrap_or_else(|_| raw.split_whitespace().map(str::to_string).collect())
}

fn wrap_script(exe: &str, args: Vec<String>, console: bool, cwd: Option<String>) -> Launch {
    let lower = exe.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut wrapped = vec!["/c".to_string(), exe.to_string()];
        wrapped.extend(args);
        return Launch {
            exe: "cmd.exe".into(),
            args: wrapped,
            cwd,
            console,
        };
    }
    Launch {
        exe: exe.to_string(),
        args,
        cwd,
        console,
    }
}

/// Comando per aprire un percorso con uno strumento (IDE o terminale).
pub fn launch_for_path(tool: &StoredTool, path: &str) -> Launch {
    let template = stored_args(&tool.args_template);
    let mentions_path = template.iter().any(|arg| arg.contains("{path"));
    let mut args: Vec<String> = template
        .into_iter()
        .map(|arg| {
            arg.replace("{path_ps}", &path.replace('\'', "''"))
                .replace("{path}", path)
        })
        .collect();
    // Uno strumento personalizzato senza segnaposto riceve il percorso in coda.
    if !mentions_path {
        args.push(path.to_string());
    }
    let cwd = if tool.kind == ToolKind::Terminal && Path::new(path).is_dir() {
        Some(path.to_string())
    } else {
        None
    };
    wrap_script(&tool.exe_path, args, tool.kind == ToolKind::Terminal, cwd)
}

/// Comando per aprire indirizzi con un browser, con profilo e nuova finestra.
pub fn launch_for_urls(
    tool: &StoredTool,
    urls: &[String],
    new_window: bool,
    profile: Option<&str>,
) -> Launch {
    let mut args = Vec::new();

    if is_chromium(&tool.id) {
        if let Some(profile) = profile {
            args.push(format!("--profile-directory={profile}"));
        }
        if new_window {
            args.push("--new-window".into());
        }
        args.extend(urls.iter().cloned());
    } else if tool.id == "browser:firefox" {
        if let Some(profile) = profile {
            args.push("-P".into());
            args.push(profile.to_string());
        }
        for (index, url) in urls.iter().enumerate() {
            args.push(
                if new_window && index == 0 {
                    "-new-window"
                } else {
                    "-new-tab"
                }
                .into(),
            );
            args.push(url.clone());
        }
    } else {
        for arg in stored_args(&tool.args_template) {
            if arg == "{urls}" {
                args.extend(urls.iter().cloned());
            } else {
                args.push(arg);
            }
        }
    }

    wrap_script(&tool.exe_path, args, false, None)
}

/* ------------------------------------------------------------- database */

/// Uno strumento come salvato, con gli argomenti per avviarlo.
#[derive(Debug, Clone)]
pub struct StoredTool {
    pub id: String,
    pub kind: ToolKind,
    pub name: String,
    pub exe_path: String,
    pub args_template: String,
    pub source: String,
    pub is_hidden: bool,
}

impl StoredTool {
    pub fn to_tool(&self) -> Tool {
        Tool {
            id: self.id.clone(),
            kind: self.kind,
            name: self.name.clone(),
            exe_path: self.exe_path.clone(),
            source: self.source.clone(),
            is_hidden: self.is_hidden,
            available: exists(Path::new(&self.exe_path)),
        }
    }
}

fn map_tool(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredTool> {
    Ok(StoredTool {
        id: row.get("id")?,
        kind: row.get("kind")?,
        name: row.get("name")?,
        exe_path: row.get("exe_path")?,
        args_template: row.get("args_template")?,
        source: row.get("source")?,
        is_hidden: row.get("is_hidden")?,
    })
}

/// Allinea la tabella a cio' che e' stato trovato. Uno strumento rilevato che
/// non c'e' piu' resta nella tabella (senza `detected_at`): le preferenze che
/// lo nominano tornano valide se lo si reinstalla.
pub fn sync(conn: &Connection, detected: &[Detected]) -> Result<()> {
    crate::db::atomic(conn, |conn| {
        conn.execute(
            "UPDATE tools SET detected_at = NULL WHERE source = 'detected'",
            [],
        )?;
        for tool in detected {
            conn.execute(
                "INSERT INTO tools (id, kind, name, exe_path, args_template, source, detected_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'detected', datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   kind = excluded.kind, name = excluded.name, exe_path = excluded.exe_path,
                   args_template = excluded.args_template, detected_at = excluded.detected_at",
                params![
                    tool.id,
                    tool.kind,
                    tool.name,
                    tool.exe.to_string_lossy(),
                    serde_json::to_string(&tool.args)?,
                ],
            )?;
        }
        Ok(())
    })
}

/// Strumenti utilizzabili: rilevati nell'ultimo controllo, o aggiunti a mano.
/// L'ordine e' quello del catalogo (id di inserimento), poi i personalizzati.
pub fn list(conn: &Connection, include_hidden: bool) -> Result<Vec<StoredTool>> {
    let mut statement = conn.prepare(
        "SELECT * FROM tools
          WHERE (source = 'custom' OR detected_at IS NOT NULL) AND (?1 OR is_hidden = 0)
          ORDER BY source = 'custom', rowid",
    )?;
    let rows = statement.query_map([include_hidden], map_tool)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get(conn: &Connection, id: &str) -> Result<StoredTool> {
    conn.query_row("SELECT * FROM tools WHERE id = ?1", [id], map_tool)
        .optional()?
        .ok_or_else(|| anyhow!("strumento non trovato: {id}"))
}

/// Divide gli argomenti scritti dall'utente, rispettando le virgolette:
/// `--profile "Il mio" {path}` diventa tre argomenti.
pub fn split_args(raw: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut started = false;
    for character in raw.chars() {
        match character {
            '"' => {
                quoted = !quoted;
                started = true;
            }
            c if c.is_whitespace() && !quoted => {
                if started {
                    args.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            c => {
                current.push(c);
                started = true;
            }
        }
    }
    if started {
        args.push(current);
    }
    args
}

/// Aggiunge uno strumento scelto dall'utente.
pub fn add_custom(
    conn: &Connection,
    kind: ToolKind,
    name: &str,
    exe_path: &str,
    args: &str,
) -> Result<StoredTool> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("dai un nome allo strumento"));
    }
    let exe_path = exe_path.trim().trim_matches('"');
    if !exists(Path::new(exe_path)) {
        return Err(anyhow!("eseguibile non trovato: {exe_path}"));
    }
    let mut template = split_args(args);
    if template.is_empty() {
        template.push(
            if kind == ToolKind::Browser {
                "{urls}"
            } else {
                "{path}"
            }
            .into(),
        );
    }
    let id = format!("custom:{}", uuid::Uuid::now_v7());
    conn.execute(
        "INSERT INTO tools (id, kind, name, exe_path, args_template, source)
         VALUES (?1, ?2, ?3, ?4, ?5, 'custom')",
        params![id, kind, name, exe_path, serde_json::to_string(&template)?],
    )?;
    get(conn, &id)
}

/// Solo gli strumenti personalizzati si eliminano; quelli rilevati si nascondono.
pub fn delete_custom(conn: &Connection, id: &str) -> Result<()> {
    let changed = conn.execute(
        "DELETE FROM tools WHERE id = ?1 AND source = 'custom'",
        [id],
    )?;
    if changed == 0 {
        return Err(anyhow!(
            "si possono eliminare solo gli strumenti aggiunti a mano"
        ));
    }
    Ok(())
}

pub fn set_hidden(conn: &Connection, id: &str, hidden: bool) -> Result<()> {
    get(conn, id)?;
    conn.execute(
        "UPDATE tools SET is_hidden = ?2 WHERE id = ?1",
        params![id, hidden],
    )?;
    Ok(())
}

/// Imposta (o toglie, con `None`) lo strumento preferito di un tipo, sul
/// profilo o su un nodo.
pub fn set_preference(
    conn: &Connection,
    profile_id: &str,
    node_id: Option<&str>,
    kind: ToolKind,
    tool_id: Option<&str>,
) -> Result<()> {
    if let Some(tool_id) = tool_id {
        let tool = get(conn, tool_id)?;
        if tool.kind != kind {
            return Err(anyhow!(
                "'{}' non e' uno strumento di questo tipo",
                tool.name
            ));
        }
    }

    crate::db::atomic(conn, |conn| {
        match node_id {
            Some(node) => conn.execute(
                "DELETE FROM tool_preferences WHERE node_id = ?1 AND tool_kind = ?2",
                params![node, kind],
            )?,
            None => conn.execute(
                "DELETE FROM tool_preferences WHERE profile_id = ?1 AND tool_kind = ?2",
                params![profile_id, kind],
            )?,
        };
        if let Some(tool_id) = tool_id {
            match node_id {
                Some(node) => conn.execute(
                    "INSERT INTO tool_preferences (node_id, tool_kind, tool_id) VALUES (?1, ?2, ?3)",
                    params![node, kind, tool_id],
                )?,
                None => conn.execute(
                    "INSERT INTO tool_preferences (profile_id, tool_kind, tool_id) VALUES (?1, ?2, ?3)",
                    params![profile_id, kind, tool_id],
                )?,
            };
        }
        Ok(())
    })
}

/// Lo strumento da usare: la preferenza piu' vicina (nodo, antenati, profilo)
/// se disponibile, altrimenti il primo disponibile di quel tipo.
pub fn effective(
    conn: &Connection,
    profile_id: &str,
    node_id: Option<&str>,
    via: Option<&str>,
    kind: ToolKind,
) -> Result<Option<StoredTool>> {
    let preferred = match node_id {
        Some(node) => resolve::tool_preference(conn, profile_id, node, via, kind)?,
        None => conn
            .query_row(
                "SELECT tool_id FROM tool_preferences WHERE profile_id = ?1 AND tool_kind = ?2",
                params![profile_id, kind],
                |row| row.get::<_, String>(0),
            )
            .optional()?,
    };

    if let Some(id) = preferred {
        let tool = get(conn, &id)?;
        if tool.to_tool().available {
            return Ok(Some(tool));
        }
    }

    Ok(list(conn, false)?
        .into_iter()
        .find(|tool| tool.kind == kind && tool.to_tool().available))
}

/// Per ogni tipo: la preferenza impostata qui e quella che verrebbe usata.
pub fn preference_states(
    conn: &Connection,
    profile_id: &str,
    node_id: Option<&str>,
    via: Option<&str>,
) -> Result<Vec<ToolPreferenceState>> {
    [ToolKind::Ide, ToolKind::Terminal, ToolKind::Browser]
        .into_iter()
        .map(|kind| {
            let own = match node_id {
                Some(node) => conn
                    .query_row(
                        "SELECT tool_id FROM tool_preferences WHERE node_id = ?1 AND tool_kind = ?2",
                        params![node, kind],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?,
                None => conn
                    .query_row(
                        "SELECT tool_id FROM tool_preferences WHERE profile_id = ?1 AND tool_kind = ?2",
                        params![profile_id, kind],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?,
            };
            let effective = effective(conn, profile_id, node_id, via, kind)?.map(|tool| tool.id);
            Ok(ToolPreferenceState { kind, own, effective })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodeKind;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir =
                std::env::temp_dir().join(format!("llamadesk-tools-{}", uuid::Uuid::now_v7()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn file(&self, relative: &str) -> PathBuf {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, b"").unwrap();
            path
        }

        fn roots(&self) -> Roots {
            Roots {
                local_app_data: Some(self.0.join("Local")),
                app_data: Some(self.0.join("Roaming")),
                program_files: Some(self.0.join("PF")),
                program_files_x86: Some(self.0.join("PF86")),
                system_root: Some(self.0.join("Windows")),
            }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn ids(found: &[Detected]) -> Vec<&str> {
        found.iter().map(|tool| tool.id.as_str()).collect()
    }

    #[test]
    fn detects_only_what_is_installed_in_catalog_order() {
        let scratch = Scratch::new();
        scratch.file(r"Windows\System32\cmd.exe");
        scratch.file(r"Local\Programs\cursor\Cursor.exe");
        scratch.file(r"Local\Programs\Microsoft VS Code\Code.exe");
        scratch.file(r"PF86\Microsoft\Edge\Application\msedge.exe");
        scratch.file(r"PF\JetBrains\IntelliJ IDEA 2025.1\bin\idea64.exe");
        scratch.file(r"PF\JetBrains\IntelliJ IDEA 2026.2\bin\idea64.exe");
        scratch.file(r"PF\Microsoft Visual Studio\2022\Community\Common7\IDE\devenv.exe");

        let found = detect(&scratch.roots());
        assert_eq!(
            ids(&found),
            vec![
                "terminal:cmd",
                "ide:vscode",
                "ide:intellij",
                "ide:cursor",
                "browser:edge",
                "ide:visualstudio"
            ]
        );
        let idea = found.iter().find(|tool| tool.id == "ide:intellij").unwrap();
        assert!(
            idea.exe.to_string_lossy().contains("2026.2"),
            "la versione piu' recente"
        );
    }

    #[test]
    fn reads_chromium_and_firefox_profiles() {
        let scratch = Scratch::new();
        let state = scratch.file(r"Local\Google\Chrome\User Data\Local State");
        fs::write(
            &state,
            r#"{"profile":{"info_cache":{"Profile 10":{"name":"Cliente"},"Profile 2":{"name":"Lavoro"},"Default":{"name":"Personale"}}}}"#,
        )
        .unwrap();
        let ini = scratch.file(r"Roaming\Mozilla\Firefox\profiles.ini");
        fs::write(
            &ini,
            "[Profile0]\nName=default-release\nIsRelative=1\n\n[Profile1]\nName=Sviluppo\n",
        )
        .unwrap();

        let roots = scratch.roots();
        assert_eq!(
            browser_profiles("browser:chrome", &roots),
            vec![
                BrowserProfile {
                    id: "Default".into(),
                    name: "Personale".into()
                },
                BrowserProfile {
                    id: "Profile 2".into(),
                    name: "Lavoro".into()
                },
                BrowserProfile {
                    id: "Profile 10".into(),
                    name: "Cliente".into()
                },
            ]
        );
        let firefox: Vec<String> = browser_profiles("browser:firefox", &roots)
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(firefox, vec!["default-release", "Sviluppo"]);
        assert!(browser_profiles("browser:edge", &roots).is_empty());
    }

    fn stored(id: &str, kind: ToolKind, exe: &str, args: &[&str]) -> StoredTool {
        StoredTool {
            id: id.into(),
            kind,
            name: id.into(),
            exe_path: exe.into(),
            args_template: serde_json::to_string(args).unwrap(),
            source: "detected".into(),
            is_hidden: false,
        }
    }

    #[test]
    fn builds_commands_without_a_shell() {
        let powershell = stored(
            "terminal:powershell",
            ToolKind::Terminal,
            "powershell.exe",
            &[
                "-NoExit",
                "-Command",
                "Set-Location -LiteralPath '{path_ps}'",
            ],
        );
        let launch = launch_for_path(&powershell, r"C:\dev\l'app");
        assert_eq!(launch.args[2], r"Set-Location -LiteralPath 'C:\dev\l''app'");
        assert!(launch.console);

        let toolbox = stored(
            "ide:custom",
            ToolKind::Ide,
            r"C:\Toolbox\scripts\idea.cmd",
            &["{path}"],
        );
        let launch = launch_for_path(&toolbox, r"C:\dev\backend");
        assert_eq!(launch.exe, "cmd.exe");
        assert_eq!(
            launch.args,
            vec!["/c", r"C:\Toolbox\scripts\idea.cmd", r"C:\dev\backend"]
        );

        let chrome = stored(
            "browser:chrome",
            ToolKind::Browser,
            "chrome.exe",
            &["{urls}"],
        );
        let urls = vec![
            "https://a.example.com".to_string(),
            "https://b.example.com".to_string(),
        ];
        let launch = launch_for_urls(&chrome, &urls, true, Some("Profile 1"));
        assert_eq!(
            launch.args,
            vec![
                "--profile-directory=Profile 1",
                "--new-window",
                "https://a.example.com",
                "https://b.example.com"
            ]
        );

        let firefox = stored(
            "browser:firefox",
            ToolKind::Browser,
            "firefox.exe",
            &["{urls}"],
        );
        let launch = launch_for_urls(&firefox, &urls, true, None);
        assert_eq!(
            launch.args,
            vec![
                "-new-window",
                "https://a.example.com",
                "-new-tab",
                "https://b.example.com"
            ]
        );
    }

    #[test]
    fn splits_user_arguments_like_a_command_line() {
        assert_eq!(
            split_args(r#"--profile "Il mio profilo" {path}"#),
            vec!["--profile", "Il mio profilo", "{path}"]
        );
        assert_eq!(split_args(r#"  -a  "" b "#), vec!["-a", "", "b"]);
        assert!(split_args("   ").is_empty());

        let custom = stored("custom:x", ToolKind::Ide, "editor.exe", &["--wait"]);
        assert_eq!(
            launch_for_path(&custom, r"C:\dev").args,
            vec!["--wait", r"C:\dev"]
        );
    }

    #[test]
    fn preferences_fall_back_to_the_first_available_tool() {
        let scratch = Scratch::new();
        scratch.file(r"Local\Programs\Microsoft VS Code\Code.exe");
        scratch.file(r"Local\Programs\cursor\Cursor.exe");
        let (conn, profile) = database();
        sync(&conn, &detect(&scratch.roots())).unwrap();

        let ws = workspace(&conn, &profile, "Lavoro");
        let repo = child(&conn, &profile, &ws, NodeKind::Path, "backend");

        let pick = |conn: &Connection| {
            effective(conn, &profile, Some(&repo), None, ToolKind::Ide)
                .unwrap()
                .map(|tool| tool.id)
        };
        assert_eq!(pick(&conn).as_deref(), Some("ide:vscode"));

        set_preference(
            &conn,
            &profile,
            Some(&ws),
            ToolKind::Ide,
            Some("ide:cursor"),
        )
        .unwrap();
        assert_eq!(pick(&conn).as_deref(), Some("ide:cursor"));

        // Un tipo sbagliato si rifiuta.
        assert!(set_preference(
            &conn,
            &profile,
            None,
            ToolKind::Terminal,
            Some("ide:cursor")
        )
        .is_err());

        let states = preference_states(&conn, &profile, Some(&repo), None).unwrap();
        let ide = states
            .iter()
            .find(|state| state.kind == ToolKind::Ide)
            .unwrap();
        assert_eq!(
            (ide.own.as_deref(), ide.effective.as_deref()),
            (None, Some("ide:cursor"))
        );

        // Disinstallato: resta in tabella ma non si propone piu'.
        fs::remove_file(scratch.0.join(r"Local\Programs\cursor\Cursor.exe")).unwrap();
        sync(&conn, &detect(&scratch.roots())).unwrap();
        assert_eq!(pick(&conn).as_deref(), Some("ide:vscode"));
        assert!(list(&conn, false)
            .unwrap()
            .iter()
            .all(|tool| tool.id != "ide:cursor"));
    }
}
