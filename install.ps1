param(
  [switch]$SkipOpenClawInstall,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$DeployArgs
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OfficialInstallerUrl = 'https://openclaw.ai/install.ps1'
$OpenClawVersion = if ($env:OPENCLAWDEPLOY_OPENCLAW_VERSION) { $env:OPENCLAWDEPLOY_OPENCLAW_VERSION } else { 'latest' }

function Add-PathEntry {
  param([string]$Entry)

  if (-not $Entry) { return }
  if (-not (Test-Path $Entry)) { return }

  $parts = @($env:Path -split ';' | Where-Object { $_ })
  if ($parts -contains $Entry) { return }
  $env:Path = "$Entry;$env:Path"
}

function Get-InstallerUrls {
  $urls = @()

  if ($env:OPENCLAWDEPLOY_INSTALLER_URL) {
    $urls += $env:OPENCLAWDEPLOY_INSTALLER_URL
  }

  if ($env:OPENCLAWDEPLOY_INSTALLER_URL_FALLBACKS) {
    $extraUrls = $env:OPENCLAWDEPLOY_INSTALLER_URL_FALLBACKS -split '[,;]'
    foreach ($extraUrl in $extraUrls) {
      $trimmed = $extraUrl.Trim()
      if ($trimmed) {
        $urls += $trimmed
      }
    }
  }

  $urls += $OfficialInstallerUrl
  return @($urls | Where-Object { $_ } | Select-Object -Unique)
}

function Get-NpmCommand {
  foreach ($candidate in @('npm.cmd', 'npm')) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) {
      if ($cmd.Path) { return $cmd.Path }
      if ($cmd.Source) { return $cmd.Source }
    }
  }
  return $null
}

function Add-NpmGlobalBinToPath {
  param([string]$NpmCmd)

  if (-not $NpmCmd) { return }

  $prefixOutput = & $NpmCmd prefix -g 2>$null
  if ($LASTEXITCODE -ne 0) { return }

  $prefix = ($prefixOutput | Select-Object -Last 1).Trim()
  if (-not $prefix) { return }

  Add-PathEntry $prefix
}

function Invoke-RemoteInstaller {
  param([string]$InstallerUrl)

  Write-Host "[openclawdeploy] Installing OpenClaw CLI using script: $InstallerUrl (interactive onboard skipped)..."

  $invokeParams = @{ Uri = $InstallerUrl }
  if ($PSVersionTable.PSVersion.Major -lt 6) {
    $invokeParams.UseBasicParsing = $true
  }

  $installer = Invoke-WebRequest @invokeParams
  $scriptBlock = [scriptblock]::Create($installer.Content)
  & $scriptBlock -NoOnboard
}

function Install-OpenClawViaNpm {
  $npmCmd = Get-NpmCommand
  if (-not $npmCmd) {
    return $false
  }

  Write-Warning "[openclawdeploy] Remote installer was unavailable. Falling back to npm install -g openclaw@$OpenClawVersion"
  & $npmCmd install -g "openclaw@$OpenClawVersion"
  if ($LASTEXITCODE -ne 0) {
    throw "[openclawdeploy] npm fallback install failed with exit code $LASTEXITCODE"
  }

  Add-NpmGlobalBinToPath $npmCmd
  return $true
}

Write-Host "[openclawdeploy] WSL2 is recommended on Windows, but native PowerShell install is also supported."

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

if ($env:OPENCLAWDEPLOY_NPM_REGISTRY) {
  $env:npm_config_registry = $env:OPENCLAWDEPLOY_NPM_REGISTRY
  $env:NPM_CONFIG_REGISTRY = $env:OPENCLAWDEPLOY_NPM_REGISTRY
}

if (-not $SkipOpenClawInstall) {
  $installSucceeded = $false
  $attemptErrors = @()

  foreach ($installerUrl in (Get-InstallerUrls)) {
    try {
      Invoke-RemoteInstaller $installerUrl
      $installSucceeded = $true
      break
    } catch {
      $message = $_.Exception.Message
      if (-not $message) {
        $message = ($_ | Out-String).Trim()
      }
      Write-Warning "[openclawdeploy] Remote installer failed from ${installerUrl}: $message"
      $attemptErrors += "${installerUrl} -> ${message}"
    }
  }

  if (-not $installSucceeded) {
    $installSucceeded = Install-OpenClawViaNpm
  }

  if (-not $installSucceeded) {
    $details = if ($attemptErrors.Count -gt 0) {
      "`nAttempted installer URLs:`n - " + ($attemptErrors -join "`n - ")
    } else {
      ''
    }
    throw "[openclawdeploy] Failed to install OpenClaw automatically. Remote installer download failed and npm fallback was unavailable.$details`nSet OPENCLAWDEPLOY_INSTALLER_URL to a reachable mirror or install OpenClaw manually."
  }

  Add-NpmGlobalBinToPath (Get-NpmCommand)
} else {
  Write-Host "[openclawdeploy] Skipped OpenClaw CLI installation."
}

$nodeCmd = $env:OPENCLAWDEPLOY_NODE
if (-not $nodeCmd) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "[openclawdeploy] node was not found. Please confirm OpenClaw was installed successfully and Node is available in PATH."
  }
  $nodeCmd = $node.Path
  if (-not $nodeCmd) {
    $nodeCmd = $node.Source
  }
}

& $nodeCmd (Join-Path $ScriptDir 'scripts/deploy.mjs') @DeployArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
