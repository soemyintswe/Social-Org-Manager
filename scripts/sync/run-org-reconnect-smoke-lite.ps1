param(
  [string]$RenderBaseUrl = "https://social-org-manager.onrender.com",
  [string]$ExpectedRef = "HEAD",
  [string]$OrgA = "ORG001",
  [string]$OrgB = "ORG002",
  [int]$HealthTimeoutSec = 25,
  [int]$HealthAttempts = 3,
  [int]$HealthDelayMs = 1500
)

$ErrorActionPreference = "Stop"

function Normalize-OrgId {
  param([string]$Value)
  return "$Value".Trim().ToUpperInvariant()
}

function Normalize-CommitHash {
  param([string]$Value)
  $hash = "$Value".Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($hash)) { return "" }
  if ($hash -notmatch "^[0-9a-f]{7,40}$") { return "" }
  return $hash
}

function Get-LocalCommit {
  param([string]$RefName)
  $hash = (& git rev-parse $RefName 2>$null)
  if ($LASTEXITCODE -ne 0) { return "" }
  return Normalize-CommitHash "$hash"
}

function Read-OrgSnapshotSummary {
  param([string]$OrgId)
  $id = Normalize-OrgId $OrgId
  $path = Join-Path (Get-Location) "server\data\orgs\$id\sync-snapshot.json"
  if (-not (Test-Path -LiteralPath $path)) {
    return [ordered]@{
      orgId = $id
      found = $false
      path = $path
      scopeOrgId = ""
      settingsOrgId = ""
      memberCount = 0
      userCount = 0
    }
  }

  $raw = Get-Content -Raw -LiteralPath $path
  $snap = $raw | ConvertFrom-Json
  $data = $snap.data

  $members = @()
  $users = @()
  $scope = $null
  $settings = $null

  if ($data.PSObject.Properties.Name -contains "@orghub_members") {
    try { $members = @((($data."@orghub_members") | ConvertFrom-Json)) } catch {}
  }
  if ($data.PSObject.Properties.Name -contains "@orghub_users") {
    try { $users = @((($data."@orghub_users") | ConvertFrom-Json)) } catch {}
  }
  if ($data.PSObject.Properties.Name -contains "@orghub_sync_scope_meta") {
    try { $scope = (($data."@orghub_sync_scope_meta") | ConvertFrom-Json) } catch {}
  }
  if ($data.PSObject.Properties.Name -contains "@orghub_account_settings") {
    try { $settings = (($data."@orghub_account_settings") | ConvertFrom-Json) } catch {}
  }

  return [ordered]@{
    orgId = $id
    found = $true
    path = $path
    scopeOrgId = Normalize-OrgId "$($scope.orgId)"
    settingsOrgId = Normalize-OrgId "$($settings.orgId)"
    memberCount = @($members).Count
    userCount = @($users).Count
  }
}

$base = "$RenderBaseUrl".Trim().TrimEnd("/")
$healthUrl = "$base/api/sync/health"
$localCommit = Get-LocalCommit -RefName $ExpectedRef

$remoteCommit = ""
$remoteSource = ""
$healthOk = $false
$healthReason = ""
$attempts = [Math]::Max(1, $HealthAttempts)

for ($i = 1; $i -le $attempts; $i++) {
  try {
    $health = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec ([Math]::Max(5, $HealthTimeoutSec))
    $remoteCommit = Normalize-CommitHash "$($health.commitHash)"
    $remoteSource = "$($health.commitSource)".Trim()
    $healthOk = $true
    $healthReason = ""
    break
  } catch {
    $healthReason = $_.Exception.Message
    if ($i -lt $attempts) {
      Start-Sleep -Milliseconds ([Math]::Max(0, $HealthDelayMs) * $i)
    }
  }
}

$commitMatch = $false
if (-not [string]::IsNullOrWhiteSpace($localCommit) -and -not [string]::IsNullOrWhiteSpace($remoteCommit)) {
  $commitMatch = $localCommit.StartsWith($remoteCommit) -or $remoteCommit.StartsWith($localCommit)
}

$orgASummary = Read-OrgSnapshotSummary -OrgId $OrgA
$orgBSummary = Read-OrgSnapshotSummary -OrgId $OrgB

$checks = [ordered]@{
  renderHealthOk = $healthOk
  renderCommitMatch = $commitMatch
  orgAScopeMatch = ($orgASummary.scopeOrgId -eq (Normalize-OrgId $OrgA))
  orgASettingsMatch = ($orgASummary.settingsOrgId -eq (Normalize-OrgId $OrgA))
  orgBScopeMatch = ($orgBSummary.scopeOrgId -eq (Normalize-OrgId $OrgB))
  orgBSettingsMatch = ($orgBSummary.settingsOrgId -eq (Normalize-OrgId $OrgB))
  orgMemberCountsDifferent = ($orgASummary.memberCount -ne $orgBSummary.memberCount)
}

$result = [ordered]@{
  ok = (
    $checks.renderHealthOk -and
    $checks.renderCommitMatch -and
    $checks.orgAScopeMatch -and
    $checks.orgASettingsMatch -and
    $checks.orgBScopeMatch -and
    $checks.orgBSettingsMatch
  )
  timestamp = (Get-Date).ToString("o")
  render = [ordered]@{
    baseUrl = $base
    healthUrl = $healthUrl
    healthOk = $healthOk
    healthReason = $healthReason
    expectedRef = $ExpectedRef
    localCommit = $localCommit
    remoteCommit = $remoteCommit
    remoteSource = $remoteSource
  }
  orgA = $orgASummary
  orgB = $orgBSummary
  checks = $checks
}

$result | ConvertTo-Json -Depth 10

if (-not $result.ok) {
  exit 2
}
