#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_INSTALL=0
PASS_ARGS=()
OFFICIAL_INSTALLER_URL="https://openclaw.ai/install.sh"
OPENCLAW_VERSION="${OPENCLAWDEPLOY_OPENCLAW_VERSION:-latest}"
INSTALLER_URLS=()

add_installer_url() {
  local url="${1:-}"
  [[ -z "$url" ]] && return
  local existing
  for existing in "${INSTALLER_URLS[@]:-}"; do
    [[ "$existing" == "$url" ]] && return
  done
  INSTALLER_URLS+=("$url")
}

add_path_entry() {
  local entry="${1:-}"
  [[ -z "$entry" ]] && return
  [[ -d "$entry" ]] || return
  case ":$PATH:" in
    *":$entry:"*) ;;
    *) export PATH="$entry:$PATH" ;;
  esac
}

get_npm_cmd() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return 0
  fi
  return 1
}

add_npm_global_bin_to_path() {
  local npm_cmd="${1:-}"
  [[ -n "$npm_cmd" ]] || return 0

  local prefix
  if ! prefix="$($npm_cmd prefix -g 2>/dev/null | tail -n1)"; then
    return 0
  fi
  [[ -n "$prefix" ]] || return 0

  add_path_entry "$prefix/bin"
}

run_remote_installer() {
  local installer_url="$1"
  echo "[openclawdeploy] Installing OpenClaw CLI using script: $installer_url (interactive onboard skipped)..."
  curl -fsSL --proto '=https' --tlsv1.2 "$installer_url" | bash -s -- --no-onboard
}

install_openclaw_via_npm() {
  local npm_cmd
  if ! npm_cmd="$(get_npm_cmd)"; then
    return 1
  fi

  echo "[openclawdeploy] Warning: remote installer was unavailable. Falling back to npm install -g openclaw@$OPENCLAW_VERSION" >&2
  "$npm_cmd" install -g "openclaw@$OPENCLAW_VERSION"
  add_npm_global_bin_to_path "$npm_cmd"
}

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

add_installer_url "${OPENCLAWDEPLOY_INSTALLER_URL:-}"
if [[ -n "${OPENCLAWDEPLOY_INSTALLER_URL_FALLBACKS:-}" ]]; then
  IFS=',;' read -r -a extra_installer_urls <<< "${OPENCLAWDEPLOY_INSTALLER_URL_FALLBACKS}"
  for extra_url in "${extra_installer_urls[@]}"; do
    add_installer_url "$extra_url"
  done
fi
add_installer_url "$OFFICIAL_INSTALLER_URL"

if [[ -n "${OPENCLAWDEPLOY_NPM_REGISTRY:-}" ]]; then
  export npm_config_registry="$OPENCLAWDEPLOY_NPM_REGISTRY"
  export NPM_CONFIG_REGISTRY="$OPENCLAWDEPLOY_NPM_REGISTRY"
fi

if [[ "$SKIP_INSTALL" != "1" ]]; then
  install_succeeded=0
  attempt_errors=()

  for installer_url in "${INSTALLER_URLS[@]}"; do
    if run_remote_installer "$installer_url"; then
      install_succeeded=1
      break
    fi

    echo "[openclawdeploy] Warning: remote installer failed from $installer_url" >&2
    attempt_errors+=("$installer_url")
  done

  if [[ "$install_succeeded" != "1" ]]; then
    if install_openclaw_via_npm; then
      install_succeeded=1
    fi
  fi

  if [[ "$install_succeeded" != "1" ]]; then
    echo "[openclawdeploy] Failed to install OpenClaw automatically. Remote installer download failed and npm fallback was unavailable." >&2
    if [[ "${#attempt_errors[@]}" -gt 0 ]]; then
      echo "[openclawdeploy] Attempted installer URLs:" >&2
      printf '  - %s\n' "${attempt_errors[@]}" >&2
    fi
    echo "[openclawdeploy] Set OPENCLAWDEPLOY_INSTALLER_URL to a reachable mirror or install OpenClaw manually." >&2
    exit 1
  fi

  if npm_cmd="$(get_npm_cmd 2>/dev/null)"; then
    add_npm_global_bin_to_path "$npm_cmd"
  fi
else
  echo "[openclawdeploy] Skipped OpenClaw CLI installation."
fi

NODE_CMD="${OPENCLAWDEPLOY_NODE:-node}"

if ! command -v "$NODE_CMD" >/dev/null 2>&1 && [[ ! -x "$NODE_CMD" ]]; then
  echo "[openclawdeploy] node was not found. Please confirm OpenClaw was installed successfully and Node is available in PATH." >&2
  exit 1
fi

"$NODE_CMD" "$SCRIPT_DIR/scripts/deploy.mjs" "${PASS_ARGS[@]}"
