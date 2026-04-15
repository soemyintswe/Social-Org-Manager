param(
  [switch]$Apply,
  [string]$BaseDir = "server/data/orgs",
  [string]$EnvFile = ".env",
  [switch]$SkipEnvUpdate
)

$ErrorActionPreference = "Stop"

$OrgMap = [ordered]@{
  "ORG000" = "ORG001"
  "ORG001" = "ORG002"
}

function Read-SnapshotSummary {
  param(
    [string]$SnapshotPath
  )
  if (-not (Test-Path -LiteralPath $SnapshotPath)) {
    return [ordered]@{
      file = $SnapshotPath
      exists = $false
      memberCount = 0
      settingsOrgId = ""
      scopeOrgId = ""
      updatedAt = ""
    }
  }
  $raw = Get-Content -LiteralPath $SnapshotPath -Raw
  $obj = $raw | ConvertFrom-Json
  $members = @()
  $settingsOrgId = ""
  $scopeOrgId = ""
  $membersRaw = $obj.data.'@orghub_members'
  if ($membersRaw) { $members = @($membersRaw | ConvertFrom-Json) }
  $settingsRaw = $obj.data.'@orghub_account_settings'
  if ($settingsRaw) {
    $settings = $settingsRaw | ConvertFrom-Json
    $settingsOrgId = [string]$settings.orgId
  }
  $scopeRaw = $obj.data.'@orghub_sync_scope_meta'
  if ($scopeRaw) {
    try {
      $scope = $scopeRaw | ConvertFrom-Json
      $scopeOrgId = [string]$scope.orgId
    } catch {
      $scopeOrgId = ""
    }
  }
  return [ordered]@{
    file = $SnapshotPath
    exists = $true
    memberCount = @($members).Count
    settingsOrgId = $settingsOrgId
    scopeOrgId = $scopeOrgId
    updatedAt = [string]$obj.updatedAt
  }
}

function Normalize-SnapshotOrgId {
  param(
    [string]$SnapshotPath,
    [string]$TargetOrgId
  )
  if (-not (Test-Path -LiteralPath $SnapshotPath)) { return }
  $raw = Get-Content -LiteralPath $SnapshotPath -Raw
  $obj = $raw | ConvertFrom-Json
  if (-not $obj.data) { return }

  $settingsRaw = $obj.data.'@orghub_account_settings'
  if ($settingsRaw) {
    try {
      $settings = $settingsRaw | ConvertFrom-Json
      $settings.orgId = $TargetOrgId
      $obj.data.'@orghub_account_settings' = ($settings | ConvertTo-Json -Compress -Depth 50)
    } catch {
      # keep raw
    }
  }

  $scopeMeta = [ordered]@{
    orgId = $TargetOrgId
    version = 1
    generatedAt = (Get-Date).ToString("o")
    source = "org-id-sequence-migration"
  } | ConvertTo-Json -Compress -Depth 20
  $obj.data | Add-Member -NotePropertyName "@orghub_sync_scope_meta" -NotePropertyValue $scopeMeta -Force

  $obj.updatedAt = (Get-Date).ToString("o")
  $obj.source = "org-id-sequence-migration"
  Set-Content -LiteralPath $SnapshotPath -Value ($obj | ConvertTo-Json -Depth 100) -Encoding UTF8
}

function Update-EnvManagedOrgConfigs {
  param(
    [string]$Path,
    [hashtable]$Map
  )
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $lines = Get-Content -LiteralPath $Path
  $idx = -1
  for ($i = 0; $i -lt $lines.Count; $i += 1) {
    if ($lines[$i].StartsWith("EXPO_PUBLIC_MANAGED_ORG_CONFIGS=")) {
      $idx = $i
      break
    }
  }
  if ($idx -lt 0) { return }

  $prefix = "EXPO_PUBLIC_MANAGED_ORG_CONFIGS="
  $jsonRaw = $lines[$idx].Substring($prefix.Length)
  $parsed = $jsonRaw | ConvertFrom-Json
  $original = @{}
  foreach ($p in $parsed.PSObject.Properties) {
    $original[$p.Name] = $p.Value
  }

  $migrated = @{}
  foreach ($entry in $original.GetEnumerator()) {
    $k = [string]$entry.Key
    $v = $entry.Value
    if ($Map.Contains($k)) {
      $migrated[$Map[$k]] = $v
    } else {
      $migrated[$k] = $v
    }
  }

  $lines[$idx] = $prefix + ($migrated | ConvertTo-Json -Compress -Depth 30)
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

Write-Output "== ORG ID sequence migration plan =="
foreach ($entry in $OrgMap.GetEnumerator()) {
  Write-Output ("- " + $entry.Key + " -> " + $entry.Value)
}

$resolvedBase = Resolve-Path -LiteralPath $BaseDir -ErrorAction Stop
Write-Output ("BaseDir: " + $resolvedBase)

foreach ($entry in $OrgMap.GetEnumerator()) {
  $sourceDir = Join-Path $resolvedBase $entry.Key
  $targetDir = Join-Path $resolvedBase $entry.Value
  $sourceSnapshot = Join-Path $sourceDir "sync-snapshot.json"
  $summary = Read-SnapshotSummary -SnapshotPath $sourceSnapshot
  Write-Output ("Source " + $entry.Key + " summary: " + ($summary | ConvertTo-Json -Compress))
  if ((-not $Apply) -and (Test-Path -LiteralPath $targetDir) -and (-not $OrgMap.Contains($entry.Value))) {
    Write-Output ("WARNING: target dir already exists and is not remapped: " + $targetDir)
  }
}

if (-not $Apply) {
  Write-Output ""
  Write-Output "Dry run completed. Re-run with -Apply to execute migration."
  exit 0
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path (Split-Path -Parent $resolvedBase) ("orgs_migration_backup_" + $timestamp)
$envBackup = $EnvFile + ".backup." + $timestamp
$tempMoved = @{}

try {
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  foreach ($entry in $OrgMap.GetEnumerator()) {
    $sourceDir = Join-Path $resolvedBase $entry.Key
    if (Test-Path -LiteralPath $sourceDir) {
      Copy-Item -LiteralPath $sourceDir -Destination $backupDir -Recurse -Force
    }
  }
  Write-Output ("Backup created: " + $backupDir)

  if ((-not $SkipEnvUpdate) -and (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath $EnvFile -Destination $envBackup -Force
    Update-EnvManagedOrgConfigs -Path $EnvFile -Map $OrgMap
    Write-Output ("Updated managed org config in .env (backup: " + $envBackup + ")")
  }

  foreach ($entry in $OrgMap.GetEnumerator()) {
    $sourceDir = Join-Path $resolvedBase $entry.Key
    if (-not (Test-Path -LiteralPath $sourceDir)) { continue }
    $tempName = $entry.Key + "__MIGTMP_" + $timestamp
    $tempPath = Join-Path $resolvedBase $tempName
    Move-Item -LiteralPath $sourceDir -Destination $tempPath
    $tempMoved[$entry.Key] = $tempName
  }

  foreach ($entry in $OrgMap.GetEnumerator()) {
    $oldId = $entry.Key
    $newId = $entry.Value
    if (-not $tempMoved.Contains($oldId)) { continue }
    $tempPath = Join-Path $resolvedBase $tempMoved[$oldId]
    $targetDir = Join-Path $resolvedBase $newId
    if (Test-Path -LiteralPath $targetDir) {
      throw "Target directory already exists: $targetDir"
    }
    Move-Item -LiteralPath $tempPath -Destination $targetDir
    $snapshot = Join-Path $targetDir "sync-snapshot.json"
    Normalize-SnapshotOrgId -SnapshotPath $snapshot -TargetOrgId $newId
  }

  Write-Output ""
  Write-Output "Migration completed."
  foreach ($entry in $OrgMap.GetEnumerator()) {
    $newSnapshot = Join-Path (Join-Path $resolvedBase $entry.Value) "sync-snapshot.json"
    $summary = Read-SnapshotSummary -SnapshotPath $newSnapshot
    Write-Output ("Target " + $entry.Value + " summary: " + ($summary | ConvertTo-Json -Compress))
  }
  Write-Output ("Backup preserved at: " + $backupDir)
} catch {
  $err = $_.Exception.Message
  Write-Output ("ERROR: " + $err)
  Write-Output "Attempting rollback from backup..."

  foreach ($id in $OrgMap.Keys + $OrgMap.Values + $tempMoved.Values) {
    $path = Join-Path $resolvedBase $id
    if (Test-Path -LiteralPath $path) {
      try { Remove-Item -LiteralPath $path -Recurse -Force } catch {}
    }
  }

  foreach ($entry in $OrgMap.GetEnumerator()) {
    $backupSource = Join-Path $backupDir $entry.Key
    $restoreTarget = Join-Path $resolvedBase $entry.Key
    if (Test-Path -LiteralPath $backupSource) {
      try { Copy-Item -LiteralPath $backupSource -Destination $restoreTarget -Recurse -Force } catch {}
    }
  }

  if ((-not $SkipEnvUpdate) -and (Test-Path -LiteralPath $envBackup)) {
    try { Copy-Item -LiteralPath $envBackup -Destination $EnvFile -Force } catch {}
  }

  Write-Output "Rollback completed."
  exit 1
}
