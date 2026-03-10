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
    echo "[openclawdeploy] install.sh currently supports macOS and Linux only. Use install.ps1 on Windows." >&2
    exit 1
    ;;
esac

INSTALLER_URL="${OPENCLAWDEPLOY_INSTALLER_URL:-https://openclaw.ai/install.sh}"
if [[ -n "${OPENCLAWDEPLOY_NPM_REGISTRY:-}" ]]; then
  export npm_config_registry="$OPENCLAWDEPLOY_NPM_REGISTRY"
  export NPM_CONFIG_REGISTRY="$OPENCLAWDEPLOY_NPM_REGISTRY"
fi

if [[ "$SKIP_INSTALL" != "1" ]]; then
  echo "[openclawdeploy] Installing OpenClaw CLI using script: $INSTALLER_URL (interactive onboard skipped)..."
  curl -fsSL --proto '=https' --tlsv1.2 "$INSTALLER_URL" | bash -s -- --no-onboard
else
  echo "[openclawdeploy] Skipped OpenClaw CLI installation."
fi

NODE_CMD="${OPENCLAWDEPLOY_NODE:-node}"

if ! command -v "$NODE_CMD" >/dev/null 2>&1 && [[ ! -x "$NODE_CMD" ]]; then
  echo "[openclawdeploy] node was not found. Please confirm OpenClaw was installed successfully and Node is available in PATH." >&2
  exit 1
fi

"$NODE_CMD" "$SCRIPT_DIR/scripts/deploy.mjs" "${PASS_ARGS[@]}"
