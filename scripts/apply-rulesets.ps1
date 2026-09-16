<#
.SYNOPSIS
    Applica a GitHub i ruleset versionati in .github/rulesets/.

.DESCRIPTION
    I file JSON nel repository non sono attivi da soli: GitHub li conosce solo
    quando qualcuno li carica. Questo script lo fa con l'API, in modo ripetibile.

    Di suo non cambia niente: senza -Apply si limita a mostrare che cosa e' gia'
    configurato sul repository e che cosa farebbe. Con -Apply crea il ruleset se
    non esiste, oppure aggiorna quello con lo stesso nome — mai un duplicato.

.PARAMETER Repo
    owner/nome del repository. Predefinito: gicerre/llamadesk.

.PARAMETER Apply
    Esegue davvero le scritture. Senza questo interruttore e' una prova a vuoto.

.EXAMPLE
    pwsh scripts/apply-rulesets.ps1                     # mostra lo stato, non tocca nulla
    pwsh scripts/apply-rulesets.ps1 -Apply              # crea o aggiorna i ruleset

.NOTES
    Richiede GitHub CLI autenticato con permessi di amministrazione sul
    repository:  gh auth login  (scope: repo, admin:repo_hook, workflow)
#>

[CmdletBinding()]
param(
    [string] $Repo = 'gicerre/llamadesk',
    [switch] $Apply
)

$ErrorActionPreference = 'Stop'

$gh = (Get-Command gh -ErrorAction SilentlyContinue)?.Source
if (-not $gh) { $gh = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe' }
if (-not (Test-Path $gh)) { throw "GitHub CLI non trovato. Installalo con: winget install --id GitHub.cli -e" }

& $gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI non autenticato. Esegui prima: gh auth login" }

$root = Split-Path $PSScriptRoot -Parent
$files = @(
    (Join-Path $root '.github/rulesets/protected-branches.json'),
    (Join-Path $root '.github/rulesets/protected-release-tags.json')
)

Write-Host "Repository: $Repo" -ForegroundColor Cyan

# Ruleset gia' presenti: servono per aggiornare invece di duplicare, e per
# accorgersi di regole che qualcuno ha aggiunto a mano dalla pagina web.
$existing = & $gh api "repos/$Repo/rulesets" --jq '.[] | "\(.id)\t\(.name)\t\(.target)\t\(.enforcement)"'
if ($existing) {
    Write-Host "`nRuleset gia' presenti:" -ForegroundColor Cyan
    $existing | ForEach-Object { "  $_" }
} else {
    Write-Host "`nNessun ruleset presente." -ForegroundColor Cyan
}

# Anche le vecchie branch protection rules contano: se ce ne sono, convivono
# con i ruleset e la regola piu' restrittiva vince. Meglio saperlo.
foreach ($branch in @('main', 'develop')) {
    $protection = & $gh api "repos/$Repo/branches/$branch/protection" 2>$null
    if ($LASTEXITCODE -eq 0 -and $protection) {
        Write-Warning "Il branch '$branch' ha anche una branch protection rule classica: verificala su GitHub per non avere due configurazioni sovrapposte."
    }
}

$map = @{}
if ($existing) {
    foreach ($row in $existing) {
        $parts = $row -split "`t"
        $map[$parts[1]] = $parts[0]
    }
}

foreach ($file in $files) {
    if (-not (Test-Path $file)) { throw "File mancante: $file" }
    $name = (Get-Content $file -Raw | ConvertFrom-Json).name
    $id = $map[$name]

    if ($id) {
        $action = "AGGIORNA ruleset '$name' (id $id)"
        $method = 'PUT'
        $endpoint = "repos/$Repo/rulesets/$id"
    } else {
        $action = "CREA ruleset '$name'"
        $method = 'POST'
        $endpoint = "repos/$Repo/rulesets"
    }

    if (-not $Apply) {
        Write-Host "`n[prova a vuoto] $action" -ForegroundColor Yellow
        Write-Host "                $method $endpoint  <  $(Split-Path $file -Leaf)"
        continue
    }

    Write-Host "`n$action" -ForegroundColor Green
    & $gh api --method $method $endpoint --input $file --jq '"  -> \(.name): \(.enforcement), id \(.id)"'
    if ($LASTEXITCODE -ne 0) { throw "Chiamata fallita: $method $endpoint" }
}

if (-not $Apply) {
    Write-Host "`nNiente e' stato modificato. Ripeti con -Apply per applicare." -ForegroundColor Yellow
}
