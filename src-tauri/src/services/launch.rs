//! Avvio (D7): una sequenza di azioni lanciata da un pulsante su progetto,
//! sottoprogetto o sezione ("apri il repository in IntelliJ, il terminale,
//! il gruppo DEV nel profilo Lavoro").
//!
//! Ogni passo e' un'azione del registro (`services::actions`) su un elemento
//! che sta dentro il contenitore: l'Avvio non inventa regole nuove, riusa
//! pianificazione, conferma ed eseguibili bloccati delle azioni singole.

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::repo::nodes;
use crate::db::seed::new_id;
use crate::domain::{Caution, LaunchStep, NodeKind};
use crate::services::actions::{self, Plan, Request};
use crate::services::ordering::LAUNCH_STEPS;
use crate::services::tools::{self, Roots};

fn is_owner_kind(kind: NodeKind) -> bool {
    matches!(
        kind,
        NodeKind::Project | NodeKind::Subproject | NodeKind::Section
    )
}

pub fn list(conn: &Connection, owner_id: &str) -> Result<Vec<LaunchStep>> {
    let mut statement = conn.prepare(
        "SELECT s.id, s.target_id, s.action_id, s.tool_id, s.sort_order, t.name AS tool_name
           FROM launch_steps s
           JOIN nodes n ON n.id = s.target_id AND n.deleted_at IS NULL
           LEFT JOIN tools t ON t.id = s.tool_id
          WHERE s.owner_id = ?1
          ORDER BY s.sort_order",
    )?;
    let rows = statement.query_map([owner_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, Option<String>>(5)?,
        ))
    })?;

    let mut steps = Vec::new();
    for row in rows {
        let (id, target_id, action_id, tool_id, sort_order, tool_name) = row?;
        steps.push(LaunchStep {
            id,
            target: nodes::get(conn, &target_id)?,
            action_id,
            tool_id,
            tool_name,
            sort_order,
        });
    }
    Ok(steps)
}

/// Aggiunge un passo in coda. L'elemento deve stare dentro il contenitore e
/// l'azione deve valere per il suo tipo.
pub fn add(
    conn: &Connection,
    owner_id: &str,
    target_id: &str,
    action_id: &str,
    tool_id: Option<&str>,
) -> Result<LaunchStep> {
    let owner = nodes::get(conn, owner_id)?;
    if !is_owner_kind(owner.kind) {
        return Err(anyhow!(
            "l'Avvio si imposta su un progetto, un sottoprogetto o una sezione"
        ));
    }
    let target = nodes::get(conn, target_id)?;
    if !nodes::descendant_ids(conn, owner_id)?.contains(&target.id) {
        return Err(anyhow!("«{}» non sta dentro «{}»", target.name, owner.name));
    }
    let valid = match target.kind {
        NodeKind::Link | NodeKind::LinkGroup => {
            matches!(action_id, actions::ids::OPEN | actions::ids::OPEN_WITH)
        }
        NodeKind::Path => matches!(
            action_id,
            actions::ids::OPEN
                | actions::ids::OPEN_WITH
                | actions::ids::TERMINAL
                | actions::ids::REVEAL
                | actions::ids::OPEN_REMOTE
        ),
        _ => false,
    };
    if !valid {
        return Err(anyhow!(
            "l'azione '{action_id}' non vale per un elemento di tipo {}",
            target.kind
        ));
    }
    if let Some(tool_id) = tool_id {
        tools::get(conn, tool_id)?;
    }

    let id = new_id();
    let sort_order = LAUNCH_STEPS.append(conn, owner_id)?;
    conn.execute(
        "INSERT INTO launch_steps (id, owner_id, target_id, action_id, tool_id, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, owner_id, target_id, action_id, tool_id, sort_order],
    )?;
    list(conn, owner_id)?
        .into_iter()
        .find(|step| step.id == id)
        .ok_or_else(|| anyhow!("passo non trovato dopo l'inserimento"))
}

pub fn owner_of(conn: &Connection, step_id: &str) -> Result<String> {
    conn.query_row(
        "SELECT owner_id FROM launch_steps WHERE id = ?1",
        [step_id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| anyhow!("passo non trovato"))
}

pub fn remove(conn: &Connection, step_id: &str) -> Result<()> {
    conn.execute("DELETE FROM launch_steps WHERE id = ?1", [step_id])?;
    Ok(())
}

pub fn move_step(
    conn: &Connection,
    step_id: &str,
    previous_id: Option<&str>,
    next_id: Option<&str>,
) -> Result<()> {
    let owner = owner_of(conn, step_id)?;
    let rank = LAUNCH_STEPS.place(conn, &owner, previous_id, next_id)?;
    LAUNCH_STEPS.set(conn, &owner, step_id, rank)
}

/// Un Avvio pronto da eseguire: i piani dei passi validi e quelli che non si
/// possono pianificare (percorso sparito, strumento disinstallato...).
pub struct LaunchPlan {
    pub owner_name: String,
    pub plans: Vec<Plan>,
    pub failures: Vec<(String, String)>,
    pub caution: Caution,
}

pub fn plan(
    conn: &Connection,
    roots: &Roots,
    profile_id: &str,
    owner_id: &str,
    via_workspace_id: Option<&str>,
) -> Result<LaunchPlan> {
    let owner = nodes::get(conn, owner_id)?;
    let steps = list(conn, owner_id)?;
    if steps.is_empty() {
        return Err(anyhow!("«{}» non ha ancora passi di Avvio", owner.name));
    }

    let mut plans = Vec::new();
    let mut failures = Vec::new();
    for step in &steps {
        let request = Request {
            profile_id,
            node_id: &step.target.id,
            action_id: &step.action_id,
            tool_id: step.tool_id.as_deref(),
            via_workspace_id,
        };
        match actions::plan(conn, roots, &request) {
            Ok(plan) => plans.push(plan),
            Err(error) => failures.push((step.target.name.clone(), error.to_string())),
        }
    }

    // La conferma dell'Avvio e' la piu' severa fra il contenitore e i passi.
    let caution = plans
        .iter()
        .map(|plan| plan.caution)
        .chain(std::iter::once(
            crate::services::resolve::caution(conn, owner_id)?.level,
        ))
        .max()
        .unwrap_or(Caution::None);

    Ok(LaunchPlan {
        owner_name: owner.name,
        plans,
        failures,
        caution,
    })
}

impl LaunchPlan {
    /// Stessa barriera delle azioni singole, sul nome del contenitore.
    pub fn check_confirmation(&self, confirmation: Option<&str>) -> Result<()> {
        match (self.caution, confirmation) {
            (Caution::None, _) | (Caution::Confirm, Some(_)) => Ok(()),
            (Caution::TypeName, Some(typed))
                if typed.trim().to_lowercase() == self.owner_name.trim().to_lowercase() =>
            {
                Ok(())
            }
            _ => Err(anyhow!(actions::CONFIRMATION_REQUIRED)),
        }
    }

    pub fn count(&self) -> u32 {
        self.plans.iter().map(Plan::count).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::{child, database, workspace};
    use crate::domain::NodePatch;

    #[test]
    fn steps_live_inside_their_container_and_keep_their_order() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "SpecialHub");
        let dev = child(&conn, &profile, &project, NodeKind::Section, "DEV");
        let group = child(&conn, &profile, &dev, NodeKind::LinkGroup, "Console");
        child(&conn, &profile, &group, NodeKind::Link, "grafana");
        let docs = child(&conn, &profile, &project, NodeKind::Link, "docs");
        let outside = child(&conn, &profile, &ws, NodeKind::Link, "posta");

        assert!(
            add(&conn, &ws, &docs, "open", None).is_err(),
            "non su un workspace"
        );
        assert!(
            add(&conn, &project, &outside, "open", None).is_err(),
            "fuori dal progetto"
        );
        assert!(
            add(&conn, &project, &docs, "terminal", None).is_err(),
            "azione sbagliata"
        );

        let first = add(&conn, &project, &group, "open", None).unwrap();
        let second = add(&conn, &project, &docs, "open", None).unwrap();
        move_step(&conn, &second.id, None, Some(&first.id)).unwrap();
        let order: Vec<String> = list(&conn, &project)
            .unwrap()
            .into_iter()
            .map(|step| step.target.name)
            .collect();
        assert_eq!(order, vec!["docs", "Console"]);

        let launch = plan(&conn, &Roots::default(), &profile, &project, None).unwrap();
        assert_eq!(launch.plans.len(), 2);
        assert_eq!(launch.count(), 2, "il gruppo apre un link, il link uno");
        assert!(launch.check_confirmation(None).is_ok());

        // Un passo che chiede conferma rende prudente tutto l'Avvio.
        let patch = NodePatch {
            caution: Some(Some(Caution::TypeName)),
            ..NodePatch::default()
        };
        nodes::update(&conn, &dev, &patch).unwrap();
        let launch = plan(&conn, &Roots::default(), &profile, &project, None).unwrap();
        assert_eq!(launch.caution, Caution::TypeName);
        assert!(launch.check_confirmation(Some("Console")).is_err());
        assert!(launch.check_confirmation(Some("specialhub")).is_ok());

        remove(&conn, &first.id).unwrap();
        assert_eq!(list(&conn, &project).unwrap().len(), 1);
    }

    #[test]
    fn a_broken_step_does_not_stop_the_others() {
        let (conn, profile) = database();
        let ws = workspace(&conn, &profile, "Lavoro");
        let project = child(&conn, &profile, &ws, NodeKind::Project, "Portale");
        let missing = child(&conn, &profile, &project, NodeKind::Path, "repo");
        let docs = child(&conn, &profile, &project, NodeKind::Link, "docs");
        add(&conn, &project, &missing, "open", None).unwrap();
        add(&conn, &project, &docs, "open", None).unwrap();

        let launch = plan(&conn, &Roots::default(), &profile, &project, None).unwrap();
        assert_eq!(launch.plans.len(), 1);
        assert_eq!(launch.failures.len(), 1);
        assert_eq!(launch.failures[0].0, "repo");
    }
}
