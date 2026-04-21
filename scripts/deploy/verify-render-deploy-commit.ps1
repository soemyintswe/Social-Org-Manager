param(
  [string]$RenderBaseUrl = "",
  [string]$LocalRef = "HEAD",
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

function Resolve-RenderBaseUrl {
  param([string]$Provided)
  $raw = "$Provided".Trim()
  if (-not [string]::IsNullOrWhiteSpace($raw)) {
    return $raw.TrimEnd("/")
  }

  $fromEnv = "$env:EXPO_PUBLIC_SERVER_API_URL".Trim()
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    return $fromEnv.TrimEnd("/")
  }

  throw "RenderBaseUrl is required (or set EXPO_PUBLIC_SERVER_API_URL)."
}

function Get-LocalCommitHash {
  param([string]$RefName)
  $hash = (& git rev-parse $RefName 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve local git ref: $RefName"
  }
  $value = "$hash".Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Local git commit hash is empty."
  }
  return $value
}

function Normalize-CommitHash {
  param([string]$Value)
  $hash = "$Value".Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($hash)) { return "" }
  if ($hash -notmatch "^[0-9a-f]{7,40}$") { return "" }
  return $hash
}

$baseUrl = Resolve-RenderBaseUrl -Provided $RenderBaseUrl
$healthUrl = "$baseUrl/api/sync/health"
$localCommit = Get-LocalCommitHash -RefName $LocalRef

$health = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec $TimeoutSec
$remoteCommit = Normalize-CommitHash -Value "$($health.commitHash)"
$remoteSource = "$($health.commitSource)".Trim()

$match = $false
if (-not [string]::IsNullOrWhiteSpace($remoteCommit)) {
  $match = $localCommit.StartsWith($remoteCommit) -or $remoteCommit.StartsWith($localCommit)
}

$result = [ordered]@{
  ok = $match
  renderBaseUrl = $baseUrl
  healthUrl = $healthUrl
  localRef = $LocalRef
  localCommit = $localCommit
  remoteCommit = $remoteCommit
  remoteCommitSource = $remoteSource
  healthTimestamp = "$($health.ts)"
  reason = if ($match) { "match" } elseif ([string]::IsNullOrWhiteSpace($remoteCommit)) { "remote_commit_missing" } else { "commit_mismatch" }
}

$result | ConvertTo-Json -Depth 10

if (-not $match) {
  exit 2
}
