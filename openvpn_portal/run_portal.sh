#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d .python-venv ]]; then
  python3 -m venv .python-venv
fi

VENV_PYTHON="$SCRIPT_DIR/.python-venv/bin/python3"
if [[ ! -x "$VENV_PYTHON" ]]; then
  VENV_PYTHON="$SCRIPT_DIR/.python-venv/bin/python"
fi

"$VENV_PYTHON" -m pip install --upgrade pip >/dev/null
"$VENV_PYTHON" -m pip install -r requirements.txt >/dev/null

HOST="${PORTAL_HOST:-127.0.0.1}"
PORT="${PORTAL_PORT:-8088}"

echo "Starting portal on http://${HOST}:${PORT}"
exec "$VENV_PYTHON" -m uvicorn app.main:app --host "$HOST" --port "$PORT"
