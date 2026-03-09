#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -x "$DIR/node_modules/.bin/electron" ]]; then
  "$DIR/node_modules/.bin/electron" "$DIR"
else
  node "$DIR/scripts/gui.mjs"
fi
