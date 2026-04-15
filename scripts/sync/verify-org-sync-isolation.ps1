param(
  [string]$OrgId = "ORG001",
  [string]$LanBaseUrl = "http://localhost:5000",
  [string]$CloudEndpoint = "",
  [string]$CloudApiKey = "",
  [string]$CloudFolderBase = "OrgHub Sync",
  [string]$CompareOrgId = "ORG000"
)

$ErrorActionPreference = "Stop"

function Resolve-ScopedFolderName {
  param(
    [string]$BaseFolder,
    [string]$TargetOrgId
  )
  if ([string]::IsNullOrWhiteSpace($BaseFolder)) {
    $base = "OrgHub Sync"
  } else {
    $base = $BaseFolder.Trim()
  }
  $org = ("$TargetOrgId").Trim().ToUpperInvariant()
  if ([string]::IsNullOrWhiteSpace($org)) { return $base }
  if ($org -eq "ORG000") { return $base }
  if ($base.ToLowerInvariant().Contains($org.ToLowerInvariant())) { return $base }
  return "$base-$org"
}

function Get-JsonProp {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
}

function Parse-JsonOrNull {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
  try { return $Raw | ConvertFrom-Json } catch { return $null }
}

function Get-SnapshotSummary {
  param(
    [Parameter(Mandatory = $true)]$Snapshot,
    [string]$Label = ""
  )

  $data = $Snapshot.data
  $members = @()
  $users = @()
  $settings = $null
  $scopeMeta = $null

  $membersRaw = Get-JsonProp -Object $data -Name "@orghub_members"
  $usersRaw = Get-JsonProp -Object $data -Name "@orghub_users"
  $settingsRaw = Get-JsonProp -Object $data -Name "@orghub_account_settings"
  $scopeRaw = Get-JsonProp -Object $data -Name "@orghub_sync_scope_meta"

  if (-not [string]::IsNullOrWhiteSpace("$membersRaw")) {
    $parsed = Parse-JsonOrNull -Raw "$membersRaw"
    if ($parsed -is [System.Collections.IEnumerable]) { $members = @($parsed) }
  }
  if (-not [string]::IsNullOrWhiteSpace("$usersRaw")) {
    $parsed = Parse-JsonOrNull -Raw "$usersRaw"
    if ($parsed -is [System.Collections.IEnumerable]) { $users = @($parsed) }
  }
  if (-not [string]::IsNullOrWhiteSpace("$settingsRaw")) {
    $settings = Parse-JsonOrNull -Raw "$settingsRaw"
  }
  if (-not [string]::IsNullOrWhiteSpace("$scopeRaw")) {
    $scopeMeta = Parse-JsonOrNull -Raw "$scopeRaw"
  }

  return [ordered]@{
    label = $Label
    updatedAt = "$($Snapshot.updatedAt)"
    source = "$($Snapshot.source)"
    settingsOrgId = if ($settings) { "$($settings.orgId)".Trim().ToUpperInvariant() } else { "" }
    scopeOrgId = if ($scopeMeta) { "$($scopeMeta.orgId)".Trim().ToUpperInvariant() } else { "" }
    memberCount = @($members).Count
    userCount = @($users).Count
  }
}

$targetOrgId = "$OrgId".Trim().ToUpperInvariant()
if ([string]::IsNullOrWhiteSpace($targetOrgId)) {
  throw "OrgId is required."
}
$compareOrg = "$CompareOrgId".Trim().ToUpperInvariant()
$cloudFolder = Resolve-ScopedFolderName -BaseFolder $CloudFolderBase -TargetOrgId $targetOrgId

$lanHealth = $null
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$LanBaseUrl/api/sync/health" -Method Get -TimeoutSec 20
  $lanHealth = [ordered]@{ ok = $true; status = $r.StatusCode }
} catch {
  $lanHealth = [ordered]@{ ok = $false; status = 0; reason = $_.Exception.Message }
}

$lanTargetSnapshot = Invoke-RestMethod -Method Get -Uri "$LanBaseUrl/api/sync/snapshot?orgId=$targetOrgId"
$lanTargetSummary = Get-SnapshotSummary -Snapshot $lanTargetSnapshot -Label "LAN:$targetOrgId"

$lanCompareSummary = $null
if (-not [string]::IsNullOrWhiteSpace($compareOrg)) {
  try {
    $lanCompareSnapshot = Invoke-RestMethod -Method Get -Uri "$LanBaseUrl/api/sync/snapshot?orgId=$compareOrg"
    $lanCompareSummary = Get-SnapshotSummary -Snapshot $lanCompareSnapshot -Label "LAN:$compareOrg"
  } catch {
    $lanCompareSummary = [ordered]@{
      label = "LAN:$compareOrg"
      error = $_.Exception.Message
    }
  }
}

$cloudHealth = $null
$cloudTargetSummary = $null
if (-not [string]::IsNullOrWhiteSpace($CloudEndpoint)) {
  $cloudHealthPayload = @{
    action = "health"
    apiKey = $CloudApiKey
    folderName = $cloudFolder
  } | ConvertTo-Json -Depth 20
  $cloudHealth = Invoke-RestMethod -Method Post -Uri $CloudEndpoint -ContentType "application/json" -Body $cloudHealthPayload

  $cloudPullPayload = @{
    action = "pullSnapshot"
    apiKey = $CloudApiKey
    folderName = $cloudFolder
  } | ConvertTo-Json -Depth 20
  $cloudPull = Invoke-RestMethod -Method Post -Uri $CloudEndpoint -ContentType "application/json" -Body $cloudPullPayload
  if (-not $cloudPull.ok -or -not $cloudPull.snapshot) {
    throw "Cloud pull failed: $($cloudPull.reason)"
  }
  $cloudTargetSummary = Get-SnapshotSummary -Snapshot $cloudPull.snapshot -Label "CLOUD:$targetOrgId"
}

$checks = [ordered]@{
  lanScopeMatch = ($lanTargetSummary.scopeOrgId -eq $targetOrgId)
  lanSettingsOrgMatch = ($lanTargetSummary.settingsOrgId -eq $targetOrgId)
  cloudScopeMatch = if ($cloudTargetSummary) { $cloudTargetSummary.scopeOrgId -eq $targetOrgId } else { $null }
  cloudSettingsOrgMatch = if ($cloudTargetSummary) { $cloudTargetSummary.settingsOrgId -eq $targetOrgId } else { $null }
  orgCountDifferenceDetected = if ($lanCompareSummary -and $lanCompareSummary.memberCount -ne $null) {
    ($lanTargetSummary.memberCount -ne $lanCompareSummary.memberCount)
  } else { $null }
}

$result = [ordered]@{
  orgId = $targetOrgId
  compareOrgId = $compareOrg
  lanBaseUrl = $LanBaseUrl
  cloudEndpoint = $CloudEndpoint
  cloudFolderName = $cloudFolder
  lanHealth = $lanHealth
  cloudHealth = $cloudHealth
  targetLan = $lanTargetSummary
  targetCloud = $cloudTargetSummary
  compareLan = $lanCompareSummary
  checks = $checks
}

$result | ConvertTo-Json -Depth 20
