#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prefer a single project-level venv at repo root.
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ ! -d "$PROJECT_ROOT/openvpn_portal" ]]; then
  PROJECT_ROOT="$SCRIPT_DIR"
fi
VENV_DIR="${PORTAL_VENV_DIR:-$PROJECT_ROOT/.python-venv}"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

VENV_PYTHON="$VENV_DIR/bin/python3"
if [[ ! -x "$VENV_PYTHON" ]]; then
  VENV_PYTHON="$VENV_DIR/bin/python"
fi

MANAGE_DEPS="${RUN_PORTAL_MANAGE_DEPS:-1}"
if [[ "$MANAGE_DEPS" == "1" ]]; then
  "$VENV_PYTHON" -m pip install --upgrade pip >/dev/null
  "$VENV_PYTHON" -m pip install -r requirements.txt >/dev/null
fi

BUILD_FRONTEND="${RUN_PORTAL_BUILD_FRONTEND:-0}"
if [[ "$BUILD_FRONTEND" == "1" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "RUN_PORTAL_BUILD_FRONTEND=1 requested, but npm is not installed" >&2
    exit 1
  fi
  (
    cd "$SCRIPT_DIR/frontend"
    npm install
    npm run build
  )
fi

HOST="${PORTAL_HOST:-0.0.0.0}"
PORT="${PORTAL_PORT:-8088}"

echo "Starting portal on http://${HOST}:${PORT}"
exec "$VENV_PYTHON" -m uvicorn app.main:app --host "$HOST" --port "$PORT"
