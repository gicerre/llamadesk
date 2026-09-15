//! Ricerca della command palette (docs/REDESIGN.md § 7).
//!
//! Tutto in Rust e tutto locale. A ogni richiesta si legge la libreria visibile
//! al profilo (una libreria personale sono poche migliaia di righe: pochi
//! millisecondi) e si assegna un punteggio a ogni elemento:
//!
//!  * **corrispondenza** per campo — nome, alias, tag, nomi degli antenati,
//!    indirizzo o percorso, descrizione — con pesi diversi; ogni parola della
//!    richiesta deve trovare posto in almeno un campo;
//!  * **uso**: quante volte e quanto di recente lo si e' aperto;
//!  * **contesto**: un piccolo vantaggio al workspace corrente.
//!
//! Una parola puo' essere un **verbo** ("term", "cursor", "esplora"): allora
//! il risultato porta con se' l'azione da eseguire, anche su un contenitore
//! (si usa il suo primo percorso). Solo verbi, con una pagina aperta: l'azione
//! vale per la pagina.

use std::collections::{HashMap, HashSet, VecDeque};

use anyhow::Result;
use rusqlite::{params, Connection};

use crate::db::repo::nodes;
use crate::domain::{Crumb, Node, NodeKind, SearchHit, SuggestedAction, ToolKind};
use crate::services::tools::{self, StoredTool};

pub struct Query<'a> {
    pub profile_id: &'a str,
    pub text: &'a str,
    /// Workspace in cui si trova l'utente: percorsi e un piccolo vantaggio.
    pub workspace_id: Option<&'a str>,
    /// Pagina aperta: la destinazione di una richiesta fatta di soli verbi.
    pub context_id: Option<&'a str>,
    pub limit: usize,
}

/* ------------------------------------------------------------- testo */

/// Minuscolo e senza accenti, un carattere per carattere: gli indici restano
/// validi sul nome originale.
fn fold(text: &str) -> Vec<char> {
    text.chars()
        .map(|character| {
            let lower = character.to_lowercase().next().unwrap_or(character);
            match lower {
                'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => 'a',
                'è' | 'é' | 'ê' | 'ë' => 'e',
                'ì' | 'í' | 'î' | 'ï' => 'i',
                'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
                'ù' | 'ú' | 'û' | 'ü' => 'u',
                'ç' => 'c',
                'ñ' => 'n',
                other => other,
            }
        })
        .collect()
}

fn is_boundary(text: &[char], index: usize) -> bool {
    index == 0 || !text[index - 1].is_alphanumeric()
}

struct Match {
    score: f64,
    ranges: Vec<(usize, usize)>,
}

/// Quanto bene `token` sta dentro `text`: uguale, inizio, inizio di parola,
/// dentro; con `loose` anche lettere sparse nell'ordine ("shb" → SpecialHub Backend).
fn match_text(token: &[char], text: &[char], loose: bool) -> Option<Match> {
    if token.is_empty() || text.len() < token.len() {
        return None;
    }

    let mut best: Option<Match> = None;
    for start in 0..=text.len() - token.len() {
        if text[start..start + token.len()] != *token {
            continue;
        }
        let score = if start == 0 && text.len() == token.len() {
            1.0
        } else if start == 0 {
            0.9
        } else if is_boundary(text, start) {
            0.8
        } else {
            0.6
        };
        if best.as_ref().map_or(true, |known| score > known.score) {
            best = Some(Match {
                score,
                ranges: vec![(start, start + token.len())],
            });
        }
    }
    if best.is_some() || !loose || token.len() < 2 {
        return best;
    }

    // Lettere sparse: si preferisce partire da un inizio di parola.
    let starts = (0..text.len()).filter(|&index| text[index] == token[0]);
    let mut candidates: Vec<usize> = starts.collect();
    candidates.sort_by_key(|&index| !is_boundary(text, index));
    for first in candidates {
        let mut ranges: Vec<(usize, usize)> = Vec::new();
        let mut cursor = first;
        let mut matched = 0;
        while cursor < text.len() && matched < token.len() {
            if text[cursor] == token[matched] {
                match ranges.last_mut() {
                    Some(last) if last.1 == cursor => last.1 += 1,
                    _ => ranges.push((cursor, cursor + 1)),
                }
                matched += 1;
            }
            cursor += 1;
        }
        if matched < token.len() {
            continue;
        }
        let span = cursor - first;
        let score = 0.5 * token.len() as f64 / span as f64;
        if score >= 0.15 {
            return Some(Match { score, ranges });
        }
    }
    None
}

/* ------------------------------------------------------------- verbi */

#[derive(Debug, Clone)]
enum Verb {
    Terminal,
    Ide,
    Reveal,
    Remote,
    Tool(StoredTool),
}

impl Verb {
    fn action(&self) -> (&'static str, Option<&StoredTool>) {
        match self {
            Verb::Terminal => ("terminal", None),
            Verb::Ide => ("open_with", None),
            Verb::Reveal => ("reveal", None),
            Verb::Remote => ("open_remote", None),
            Verb::Tool(tool) => match tool.kind {
                ToolKind::Terminal => ("terminal", Some(tool)),
                ToolKind::Ide | ToolKind::Browser => ("open_with", Some(tool)),
            },
        }
    }

    /// Link e gruppi accettano solo un browser; percorsi e contenitori il resto.
    fn applies_to(&self, kind: NodeKind) -> bool {
        let browser = matches!(self, Verb::Tool(tool) if tool.kind == ToolKind::Browser);
        match kind {
            NodeKind::Link | NodeKind::LinkGroup => browser,
            _ => !browser,
        }
    }
}

/// Parola chiave e verbo che produce.
type Keyword = (&'static str, fn() -> Verb);

const KEYWORDS: &[Keyword] = &[
    ("terminale", || Verb::Terminal),
    ("terminal", || Verb::Terminal),
    ("shell", || Verb::Terminal),
    ("console", || Verb::Terminal),
    ("ide", || Verb::Ide),
    ("editor", || Verb::Ide),
    ("esplora", || Verb::Reveal),
    ("explorer", || Verb::Reveal),
    ("reveal", || Verb::Reveal),
    ("remoto", || Verb::Remote),
    ("remote", || Verb::Remote),
];

/// Parole troppo generiche nei nomi degli strumenti per farne un verbo.
const TOOL_STOPWORDS: &[&str] = &[
    "windows",
    "microsoft",
    "google",
    "mozilla",
    "prompt",
    "dei",
    "comandi",
    "visual",
    "studio",
    "text",
    "terminal",
];

fn verb_for(token: &[char], tools: &[StoredTool]) -> Option<Verb> {
    let word: String = token.iter().collect();
    if word.len() < 2 {
        return None;
    }
    let prefix_of = |keyword: &str| {
        keyword == word || (word.chars().count() >= 3 && keyword.starts_with(&word))
    };

    if let Some((_, make)) = KEYWORDS.iter().find(|(keyword, _)| prefix_of(keyword)) {
        return Some(make());
    }

    tools
        .iter()
        .find(|tool| {
            let suffix = tool.id.split(':').nth(1).unwrap_or_default();
            let suffix_hit = suffix == word || (word.len() >= 3 && suffix.starts_with(&word));
            let name: String = fold(&tool.name).into_iter().collect();
            let name_hit = word.len() >= 3
                && name
                    .split(|c: char| !c.is_alphanumeric())
                    .filter(|part| part.len() >= 3 && !TOOL_STOPWORDS.contains(part))
                    .any(|part| part.starts_with(&word));
            suffix_hit || name_hit
        })
        .cloned()
        .map(Verb::Tool)
}

/* ------------------------------------------------------------- indice */

struct Trail {
    workspace_id: String,
    /// Antenati dalla radice al padre.
    ancestors: Vec<String>,
}

struct Entry {
    node: Node,
    trails: Vec<Trail>,
    tags: Vec<Vec<char>>,
    uses: u32,
    days_since_use: Option<f64>,
}

struct Index {
    entries: Vec<Entry>,
    names: HashMap<String, Node>,
}

fn load(conn: &Connection, profile_id: &str) -> Result<Index> {
    let mut statement =
        conn.prepare("SELECT * FROM nodes WHERE deleted_at IS NULL AND archived_at IS NULL")?;
    let all: HashMap<String, Node> = statement
        .query_map([], nodes::map)?
        .map(|row| row.map(|node| (node.id.clone(), node)))
        .collect::<rusqlite::Result<_>>()?;

    // Ogni strada da un workspace visibile a ogni nodo. Un progetto condiviso
    // ne ha piu' d'una.
    let mut statement = conn.prepare(
        "WITH RECURSIVE walk(id, workspace_id, trail, depth) AS (
           SELECT n.id, n.id, '', 0
             FROM profile_workspaces pw JOIN nodes n ON n.id = pw.workspace_id
            WHERE pw.profile_id = ?1 AND n.deleted_at IS NULL AND n.archived_at IS NULL
           UNION ALL
           SELECT e.child_id, w.workspace_id,
                  CASE WHEN w.trail = '' THEN w.id ELSE w.trail || char(31) || w.id END,
                  w.depth + 1
             FROM walk w
             JOIN edges e ON e.parent_id = w.id
             JOIN nodes c ON c.id = e.child_id
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL AND w.depth < 40
         )
         SELECT id, workspace_id, trail FROM walk",
    )?;
    let mut trails: HashMap<String, Vec<Trail>> = HashMap::new();
    let rows = statement.query_map([profile_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (id, workspace_id, trail) = row?;
        let ancestors = trail
            .split('\u{1f}')
            .filter(|part| !part.is_empty())
            .map(str::to_string)
            .collect();
        trails.entry(id).or_default().push(Trail {
            workspace_id,
            ancestors,
        });
    }

    let mut tags: HashMap<String, Vec<Vec<char>>> = HashMap::new();
    let mut statement = conn
        .prepare("SELECT nt.node_id, t.name FROM node_tags nt JOIN tags t ON t.id = nt.tag_id")?;
    for row in statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })? {
        let (node_id, name) = row?;
        tags.entry(node_id).or_default().push(fold(&name));
    }

    let mut usage: HashMap<String, (u32, f64)> = HashMap::new();
    let mut statement = conn.prepare(
        "SELECT node_id, COUNT(*), julianday('now') - julianday(MAX(at))
           FROM usage_events WHERE profile_id = ?1 GROUP BY node_id",
    )?;
    for row in statement.query_map(params![profile_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, u32>(1)?,
            row.get::<_, f64>(2)?,
        ))
    })? {
        let (node_id, count, days) = row?;
        usage.insert(node_id, (count, days));
    }

    let entries = trails
        .into_iter()
        .filter_map(|(id, trails)| {
            let node = all.get(&id)?.clone();
            let (uses, days) = usage
                .get(&id)
                .copied()
                .map_or((0, None), |(c, d)| (c, Some(d)));
            Some(Entry {
                tags: tags.remove(&id).unwrap_or_default(),
                node,
                trails,
                uses,
                days_since_use: days,
            })
        })
        .collect();

    Ok(Index {
        entries,
        names: all,
    })
}

/* ---------------------------------------------------------- punteggio */

const NAME: f64 = 1.0;
const ALIAS: f64 = 0.9;
const TAG: f64 = 0.85;
const ANCESTOR: f64 = 0.55;
const LOCATION: f64 = 0.5;
const DESCRIPTION: f64 = 0.35;

struct Scored {
    score: f64,
    field: &'static str,
    highlights: Vec<(usize, usize)>,
}

/// Il punteggio medio delle parole, o `None` se una non trova posto.
fn score_tokens(
    tokens: &[Vec<char>],
    entry: &Entry,
    trail: &Trail,
    index: &Index,
) -> Option<Scored> {
    if tokens.is_empty() {
        return Some(Scored {
            score: 0.0,
            field: "",
            highlights: Vec::new(),
        });
    }

    let node = &entry.node;
    let name = fold(&node.name);
    let aliases = node.aliases.as_deref().map(fold).unwrap_or_default();
    let description = node.description.as_deref().map(fold).unwrap_or_default();
    let location = fold(
        node.url
            .as_deref()
            .or(node.path.as_deref())
            .unwrap_or_default(),
    );
    let ancestors: Vec<char> = trail
        .ancestors
        .iter()
        .filter_map(|id| index.names.get(id))
        .flat_map(|ancestor| fold(&ancestor.name).into_iter().chain(std::iter::once(' ')))
        .collect();

    let mut total = 0.0;
    let mut decisive = ("", 0.0);
    let mut highlights = Vec::new();

    for token in tokens {
        let mut best: Option<(f64, &'static str)> = None;
        let mut consider = |score: Option<f64>, field: &'static str| {
            if let Some(score) = score {
                if best.map_or(true, |(known, _)| score > known) {
                    best = Some((score, field));
                }
            }
        };

        let on_name = match_text(token, &name, true);
        consider(on_name.as_ref().map(|m| m.score * NAME), "name");
        consider(
            match_text(token, &aliases, true).map(|m| m.score * ALIAS),
            "alias",
        );
        for tag in &entry.tags {
            consider(match_text(token, tag, false).map(|m| m.score * TAG), "tag");
        }
        consider(
            match_text(token, &ancestors, false).map(|m| m.score * ANCESTOR),
            "ancestor",
        );
        consider(
            match_text(token, &location, false).map(|m| m.score * LOCATION),
            "location",
        );
        consider(
            match_text(token, &description, false).map(|m| m.score * DESCRIPTION),
            "description",
        );

        let (score, field) = best?;
        if let Some(on_name) = on_name {
            highlights.extend(on_name.ranges);
        }
        total += score;
        if score > decisive.1 {
            decisive = (field, score);
        }
    }

    // Un nome corto che la richiesta copre quasi tutto vale di piu'.
    let typed: usize = tokens.iter().map(Vec::len).sum();
    let coverage = if decisive.0 == "name" {
        typed as f64 / name.len().max(1) as f64
    } else {
        0.0
    };

    highlights.sort_unstable();
    Some(Scored {
        score: total / tokens.len() as f64 * 100.0 + 6.0 * coverage.min(1.0),
        field: decisive.0,
        highlights,
    })
}

fn usage_bonus(entry: &Entry) -> f64 {
    let frequency = (7.0 * (1.0 + entry.uses as f64).ln()).min(18.0);
    let recency = entry
        .days_since_use
        .filter(|days| *days < 7.0)
        .map_or(0.0, |days| 6.0 * (1.0 - days / 7.0));
    frequency + recency
}

fn kind_bonus(kind: NodeKind) -> f64 {
    match kind {
        NodeKind::Project => 3.0,
        NodeKind::Workspace | NodeKind::Subproject => 2.0,
        _ => 0.0,
    }
}

/* --------------------------------------------------------------- ricerca */

struct Candidate<'a> {
    entry: &'a Entry,
    trail: &'a Trail,
    score: f64,
    field: &'static str,
    highlights: Vec<(usize, usize)>,
    verb: Option<&'a Verb>,
}

pub fn search(conn: &Connection, query: &Query<'_>) -> Result<Vec<SearchHit>> {
    let raw = query.text.trim();
    if raw.starts_with('>') {
        // I comandi dell'app vivono nel frontend.
        return Ok(Vec::new());
    }
    let containers_only = raw.starts_with('@');
    let raw = raw.trim_start_matches('@');

    let mut words: Vec<Vec<char>> = Vec::new();
    let mut tag_filters: Vec<Vec<char>> = Vec::new();
    for word in raw.split_whitespace() {
        match word.strip_prefix('#') {
            Some(tag) if !tag.is_empty() => tag_filters.push(fold(tag)),
            Some(_) => {}
            None => words.push(fold(word)),
        }
    }
    if words.is_empty() && tag_filters.is_empty() {
        return Ok(Vec::new());
    }

    let index = load(conn, query.profile_id)?;
    let tools = tools::list(conn, false)?;

    // Il verbo e' l'ultima parola che lo sembra; il resto descrive l'oggetto.
    let verb_position = if containers_only {
        None
    } else {
        words
            .iter()
            .rposition(|word| verb_for(word, &tools).is_some())
    };
    let verb = verb_position.and_then(|position| verb_for(&words[position], &tools));
    let object: Vec<Vec<char>> = words
        .iter()
        .enumerate()
        .filter(|(position, _)| Some(*position) != verb_position)
        .map(|(_, word)| word.clone())
        .collect();

    let mut best: HashMap<&str, Candidate<'_>> = HashMap::new();

    for entry in &index.entries {
        let kind = entry.node.kind;
        if containers_only && !kind_is_container(kind) {
            continue;
        }
        if !tag_filters
            .iter()
            .all(|filter| entry.tags.iter().any(|tag| tag.starts_with(filter)))
        {
            continue;
        }
        let trail = pick_trail(&entry.trails, query.workspace_id);
        let bonus = usage_bonus(entry)
            + kind_bonus(kind)
            + if Some(trail.workspace_id.as_str()) == query.workspace_id {
                5.0
            } else {
                0.0
            };

        // Tutte le parole come oggetto.
        if !words.is_empty() {
            if let Some(scored) = score_tokens(&words, entry, trail, &index) {
                offer(
                    &mut best,
                    Candidate {
                        entry,
                        trail,
                        score: scored.score + bonus,
                        field: scored.field,
                        highlights: scored.highlights,
                        verb: None,
                    },
                );
            }
        } else {
            // Solo tag: tutti gli elementi con quei tag, per uso.
            offer(
                &mut best,
                Candidate {
                    entry,
                    trail,
                    score: 50.0 + bonus,
                    field: "tag",
                    highlights: Vec::new(),
                    verb: None,
                },
            );
        }

        // Oggetto + verbo.
        let Some(verb) = verb.as_ref() else { continue };
        if !verb.applies_to(kind) {
            continue;
        }
        if object.is_empty() {
            // Solo il verbo: percorsi (o link, per un browser), prima quelli della pagina.
            if kind_is_container(kind) {
                continue;
            }
            let in_context = query.context_id.is_some_and(|context| {
                entry.node.id == context || trail.ancestors.iter().any(|id| id == context)
            });
            offer(
                &mut best,
                Candidate {
                    entry,
                    trail,
                    score: 40.0 + bonus + if in_context { 35.0 } else { 0.0 },
                    field: "",
                    highlights: Vec::new(),
                    verb: Some(verb),
                },
            );
        } else if let Some(scored) = score_tokens(&object, entry, trail, &index) {
            offer(
                &mut best,
                Candidate {
                    entry,
                    trail,
                    score: scored.score + bonus + 4.0,
                    field: scored.field,
                    highlights: scored.highlights,
                    verb: Some(verb),
                },
            );
        }
    }

    let mut ranked: Vec<Candidate<'_>> = best.into_values().collect();
    ranked.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.entry.node.name.cmp(&b.entry.node.name))
    });

    let mut hits = Vec::with_capacity(query.limit);
    for candidate in ranked {
        if hits.len() >= query.limit {
            break;
        }
        let action = match candidate.verb {
            Some(verb) => {
                let target = if kind_is_container(candidate.entry.node.kind) {
                    match first_path(conn, &candidate.entry.node.id)? {
                        Some(path) => path,
                        // Un contenitore senza percorsi non sa dove aprire il terminale.
                        None => continue,
                    }
                } else {
                    candidate.entry.node.clone()
                };
                let (action_id, tool) = verb.action();
                Some(SuggestedAction {
                    action_id: action_id.to_string(),
                    tool_id: tool.map(|tool| tool.id.clone()),
                    tool_name: tool.map(|tool| tool.name.clone()),
                    target,
                })
            }
            None => None,
        };

        let mut breadcrumb: Vec<Crumb> = candidate
            .trail
            .ancestors
            .iter()
            .filter_map(|id| index.names.get(id))
            .map(Crumb::from)
            .collect();
        breadcrumb.push(Crumb::from(&candidate.entry.node));

        hits.push(SearchHit {
            node: candidate.entry.node.clone(),
            breadcrumb,
            workspace_id: candidate.trail.workspace_id.clone(),
            score: (candidate.score * 10.0).round() / 10.0,
            highlights: candidate
                .highlights
                .into_iter()
                .map(|(start, end)| (start as u32, end as u32))
                .collect(),
            matched: candidate.field.to_string(),
            action,
        });
    }
    Ok(hits)
}

/// Stesso elemento da due interpretazioni: vince quella con l'azione, se regge.
fn offer<'a>(best: &mut HashMap<&'a str, Candidate<'a>>, candidate: Candidate<'a>) {
    let id = candidate.entry.node.id.as_str();
    if let Some(known) = best.get(id) {
        let verb_holds = candidate.verb.is_some() && candidate.score + 10.0 >= known.score;
        if known.score > candidate.score && !verb_holds {
            return;
        }
    }
    best.insert(id, candidate);
}

fn kind_is_container(kind: NodeKind) -> bool {
    matches!(
        kind,
        NodeKind::Workspace | NodeKind::Project | NodeKind::Subproject | NodeKind::Section
    )
}

fn pick_trail<'a>(trails: &'a [Trail], workspace_id: Option<&str>) -> &'a Trail {
    workspace_id
        .and_then(|current| trails.iter().find(|trail| trail.workspace_id == current))
        .unwrap_or(&trails[0])
}

/// Il primo percorso dentro un contenitore, livello per livello.
fn first_path(conn: &Connection, container_id: &str) -> Result<Option<Node>> {
    let mut queue = VecDeque::from([(container_id.to_string(), 0)]);
    let mut seen = HashSet::new();
    while let Some((id, depth)) = queue.pop_front() {
        if !seen.insert(id.clone()) || depth > 4 {
            continue;
        }
        let children = nodes::children(conn, &id, false)?;
        if let Some(path) = children
            .iter()
            .find(|entry| entry.node.kind == NodeKind::Path)
        {
            return Ok(Some(path.node.clone()));
        }
        for child in children
            .into_iter()
            .filter(|entry| kind_is_container(entry.node.kind))
        {
            queue.push_back((child.node.id, depth + 1));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::{library, workspaces};
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodePatch;
    use crate::services::hierarchy;

    fn names(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(|hit| hit.node.name.as_str()).collect()
    }

    fn run(conn: &Connection, profile: &str, text: &str) -> Vec<SearchHit> {
        search(
            conn,
            &Query {
                profile_id: profile,
                text,
                workspace_id: None,
                context_id: None,
                limit: 20,
            },
        )
        .unwrap()
    }

    fn add_tool(conn: &Connection, id: &str, kind: &str, name: &str) {
        let exe = std::env::current_exe().unwrap();
        conn.execute(
            "INSERT INTO tools (id, kind, name, exe_path, args_template, source, detected_at)
             VALUES (?1, ?2, ?3, ?4, '[\"{path}\"]', 'detected', datetime('now'))",
            params![id, kind, name, exe.to_string_lossy()],
        )
        .unwrap();
    }

    #[test]
    fn folds_accents_and_matches_prefixes_first() {
        let name = fold("Attività Città");
        assert_eq!(name.len(), "Attività Città".chars().count());
        assert!(match_text(&fold("citta"), &name, false).is_some());

        let prefix = match_text(&fold("spec"), &fold("SpecialHub"), true).unwrap();
        let inside = match_text(&fold("hub"), &fold("SpecialHub"), true).unwrap();
        assert!(prefix.score > inside.score);

        let loose = match_text(&fold("shb"), &fold("SpecialHub Backend"), true).unwrap();
        assert!(loose.score < inside.score);
        assert_eq!(loose.ranges, vec![(0, 1), (7, 8), (9, 10)]);
    }

    #[test]
    fn finds_by_name_alias_tag_ancestor_and_url() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let backend = child(&conn, &profile, &project, NodeKind::Subproject, "Backend");
        let jira = child(&conn, &profile, &backend, NodeKind::Link, "Tracker");
        nodes::update(
            &conn,
            &project,
            &NodePatch {
                aliases: Some(Some("processi bpm".into())),
                ..NodePatch::default()
            },
        )
        .unwrap();
        library::set_tags(&conn, &jira, &["cliente".into()]).unwrap();

        assert_eq!(names(&run(&conn, &profile, "special"))[0], "SpecialHub");
        assert_eq!(names(&run(&conn, &profile, "bpm")), vec!["SpecialHub"]);
        assert_eq!(names(&run(&conn, &profile, "#cli")), vec!["Tracker"]);
        // Parole su campi diversi: il link sta sotto "backend" e si chiama "tracker".
        assert_eq!(
            names(&run(&conn, &profile, "backend track")),
            vec!["Tracker"]
        );
        // L'indirizzo fittizio dei test contiene il nome.
        assert!(names(&run(&conn, &profile, "example.com")).contains(&"Tracker"));
        assert!(run(&conn, &profile, "inesistente").is_empty());

        let hit = &run(&conn, &profile, "tracker")[0];
        let trail: Vec<&str> = hit
            .breadcrumb
            .iter()
            .map(|crumb| crumb.name.as_str())
            .collect();
        assert_eq!(trail, vec!["Lavoro", "SpecialHub", "Backend", "Tracker"]);
        assert_eq!(hit.highlights, vec![(0, 7)]);
    }

    #[test]
    fn only_what_the_profile_sees_and_usage_ranks_first() {
        let (conn, me) = database();
        conn.execute(
            "INSERT INTO profiles (id, name) VALUES ('demo', 'Demo')",
            [],
        )
        .unwrap();
        let work = workspace(&conn, &me, "Lavoro");
        let personal = workspace(&conn, &me, "Personale");
        workspaces::show(&conn, "demo", &work).unwrap();
        child(&conn, &me, &personal, NodeKind::Link, "Banca online");
        let rarely = child(&conn, &me, &work, NodeKind::Link, "Bacheca team");
        let often = child(&conn, &me, &work, NodeKind::Link, "Backlog");

        assert_eq!(
            names(&run(&conn, "demo", "ba")).len(),
            2,
            "la banca non si vede"
        );

        for _ in 0..4 {
            library::record_usage(&conn, "demo", &often, "open", None, None).unwrap();
        }
        library::record_usage(&conn, "demo", &rarely, "open", None, None).unwrap();
        assert_eq!(
            names(&run(&conn, "demo", "ba")),
            vec!["Backlog", "Bacheca team"]
        );
    }

    #[test]
    fn object_plus_verb_suggests_the_action() {
        let (conn, profile) = database();
        add_tool(&conn, "ide:cursor", "ide", "Cursor");
        add_tool(&conn, "terminal:wt", "terminal", "Windows Terminal");
        add_tool(&conn, "browser:chrome", "browser", "Google Chrome");
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let camunda = child(&conn, &profile, &project, NodeKind::Subproject, "Camunda");
        let docs = child(&conn, &profile, &camunda, NodeKind::Section, "Docs");
        let repo = child(&conn, &profile, &docs, NodeKind::Path, "camunda-engine");
        let grafana = child(&conn, &profile, &ws, NodeKind::Link, "Grafana");

        // "camunda term": il sottoprogetto, con il terminale nel suo primo percorso.
        let hits = run(&conn, &profile, "camunda term");
        let action = hits[0].action.as_ref().expect("un'azione");
        assert_eq!(action.action_id, "terminal");
        assert_eq!(action.target.id, repo);

        let cursor = run(&conn, &profile, "engine cursor");
        let action = cursor[0].action.as_ref().unwrap();
        assert_eq!(
            (action.action_id.as_str(), action.tool_id.as_deref()),
            ("open_with", Some("ide:cursor"))
        );

        let chrome = run(&conn, &profile, "grafana chrome");
        assert_eq!(chrome[0].node.id, grafana);
        assert_eq!(
            chrome[0].action.as_ref().unwrap().tool_id.as_deref(),
            Some("browser:chrome")
        );

        // Solo il verbo, dentro una pagina: i percorsi di quella pagina per primi.
        let only_verb = search(
            &conn,
            &Query {
                profile_id: &profile,
                text: "cursor",
                workspace_id: Some(&ws),
                context_id: Some(&camunda),
                limit: 5,
            },
        )
        .unwrap();
        assert_eq!(only_verb[0].node.id, repo);

        // "@": solo contenitori, e nessun verbo.
        let containers = run(&conn, &profile, "@camunda");
        assert!(containers
            .iter()
            .all(|hit| hit.action.is_none() && hit.node.kind != NodeKind::Path));
        assert!(run(&conn, &profile, "> impostazioni").is_empty());
    }

    #[test]
    fn a_shared_project_uses_the_current_workspace_path() {
        let (conn, profile) = database();
        let work = workspace(&conn, &profile, "Lavoro");
        let dev = workspace(&conn, &profile, "Sviluppo");
        let project = child(&conn, &profile, &work, NodeKind::Project, "Portale");
        hierarchy::share(&conn, &project, &dev, None).unwrap();

        let hits = search(
            &conn,
            &Query {
                profile_id: &profile,
                text: "portale",
                workspace_id: Some(&dev),
                context_id: None,
                limit: 5,
            },
        )
        .unwrap();
        assert_eq!(hits.len(), 1, "un solo risultato per un progetto condiviso");
        assert_eq!(hits[0].workspace_id, dev);
        assert_eq!(hits[0].breadcrumb[0].name, "Sviluppo");
    }
}
