#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_INSTALL=0
PASS_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --skip-openclaw-install)
      SKIP_INSTALL=1
      ;;
    *)
      PASS_ARGS+=("$arg")
      ;;
  esac
done

case "$(uname -s)" in
  Darwin|Linux)
    ;;
  *)
    echo "[openclawdeploy] 当前 install.sh 仅支持 macOS / Linux。Windows 请使用 install.ps1。" >&2
    exit 1
    ;;
esac

if [[ "$SKIP_INSTALL" != "1" ]]; then
  echo "[openclawdeploy] 开始安装 OpenClaw CLI（使用官方 install.sh，跳过交互式 onboard）..."
  curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- --no-onboard
else
  echo "[openclawdeploy] 已跳过 OpenClaw CLI 安装。"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[openclawdeploy] 未找到 node，请确认 OpenClaw 安装成功并已把 Node 加到 PATH。" >&2
  exit 1
fi

node "$SCRIPT_DIR/scripts/deploy.mjs" "${PASS_ARGS[@]}"
