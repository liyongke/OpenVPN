#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d .python-venv ]]; then
  python3 -m venv .python-venv
fi

source .python-venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements.txt >/dev/null

HOST="${PORTAL_HOST:-127.0.0.1}"
PORT="${PORTAL_PORT:-8088}"

echo "Starting portal on http://${HOST}:${PORT}"
exec uvicorn app.main:app --host "$HOST" --port "$PORT"
