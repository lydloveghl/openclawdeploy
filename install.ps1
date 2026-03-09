param(
  [switch]$SkipOpenClawInstall,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$DeployArgs
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[openclawdeploy] Windows 官方推荐优先使用 WSL2，但这里也支持原生 PowerShell 安装。"

$installerUrl = $env:OPENCLAWDEPLOY_INSTALLER_URL
if (-not $installerUrl) {
  $installerUrl = 'https://openclaw.ai/install.ps1'
}
if ($env:OPENCLAWDEPLOY_NPM_REGISTRY) {
  $env:npm_config_registry = $env:OPENCLAWDEPLOY_NPM_REGISTRY
  $env:NPM_CONFIG_REGISTRY = $env:OPENCLAWDEPLOY_NPM_REGISTRY
}

if (-not $SkipOpenClawInstall) {
  Write-Host "[openclawdeploy] 开始安装 OpenClaw CLI（使用安装脚本：$installerUrl，跳过交互式 onboard）..."
  $installer = Invoke-WebRequest -UseBasicParsing $installerUrl
  $scriptBlock = [scriptblock]::Create($installer.Content)
  & $scriptBlock -NoOnboard
} else {
  Write-Host "[openclawdeploy] 已跳过 OpenClaw CLI 安装。"
}

$nodeCmd = $env:OPENCLAWDEPLOY_NODE
if (-not $nodeCmd) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "[openclawdeploy] 未找到 node，请确认 OpenClaw 安装成功并已把 Node 加到 PATH。"
  }
  $nodeCmd = $node.Source
}

& $nodeCmd (Join-Path $ScriptDir 'scripts/deploy.mjs') @DeployArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
