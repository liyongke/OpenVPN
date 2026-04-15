#!/usr/bin/env bash
set -euo pipefail

HINTS_FILE="${DEVICE_HINTS_FILE:-/var/log/openvpn/device_hints.json}"
HINTS_DIR="$(dirname "$HINTS_FILE")"
mkdir -p "$HINTS_DIR"

COMMON_NAME="${common_name:-}"
USERNAME="${username:-$COMMON_NAME}"
REAL_IP="${untrusted_ip:-}"
REAL_PORT="${untrusted_port:-}"
REAL_ENDPOINT=""
if [[ -n "$REAL_IP" && -n "$REAL_PORT" ]]; then
  REAL_ENDPOINT="$REAL_IP:$REAL_PORT"
fi
IV_PLAT_RAW="${IV_PLAT:-}"
IV_VER_RAW="${IV_VER:-}"
IV_GUI_VER_RAW="${IV_GUI_VER:-}"

norm_platform="unknown"
norm_type="unknown"

plat_lc="$(printf '%s' "$IV_PLAT_RAW" | tr '[:upper:]' '[:lower:]')"
ver_lc="$(printf '%s' "$IV_VER_RAW $IV_GUI_VER_RAW" | tr '[:upper:]' '[:lower:]')"

case "$plat_lc" in
  ios|iphone|ipad)
    norm_platform="ios"
    norm_type="phone"
    ;;
  android)
    norm_platform="android"
    norm_type="phone"
    ;;
  win*|windows)
    norm_platform="windows"
    norm_type="pc"
    ;;
  mac*|darwin)
    norm_platform="mac"
    norm_type="pc"
    ;;
  linux)
    norm_platform="linux"
    norm_type="pc"
    ;;
esac

if [[ "$norm_platform" == "unknown" ]]; then
  if [[ "$ver_lc" == *"android"* ]]; then
    norm_platform="android"
    norm_type="phone"
  elif [[ "$ver_lc" == *"ios"* || "$ver_lc" == *"iphone"* || "$ver_lc" == *"ipad"* ]]; then
    norm_platform="ios"
    norm_type="phone"
  elif [[ "$ver_lc" == *"windows"* ]]; then
    norm_platform="windows"
    norm_type="pc"
  elif [[ "$ver_lc" == *"mac"* || "$ver_lc" == *"darwin"* ]]; then
    norm_platform="mac"
    norm_type="pc"
  elif [[ "$ver_lc" == *"linux"* ]]; then
    norm_platform="linux"
    norm_type="pc"
  fi
fi

python3 - "$HINTS_FILE" "$USERNAME" "$COMMON_NAME" "$REAL_IP" "$REAL_ENDPOINT" "$norm_type" "$norm_platform" "$IV_PLAT_RAW" "$IV_VER_RAW" "$IV_GUI_VER_RAW" <<'PY' || true
import json
import os
import sys
from datetime import datetime, timezone

hints_file, username, common_name, real_ip, real_endpoint, dev_type, platform, iv_plat, iv_ver, iv_gui_ver = sys.argv[1:]

now = datetime.now(timezone.utc).isoformat()


def load(path):
    if not os.path.exists(path):
        return {"users": {}, "common_names": {}, "real_addresses": {}, "real_endpoints": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                data.setdefault("users", {})
                data.setdefault("common_names", {})
                data.setdefault("real_addresses", {})
                data.setdefault("real_endpoints", {})
                return data
    except Exception:
        pass
    return {"users": {}, "common_names": {}, "real_addresses": {}, "real_endpoints": {}}


entry = {
    "device_type": dev_type,
    "device_platform": platform,
    "updated_at": now,
    "source": "openvpn-client-connect",
    "raw": {
        "IV_PLAT": iv_plat,
        "IV_VER": iv_ver,
        "IV_GUI_VER": iv_gui_ver,
    },
}

data = load(hints_file)

if username and username != "UNDEF":
    data["users"][username.lower()] = entry
if common_name:
    data["common_names"][common_name.lower()] = entry
if real_ip:
    data["real_addresses"][real_ip.lower()] = entry
if real_endpoint:
    data["real_endpoints"][real_endpoint.lower()] = entry

os.makedirs(os.path.dirname(hints_file), exist_ok=True)
tmp_path = f"{hints_file}.tmp"
with open(tmp_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=True, indent=2, sort_keys=True)
os.replace(tmp_path, hints_file)
os.chmod(hints_file, 0o644)
PY

exit 0
