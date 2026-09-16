# Repository rulesets

The two JSON files here describe how `gicerre/llamadesk` must be protected.

**They are documentation until someone uploads them.** GitHub does not read rulesets from a
repository's files: it only knows the ones stored in its own settings. Keeping them versioned
means the configuration can be reviewed in a pull request, restored after a mistake, and
compared with what is actually live.

| File | Applies to | What it does |
| --- | --- | --- |
| `protected-branches.json` | `refs/heads/main`, `refs/heads/develop` | Pull request with 1 approval, code owner review, resolved conversations, CI green and branch up to date; no force push, no deletion |
| `protected-release-tags.json` | `refs/tags/v*` | Release tags cannot be created, moved or deleted |

Both allow **repository admins** to bypass (`actor_id: 5`, `RepositoryRole`). This is deliberate:
the project has a single maintainer, and GitHub does not let anyone approve their own pull
request — without the bypass, `main` and `develop` would be unmergeable. Contributors, including
anyone given write access later, are not exempt from anything.

## Apply them

Needs [GitHub CLI](https://cli.github.com/) authenticated as a repository admin:

```powershell
gh auth login                             # scope: repo, workflow
pwsh scripts/apply-rulesets.ps1           # shows what exists and what would change
pwsh scripts/apply-rulesets.ps1 -Apply    # creates or updates them
```

The script matches rulesets **by name**, so running it twice updates instead of duplicating. It
also warns if a branch still has a classic branch protection rule, which would sit on top of the
ruleset.

Without the CLI, the same thing by hand:

```bash
gh api --method POST repos/gicerre/llamadesk/rulesets \
  --input .github/rulesets/protected-branches.json
gh api --method POST repos/gicerre/llamadesk/rulesets \
  --input .github/rulesets/protected-release-tags.json
```

## Check what is live

```bash
gh api repos/gicerre/llamadesk/rulesets
gh api repos/gicerre/llamadesk/rulesets/<id>
```

## Required status checks

The branch ruleset requires the three CI jobs by name — `frontend`, `backend`, `privacy-guard` —
from the GitHub Actions app (`integration_id: 15368`). **Renaming a job in
[`ci.yml`](../workflows/ci.yml) breaks the rule**: the old name would never report, and every
pull request would wait forever. Change both together.

## What is not covered here

These settings live in the GitHub web interface and have no API-versioned equivalent in this
repository:

- who has write access to the repository (Settings › Collaborators);
- Actions permissions for pull requests from forks (Settings › Actions › General — keep
  *Require approval for all external contributors*);
- the default `GITHUB_TOKEN` permission (Settings › Actions › General — set it to
  **read repository contents**; both workflows declare what they need anyway).
