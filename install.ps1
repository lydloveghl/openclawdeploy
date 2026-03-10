param(
  [switch]$SkipOpenClawInstall,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$DeployArgs
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[openclawdeploy] WSL2 is recommended on Windows, but native PowerShell install is also supported."

$installerUrl = $env:OPENCLAWDEPLOY_INSTALLER_URL
if (-not $installerUrl) {
  $installerUrl = 'https://openclaw.ai/install.ps1'
}
if ($env:OPENCLAWDEPLOY_NPM_REGISTRY) {
  $env:npm_config_registry = $env:OPENCLAWDEPLOY_NPM_REGISTRY
  $env:NPM_CONFIG_REGISTRY = $env:OPENCLAWDEPLOY_NPM_REGISTRY
}

if (-not $SkipOpenClawInstall) {
  Write-Host "[openclawdeploy] Installing OpenClaw CLI using script: $installerUrl (interactive onboard skipped)..."
  $invokeParams = @{ Uri = $installerUrl }
  if ($PSVersionTable.PSVersion.Major -lt 6) {
    $invokeParams.UseBasicParsing = $true
  }
  $installer = Invoke-WebRequest @invokeParams
  $scriptBlock = [scriptblock]::Create($installer.Content)
  & $scriptBlock -NoOnboard
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
