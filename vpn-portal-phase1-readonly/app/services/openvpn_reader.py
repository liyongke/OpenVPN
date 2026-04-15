from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class ClientSession:
    common_name: str
    real_address: str
    virtual_address: str
    bytes_received: int
    bytes_sent: int
    connected_since: str
    username: str


def _safe_int(value: str) -> int:
    try:
        return int(value.strip())
    except (ValueError, TypeError, AttributeError):
        return 0


def _parse_csv_status(lines: list[str]) -> tuple[list[ClientSession], str]:
    sessions: list[ClientSession] = []
    updated_at = ""

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line.startswith("TIME,"):
            parts = line.split(",", 2)
            if len(parts) > 1:
                updated_at = parts[1]

        if not line.startswith("CLIENT_LIST,"):
            continue

        parts = line.split(",")
        # Known OpenVPN status-version 3 fields.
        # CLIENT_LIST,Common Name,Real Address,Virtual Address,Virtual IPv6 Address,
        # Bytes Received,Bytes Sent,Connected Since,Connected Since (time_t),Username,...
        if len(parts) < 10:
            continue

        common_name = parts[1]
        real_address = parts[2]
        virtual_address = parts[3]
        bytes_received = _safe_int(parts[5])
        bytes_sent = _safe_int(parts[6])
        connected_since = parts[7]
        username = parts[9] if parts[9] else common_name

        sessions.append(
            ClientSession(
                common_name=common_name,
                real_address=real_address,
                virtual_address=virtual_address,
                bytes_received=bytes_received,
                bytes_sent=bytes_sent,
                connected_since=connected_since,
                username=username,
            )
        )

    return sessions, updated_at


def _parse_legacy_status(lines: list[str]) -> tuple[list[ClientSession], str]:
    sessions: list[ClientSession] = []
    updated_at = ""

    in_client_table = False
    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line.startswith("Updated,"):
            parts = line.split(",", 1)
            if len(parts) > 1:
                updated_at = parts[1]
            continue

        if line == "OpenVPN CLIENT LIST":
            in_client_table = False
            continue

        if line.startswith("Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since"):
            in_client_table = True
            continue

        if line == "ROUTING TABLE":
            in_client_table = False
            continue

        if not in_client_table:
            continue

        parts = line.split(",")
        if len(parts) < 5:
            continue

        common_name = parts[0]
        real_address = parts[1]
        bytes_received = _safe_int(parts[2])
        bytes_sent = _safe_int(parts[3])
        connected_since = parts[4]

        sessions.append(
            ClientSession(
                common_name=common_name,
                real_address=real_address,
                virtual_address="",
                bytes_received=bytes_received,
                bytes_sent=bytes_sent,
                connected_since=connected_since,
                username=common_name,
            )
        )

    return sessions, updated_at


def _fmt_mib(value_bytes: int) -> float:
    return round(value_bytes / 1024 / 1024, 2)


def load_openvpn_status(status_file: str) -> dict[str, Any]:
    path = Path(status_file)

    if not path.exists():
        return {
            "status_file": status_file,
            "status_exists": False,
            "updated_at": "",
            "sessions": [],
            "summary": {
                "active_clients": 0,
                "total_bytes_received": 0,
                "total_bytes_sent": 0,
                "total_mib_received": 0.0,
                "total_mib_sent": 0.0,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    if any(line.startswith("CLIENT_LIST,") for line in lines):
        sessions, updated_at = _parse_csv_status(lines)
    else:
        sessions, updated_at = _parse_legacy_status(lines)

    total_rx = sum(s.bytes_received for s in sessions)
    total_tx = sum(s.bytes_sent for s in sessions)

    by_user: dict[str, dict[str, Any]] = {}
    for s in sessions:
        item = by_user.setdefault(
            s.username,
            {
                "username": s.username,
                "session_count": 0,
                "bytes_received": 0,
                "bytes_sent": 0,
                "mib_received": 0.0,
                "mib_sent": 0.0,
            },
        )
        item["session_count"] += 1
        item["bytes_received"] += s.bytes_received
        item["bytes_sent"] += s.bytes_sent
        item["mib_received"] = _fmt_mib(item["bytes_received"])
        item["mib_sent"] = _fmt_mib(item["bytes_sent"])

    user_usage = sorted(by_user.values(), key=lambda x: x["bytes_received"] + x["bytes_sent"], reverse=True)

    return {
        "status_file": str(path),
        "status_exists": True,
        "updated_at": updated_at,
        "sessions": [
            {
                "common_name": s.common_name,
                "real_address": s.real_address,
                "virtual_address": s.virtual_address,
                "bytes_received": s.bytes_received,
                "bytes_sent": s.bytes_sent,
                "mib_received": _fmt_mib(s.bytes_received),
                "mib_sent": _fmt_mib(s.bytes_sent),
                "connected_since": s.connected_since,
                "username": s.username,
            }
            for s in sessions
        ],
        "summary": {
            "active_clients": len(sessions),
            "total_bytes_received": total_rx,
            "total_bytes_sent": total_tx,
            "total_mib_received": _fmt_mib(total_rx),
            "total_mib_sent": _fmt_mib(total_tx),
            "user_usage": user_usage,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
