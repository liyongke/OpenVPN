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
    connected_for_minutes: int | None
    username: str
    protocol: str
    source_file: str
    device_type: str
    device_platform: str


def _safe_int(value: str) -> int:
    try:
        return int(value.strip())
    except (ValueError, TypeError, AttributeError):
        return 0


def _detect_protocol_from_path(path: str) -> str:
    lower = path.lower()
    if "tcp" in lower:
        return "tcp"
    if "udp" in lower:
        return "udp"
    return "unknown"


def _infer_device(username: str, common_name: str) -> tuple[str, str]:
    text = f"{username} {common_name}".lower()

    if any(token in text for token in ["ios", "iphone", "ipad", "android", "phone", "mobile"]):
        if "ios" in text or "iphone" in text or "ipad" in text:
            return "phone", "ios"
        if "android" in text:
            return "phone", "android"
        return "phone", "unknown"

    if any(token in text for token in ["windows", "win", "mac", "linux", "desktop", "laptop", "pc"]):
        if "windows" in text or " win" in text:
            return "pc", "windows"
        if "mac" in text:
            return "pc", "mac"
        if "linux" in text:
            return "pc", "linux"
        return "pc", "unknown"

    return "unknown", "unknown"


def _minutes_since_epoch(epoch_value: int) -> int | None:
    if epoch_value <= 0:
        return None
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    if epoch_value > now_epoch:
        return None
    return int((now_epoch - epoch_value) / 60)


def _split_status_fields(line: str) -> list[str]:
    if "\t" in line:
        return [part.strip() for part in line.split("\t")]
    return [part.strip() for part in line.split(",")]


def _parse_csv_status(lines: list[str], protocol: str, source_file: str) -> tuple[list[ClientSession], str]:
    sessions: list[ClientSession] = []
    updated_at = ""

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line.startswith("TIME,") or line.startswith("TIME\t"):
            parts = _split_status_fields(line)
            if len(parts) > 1:
                updated_at = parts[1]

        if not (line.startswith("CLIENT_LIST,") or line.startswith("CLIENT_LIST\t")):
            continue

        parts = _split_status_fields(line)
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
        connected_since_epoch = _safe_int(parts[8])
        username = parts[9] if len(parts) > 9 and parts[9] and parts[9] != "UNDEF" else common_name
        device_type, device_platform = _infer_device(username, common_name)

        sessions.append(
            ClientSession(
                common_name=common_name,
                real_address=real_address,
                virtual_address=virtual_address,
                bytes_received=bytes_received,
                bytes_sent=bytes_sent,
                connected_since=connected_since,
                connected_for_minutes=_minutes_since_epoch(connected_since_epoch),
                username=username,
                protocol=protocol,
                source_file=source_file,
                device_type=device_type,
                device_platform=device_platform,
            )
        )

    return sessions, updated_at


def _parse_legacy_status(lines: list[str], protocol: str, source_file: str) -> tuple[list[ClientSession], str]:
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
        device_type, device_platform = _infer_device(common_name, common_name)

        sessions.append(
            ClientSession(
                common_name=common_name,
                real_address=real_address,
                virtual_address="",
                bytes_received=bytes_received,
                bytes_sent=bytes_sent,
                connected_since=connected_since,
                connected_for_minutes=None,
                username=common_name,
                protocol=protocol,
                source_file=source_file,
                device_type=device_type,
                device_platform=device_platform,
            )
        )

    return sessions, updated_at


def _fmt_mib(value_bytes: int) -> float:
    return round(value_bytes / 1024 / 1024, 2)


def load_openvpn_status(status_file: str) -> dict[str, Any]:
    protocol = _detect_protocol_from_path(status_file)
    path = Path(status_file)

    try:
        exists = path.exists()
    except PermissionError:
        exists = False

    if not exists:
        return {
            "status_file": status_file,
            "status_sources": [
                {
                    "path": status_file,
                    "protocol": protocol,
                    "exists": False,
                    "session_count": 0,
                    "updated_at": "",
                }
            ],
            "status_exists": False,
            "updated_at": "",
            "sessions": [],
            "summary": {
                "active_clients": 0,
                "total_bytes_received": 0,
                "total_bytes_sent": 0,
                "total_mib_received": 0.0,
                "total_mib_sent": 0.0,
                "protocol_breakdown": {"tcp": 0, "udp": 0, "unknown": 0},
                "device_breakdown": {"phone": 0, "pc": 0, "unknown": 0},
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except (PermissionError, OSError):
        return {
            "status_file": status_file,
            "status_sources": [
                {
                    "path": status_file,
                    "protocol": protocol,
                    "exists": False,
                    "session_count": 0,
                    "updated_at": "",
                }
            ],
            "status_exists": False,
            "updated_at": "",
            "sessions": [],
            "summary": {
                "active_clients": 0,
                "total_bytes_received": 0,
                "total_bytes_sent": 0,
                "total_mib_received": 0.0,
                "total_mib_sent": 0.0,
                "protocol_breakdown": {"tcp": 0, "udp": 0, "unknown": 0},
                "device_breakdown": {"phone": 0, "pc": 0, "unknown": 0},
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    if any(line.startswith("CLIENT_LIST,") or line.startswith("CLIENT_LIST\t") for line in lines):
        sessions, updated_at = _parse_csv_status(lines, protocol=protocol, source_file=str(path))
    else:
        sessions, updated_at = _parse_legacy_status(lines, protocol=protocol, source_file=str(path))

    total_rx = sum(s.bytes_received for s in sessions)
    total_tx = sum(s.bytes_sent for s in sessions)

    protocol_breakdown = {"tcp": 0, "udp": 0, "unknown": 0}
    device_breakdown = {"phone": 0, "pc": 0, "unknown": 0}
    for s in sessions:
        protocol_breakdown[s.protocol if s.protocol in protocol_breakdown else "unknown"] += 1
        device_breakdown[s.device_type if s.device_type in device_breakdown else "unknown"] += 1

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
        "status_sources": [
            {
                "path": str(path),
                "protocol": protocol,
                "exists": True,
                "session_count": len(sessions),
                "updated_at": updated_at,
            }
        ],
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
                "connected_for_minutes": s.connected_for_minutes,
                "username": s.username,
                "protocol": s.protocol,
                "source_file": s.source_file,
                "device_type": s.device_type,
                "device_platform": s.device_platform,
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
            "protocol_breakdown": protocol_breakdown,
            "device_breakdown": device_breakdown,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def load_openvpn_status_multi(status_files: list[str]) -> dict[str, Any]:
    if not status_files:
        status_files = ["/var/log/openvpn/status.log"]

    per_source_payloads = [load_openvpn_status(path) for path in status_files]

    merged_sessions: list[dict[str, Any]] = []
    status_sources: list[dict[str, Any]] = []
    for payload in per_source_payloads:
        merged_sessions.extend(payload.get("sessions", []))
        status_sources.extend(payload.get("status_sources", []))

    total_rx = sum(int(s.get("bytes_received", 0)) for s in merged_sessions)
    total_tx = sum(int(s.get("bytes_sent", 0)) for s in merged_sessions)

    by_user: dict[str, dict[str, Any]] = {}
    protocol_breakdown = {"tcp": 0, "udp": 0, "unknown": 0}
    device_breakdown = {"phone": 0, "pc": 0, "unknown": 0}

    for s in merged_sessions:
        username = str(s.get("username", "")) or str(s.get("common_name", "unknown"))
        item = by_user.setdefault(
            username,
            {
                "username": username,
                "session_count": 0,
                "bytes_received": 0,
                "bytes_sent": 0,
                "mib_received": 0.0,
                "mib_sent": 0.0,
            },
        )
        item["session_count"] += 1
        item["bytes_received"] += int(s.get("bytes_received", 0))
        item["bytes_sent"] += int(s.get("bytes_sent", 0))
        item["mib_received"] = _fmt_mib(item["bytes_received"])
        item["mib_sent"] = _fmt_mib(item["bytes_sent"])

        proto = str(s.get("protocol", "unknown"))
        protocol_breakdown[proto if proto in protocol_breakdown else "unknown"] += 1

        device = str(s.get("device_type", "unknown"))
        device_breakdown[device if device in device_breakdown else "unknown"] += 1

    user_usage = sorted(by_user.values(), key=lambda x: x["bytes_received"] + x["bytes_sent"], reverse=True)

    existing_sources = [s for s in status_sources if s.get("exists")]
    updated_candidates = [str(s.get("updated_at", "")) for s in existing_sources if str(s.get("updated_at", ""))]

    return {
        "status_file": ",".join(status_files),
        "status_sources": status_sources,
        "status_exists": any(bool(s.get("exists")) for s in status_sources),
        "updated_at": updated_candidates[0] if updated_candidates else "",
        "sessions": merged_sessions,
        "summary": {
            "active_clients": len(merged_sessions),
            "total_bytes_received": total_rx,
            "total_bytes_sent": total_tx,
            "total_mib_received": _fmt_mib(total_rx),
            "total_mib_sent": _fmt_mib(total_tx),
            "user_usage": user_usage,
            "protocol_breakdown": protocol_breakdown,
            "device_breakdown": device_breakdown,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
