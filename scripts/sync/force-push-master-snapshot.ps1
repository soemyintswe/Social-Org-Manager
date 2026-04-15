param(
  [string]$OrgId = "ORG001",
  [string]$LanBaseUrl = "http://localhost:5000",
  [string]$SnapshotPath = "",
  [string]$CloudEndpoint = "",
  [string]$CloudApiKey = "",
  [string]$CloudFolderBase = "OrgHub Sync"
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
  $org = ($TargetOrgId | ForEach-Object { "$_".Trim().ToUpperInvariant() })
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

$normalizedOrgId = "$OrgId".Trim().ToUpperInvariant()
if ([string]::IsNullOrWhiteSpace($normalizedOrgId)) {
  throw "OrgId is required."
}

if ([string]::IsNullOrWhiteSpace($SnapshotPath)) {
  $SnapshotPath = "server/data/orgs/$normalizedOrgId/sync-snapshot.json"
}
if (-not (Test-Path -LiteralPath $SnapshotPath)) {
  throw "Snapshot file not found: $SnapshotPath"
}

$cloudFolderName = Resolve-ScopedFolderName -BaseFolder $CloudFolderBase -TargetOrgId $normalizedOrgId
$raw = Get-Content -LiteralPath $SnapshotPath -Raw
$snapshot = $raw | ConvertFrom-Json
if ($null -eq $snapshot -or $null -eq $snapshot.data) {
  throw "Invalid snapshot format in $SnapshotPath (missing data)."
}

$now = (Get-Date).ToString("o")
$scopeMeta = @{
  orgId = $normalizedOrgId
  version = 1
  generatedAt = $now
  source = "manual_force_master"
} | ConvertTo-Json -Compress

$snapshot.data | Add-Member -NotePropertyName "@orghub_sync_scope_meta" -NotePropertyValue $scopeMeta -Force
$snapshot.updatedAt = $now
$snapshot.source = "manual_force_master"

$lanPayload = @{
  updatedAt = $snapshot.updatedAt
  source = $snapshot.source
  orgId = $normalizedOrgId
  data = $snapshot.data
} | ConvertTo-Json -Depth 100

$lanPushResult = Invoke-RestMethod `
  -Method Post `
  -Uri "$LanBaseUrl/api/sync/snapshot?orgId=$normalizedOrgId" `
  -ContentType "application/json" `
  -Body $lanPayload

$cloudPushResult = $null
$cloudPullResult = $null
if (-not [string]::IsNullOrWhiteSpace($CloudEndpoint)) {
  $cloudPayload = @{
    action = "pushSnapshot"
    apiKey = $CloudApiKey
    folderName = $cloudFolderName
    snapshot = @{
      updatedAt = $snapshot.updatedAt
      source = $snapshot.source
      data = $snapshot.data
    }
  } | ConvertTo-Json -Depth 100

  $cloudPushResult = Invoke-RestMethod `
    -Method Post `
    -Uri $CloudEndpoint `
    -ContentType "application/json" `
    -Body $cloudPayload

  $cloudPullPayload = @{
    action = "pullSnapshot"
    apiKey = $CloudApiKey
    folderName = $cloudFolderName
  } | ConvertTo-Json -Depth 20

  $cloudPullResult = Invoke-RestMethod `
    -Method Post `
    -Uri $CloudEndpoint `
    -ContentType "application/json" `
    -Body $cloudPullPayload
}

$lanPullResult = Invoke-RestMethod -Method Get -Uri "$LanBaseUrl/api/sync/snapshot?orgId=$normalizedOrgId"
$lanMetaRaw = Get-JsonProp -Object $lanPullResult.data -Name "@orghub_sync_scope_meta"
$lanMeta = $null
if (-not [string]::IsNullOrWhiteSpace("$lanMetaRaw")) {
  $lanMeta = "$lanMetaRaw" | ConvertFrom-Json
}

$cloudMeta = $null
if ($null -ne $cloudPullResult -and $cloudPullResult.snapshot -and $cloudPullResult.snapshot.data) {
  $cloudMetaRaw = Get-JsonProp -Object $cloudPullResult.snapshot.data -Name "@orghub_sync_scope_meta"
  if (-not [string]::IsNullOrWhiteSpace("$cloudMetaRaw")) {
    $cloudMeta = "$cloudMetaRaw" | ConvertFrom-Json
  }
}

$result = [ordered]@{
  orgId = $normalizedOrgId
  snapshotPath = $SnapshotPath
  lanPushOk = [bool]$lanPushResult.ok
  lanPushUpdatedAt = $lanPushResult.updatedAt
  lanScopeOrgId = if ($lanMeta) { $lanMeta.orgId } else { "" }
  cloudFolderName = $cloudFolderName
  cloudPushOk = if ($null -eq $cloudPushResult) { $null } else { [bool]$cloudPushResult.ok }
  cloudPushReason = if ($null -eq $cloudPushResult) { "" } else { "$($cloudPushResult.reason)" }
  cloudPushUpdatedAt = if ($null -eq $cloudPushResult) { "" } else { "$($cloudPushResult.updatedAt)" }
  cloudScopeOrgId = if ($cloudMeta) { $cloudMeta.orgId } else { "" }
}

$result | ConvertTo-Json -Depth 20
