from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_DEVICE_HINTS_CACHE: dict[str, tuple[int, int, dict[str, dict[str, tuple[str, str]]]]] = {}


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
    device_inference_source: str
    client_id: int | None


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


def _normalize_device(device_type: str, device_platform: str) -> tuple[str, str]:
    valid_type = {"phone", "pc", "unknown"}
    valid_platform = {"ios", "android", "windows", "mac", "linux", "unknown"}

    norm_type = device_type.strip().lower() if device_type else "unknown"
    norm_platform = device_platform.strip().lower() if device_platform else "unknown"

    if norm_type not in valid_type:
        norm_type = "unknown"
    if norm_platform not in valid_platform:
        norm_platform = "unknown"

    return norm_type, norm_platform


def _parse_hint_entry(entry: Any) -> tuple[str, str] | None:
    if isinstance(entry, dict):
        return _normalize_device(str(entry.get("device_type", "unknown")), str(entry.get("device_platform", "unknown")))

    if isinstance(entry, str):
        if ":" in entry:
            left, right = entry.split(":", 1)
            return _normalize_device(left, right)
        return _normalize_device(entry, "unknown")

    return None


def _load_device_hints(device_hints_file: str) -> dict[str, dict[str, tuple[str, str]]]:
    empty = {"users": {}, "common_names": {}, "real_addresses": {}, "real_endpoints": {}}
    if not device_hints_file:
        return empty

    path = Path(device_hints_file)
    cache_key = str(path)

    try:
        stat = path.stat()
    except OSError:
        _DEVICE_HINTS_CACHE.pop(cache_key, None)
        return empty

    cached = _DEVICE_HINTS_CACHE.get(cache_key)
    if cached and cached[0] == int(stat.st_mtime_ns) and cached[1] == int(stat.st_size):
        return cached[2]

    try:
        raw = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        _DEVICE_HINTS_CACHE.pop(cache_key, None)
        return empty

    if not isinstance(raw, dict):
        _DEVICE_HINTS_CACHE.pop(cache_key, None)
        return empty

    result = {"users": {}, "common_names": {}, "real_addresses": {}, "real_endpoints": {}}
    for section in ("users", "common_names", "real_addresses", "real_endpoints"):
        items = raw.get(section, {})
        if not isinstance(items, dict):
            continue

        for key, value in items.items():
            parsed = _parse_hint_entry(value)
            if not parsed:
                continue
            result[section][str(key).strip().lower()] = parsed

    _DEVICE_HINTS_CACHE[cache_key] = (int(stat.st_mtime_ns), int(stat.st_size), result)

    return result


def _apply_device_hints(
    username: str,
    common_name: str,
    real_address: str,
    device_hints: dict[str, dict[str, tuple[str, str]]],
    allow_real_ip_hint: bool = True,
) -> tuple[tuple[str, str], str] | None:
    users = device_hints.get("users", {})
    common_names = device_hints.get("common_names", {})
    real_addresses = device_hints.get("real_addresses", {})
    real_endpoints = device_hints.get("real_endpoints", {})

    endpoint_key = real_address.strip().lower()
    if endpoint_key in real_endpoints:
        return real_endpoints[endpoint_key], "hint:real_endpoint"

    # Real IP hints can collide when multiple clients are behind one NAT.
    if allow_real_ip_hint:
        ip_key = real_address.strip().lower().split(":", 1)[0]
        if ip_key in real_addresses:
            return real_addresses[ip_key], "hint:real_address"

    user_key = username.strip().lower()
    if user_key in users:
        return users[user_key], "hint:user"

    cn_key = common_name.strip().lower()
    if cn_key in common_names:
        return common_names[cn_key], "hint:common_name"

    return None


def _infer_device(
    username: str,
    common_name: str,
    real_address: str,
    device_hints: dict[str, dict[str, tuple[str, str]]],
    allow_real_ip_hint: bool = True,
) -> tuple[str, str, str]:
    hinted = _apply_device_hints(
        username,
        common_name,
        real_address,
        device_hints,
        allow_real_ip_hint=allow_real_ip_hint,
    )
    if hinted:
        (device_type, device_platform), inference_source = hinted
        return device_type, device_platform, inference_source

    text = f"{username} {common_name}".lower()

    if any(token in text for token in ["ios", "iphone", "ipad", "android", "phone", "mobile"]):
        if "ios" in text or "iphone" in text or "ipad" in text:
            return "phone", "ios", "heuristic:identity_text"
        if "android" in text:
            return "phone", "android", "heuristic:identity_text"
        return "phone", "unknown", "heuristic:identity_text"

    if any(token in text for token in ["windows", "win", "mac", "linux", "desktop", "laptop", "pc"]):
        if "windows" in text or " win" in text:
            return "pc", "windows", "heuristic:identity_text"
        if "mac" in text:
            return "pc", "mac", "heuristic:identity_text"
        if "linux" in text:
            return "pc", "linux", "heuristic:identity_text"
        return "pc", "unknown", "heuristic:identity_text"

    return "unknown", "unknown", "fallback:unknown"


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


def _empty_parse_diagnostics(parse_mode: str = "none") -> dict[str, Any]:
    return {
        "parse_mode": parse_mode,
        "line_count_total": 0,
        "client_rows_seen": 0,
        "client_rows_parsed": 0,
        "client_rows_skipped": 0,
        "skip_reasons": {},
    }


def _parse_csv_status(
    lines: list[str],
    protocol: str,
    source_file: str,
    device_hints: dict[str, dict[str, tuple[str, str]]],
) -> tuple[list[ClientSession], str, dict[str, Any]]:
    sessions: list[ClientSession] = []
    updated_at = ""
    ip_occurrences: dict[str, int] = {}
    client_rows_seen = 0
    client_rows_parsed = 0
    skip_reasons: dict[str, int] = {}

    def mark_skip(reason: str) -> None:
        skip_reasons[reason] = skip_reasons.get(reason, 0) + 1

    for raw in lines:
        line = raw.strip()
        if not (line.startswith("CLIENT_LIST,") or line.startswith("CLIENT_LIST\t")):
            continue

        client_rows_seen += 1

        parts = _split_status_fields(line)
        if len(parts) < 3:
            continue

        ip_key = parts[2].strip().lower().split(":", 1)[0]
        if not ip_key:
            continue
        ip_occurrences[ip_key] = ip_occurrences.get(ip_key, 0) + 1

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
            mark_skip("short_row")
            continue

        common_name = parts[1]
        real_address = parts[2]
        if not real_address.strip():
            mark_skip("missing_real_address")
            continue
        virtual_address = parts[3]
        bytes_received = _safe_int(parts[5])
        bytes_sent = _safe_int(parts[6])
        connected_since = parts[7]
        connected_since_epoch = _safe_int(parts[8])
        username = parts[9] if len(parts) > 9 and parts[9] and parts[9] != "UNDEF" else common_name
        client_id_value: int | None = None
        if len(parts) > 10:
            parsed_client_id = _safe_int(parts[10])
            client_id_value = parsed_client_id if parsed_client_id > 0 else None

        real_ip = real_address.strip().lower().split(":", 1)[0]
        allow_real_ip_hint = ip_occurrences.get(real_ip, 0) <= 1
        device_type, device_platform, device_inference_source = _infer_device(
            username,
            common_name,
            real_address,
            device_hints,
            allow_real_ip_hint=allow_real_ip_hint,
        )

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
                device_inference_source=device_inference_source,
                client_id=client_id_value,
            )
        )
        client_rows_parsed += 1

    return (
        sessions,
        updated_at,
        {
            "parse_mode": "csv_v3",
            "line_count_total": len(lines),
            "client_rows_seen": client_rows_seen,
            "client_rows_parsed": client_rows_parsed,
            "client_rows_skipped": max(0, client_rows_seen - client_rows_parsed),
            "skip_reasons": skip_reasons,
        },
    )


def _parse_legacy_status(
    lines: list[str],
    protocol: str,
    source_file: str,
    device_hints: dict[str, dict[str, tuple[str, str]]],
) -> tuple[list[ClientSession], str, dict[str, Any]]:
    sessions: list[ClientSession] = []
    updated_at = ""
    ip_occurrences: dict[str, int] = {}
    client_rows_seen = 0
    client_rows_parsed = 0
    skip_reasons: dict[str, int] = {}

    def mark_skip(reason: str) -> None:
        skip_reasons[reason] = skip_reasons.get(reason, 0) + 1

    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("Updated,"):
            continue
        if "," not in line:
            continue

        parts = line.split(",")
        if len(parts) < 2:
            continue

        candidate = parts[1].strip().lower().split(":", 1)[0]
        if candidate.count(".") != 3:
            continue
        ip_occurrences[candidate] = ip_occurrences.get(candidate, 0) + 1

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
        client_rows_seen += 1
        if len(parts) < 5:
            mark_skip("short_row")
            continue

        common_name = parts[0]
        real_address = parts[1]
        if not real_address.strip():
            mark_skip("missing_real_address")
            continue
        bytes_received = _safe_int(parts[2])
        bytes_sent = _safe_int(parts[3])
        connected_since = parts[4]
        real_ip = real_address.strip().lower().split(":", 1)[0]
        allow_real_ip_hint = ip_occurrences.get(real_ip, 0) <= 1
        device_type, device_platform, device_inference_source = _infer_device(
            common_name,
            common_name,
            real_address,
            device_hints,
            allow_real_ip_hint=allow_real_ip_hint,
        )

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
                device_inference_source=device_inference_source,
                client_id=None,
            )
        )
        client_rows_parsed += 1

    return (
        sessions,
        updated_at,
        {
            "parse_mode": "legacy",
            "line_count_total": len(lines),
            "client_rows_seen": client_rows_seen,
            "client_rows_parsed": client_rows_parsed,
            "client_rows_skipped": max(0, client_rows_seen - client_rows_parsed),
            "skip_reasons": skip_reasons,
        },
    )


def _fmt_mib(value_bytes: int) -> float:
    return round(value_bytes / 1024 / 1024, 2)


def _session_identity(username: str, common_name: str) -> str:
    identity = (username or "").strip()
    if identity:
        return identity
    return (common_name or "").strip()


def _audit_session(
    *,
    username: str,
    common_name: str,
    real_address: str,
    virtual_address: str,
    bytes_received: int,
    bytes_sent: int,
) -> tuple[bool, list[str]]:
    flags: list[str] = []

    identity = _session_identity(username, common_name).lower()
    if not identity or identity in {"undef", "unknown", "anonymous"}:
        flags.append("unidentified")

    if not (real_address or "").strip():
        flags.append("missing_real_address")

    if not (virtual_address or "").strip():
        flags.append("missing_virtual_address")

    if int(bytes_received) <= 0 and int(bytes_sent) <= 0:
        flags.append("zero_traffic")

    trusted = True
    if "unidentified" in flags:
        trusted = False
    if "missing_real_address" in flags:
        trusted = False
    if "zero_traffic" in flags and "missing_virtual_address" in flags:
        trusted = False

    return trusted, flags


def _empty_summary() -> dict[str, Any]:
    return {
        "active_clients": 0,
        "raw_active_clients": 0,
        "trusted_active_clients": 0,
        "suspect_active_clients": 0,
        "total_bytes_received": 0,
        "total_bytes_sent": 0,
        "total_mib_received": 0.0,
        "total_mib_sent": 0.0,
        "user_usage": [],
        "trusted_user_usage": [],
        "protocol_breakdown": {"tcp": 0, "udp": 0, "unknown": 0},
        "device_breakdown": {"phone": 0, "pc": 0, "unknown": 0},
        "trusted_device_breakdown": {"phone": 0, "pc": 0, "unknown": 0},
        "unique_real_endpoints_raw": 0,
        "unique_real_endpoints_trusted": 0,
        "unique_identities_trusted": 0,
        "audit_flag_counts": {
            "unidentified": 0,
            "missing_real_address": 0,
            "missing_virtual_address": 0,
            "zero_traffic": 0,
        },
    }


def _summarize_sessions(sessions: list[dict[str, Any]]) -> dict[str, Any]:
    total_rx = sum(int(s.get("bytes_received", 0)) for s in sessions)
    total_tx = sum(int(s.get("bytes_sent", 0)) for s in sessions)

    by_user: dict[str, dict[str, Any]] = {}
    trusted_by_user: dict[str, dict[str, Any]] = {}
    protocol_breakdown = {"tcp": 0, "udp": 0, "unknown": 0}
    device_breakdown = {"phone": 0, "pc": 0, "unknown": 0}
    trusted_device_breakdown = {"phone": 0, "pc": 0, "unknown": 0}
    audit_flag_counts = {
        "unidentified": 0,
        "missing_real_address": 0,
        "missing_virtual_address": 0,
        "zero_traffic": 0,
    }

    trusted_sessions = 0
    real_endpoints_raw: set[str] = set()
    real_endpoints_trusted: set[str] = set()
    trusted_identities: set[str] = set()

    for s in sessions:
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

        real_address = str(s.get("real_address", "")).strip()
        if real_address:
            real_endpoints_raw.add(real_address)

        for flag in s.get("audit_flags", []):
            if flag in audit_flag_counts:
                audit_flag_counts[flag] += 1

        if bool(s.get("trusted_session", False)):
            trusted_sessions += 1
            trusted_item = trusted_by_user.setdefault(
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
            trusted_item["session_count"] += 1
            trusted_item["bytes_received"] += int(s.get("bytes_received", 0))
            trusted_item["bytes_sent"] += int(s.get("bytes_sent", 0))
            trusted_item["mib_received"] = _fmt_mib(trusted_item["bytes_received"])
            trusted_item["mib_sent"] = _fmt_mib(trusted_item["bytes_sent"])

            trusted_device_breakdown[device if device in trusted_device_breakdown else "unknown"] += 1
            if real_address:
                real_endpoints_trusted.add(real_address)

            identity = _session_identity(str(s.get("username", "")), str(s.get("common_name", ""))).strip()
            if identity and identity.lower() not in {"undef", "unknown", "anonymous"}:
                trusted_identities.add(identity)

    user_usage = sorted(by_user.values(), key=lambda x: x["bytes_received"] + x["bytes_sent"], reverse=True)
    trusted_user_usage = sorted(
        trusted_by_user.values(),
        key=lambda x: x["bytes_received"] + x["bytes_sent"],
        reverse=True,
    )

    raw_active_clients = len(sessions)
    return {
        "active_clients": raw_active_clients,
        "raw_active_clients": raw_active_clients,
        "trusted_active_clients": trusted_sessions,
        "suspect_active_clients": max(0, raw_active_clients - trusted_sessions),
        "total_bytes_received": total_rx,
        "total_bytes_sent": total_tx,
        "total_mib_received": _fmt_mib(total_rx),
        "total_mib_sent": _fmt_mib(total_tx),
        "user_usage": user_usage,
        "trusted_user_usage": trusted_user_usage,
        "protocol_breakdown": protocol_breakdown,
        "device_breakdown": device_breakdown,
        "trusted_device_breakdown": trusted_device_breakdown,
        "unique_real_endpoints_raw": len(real_endpoints_raw),
        "unique_real_endpoints_trusted": len(real_endpoints_trusted),
        "unique_identities_trusted": len(trusted_identities),
        "audit_flag_counts": audit_flag_counts,
    }


def _build_diagnostics(sessions: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for session in sessions:
        identity = _session_identity(
            str(session.get("username", "")),
            str(session.get("common_name", "")),
        ).strip()
        if not identity or identity.lower() in {"undef", "unknown", "anonymous"}:
            continue

        entry = grouped.setdefault(
            identity.lower(),
            {
                "identity": identity,
                "usernames": set(),
                "common_names": set(),
                "protocols": set(),
                "real_addresses": set(),
                "virtual_addresses": set(),
                "source_files": set(),
                "session_count": 0,
            },
        )
        entry["session_count"] += 1
        entry["usernames"].add(str(session.get("username", "")).strip())
        entry["common_names"].add(str(session.get("common_name", "")).strip())
        entry["protocols"].add(str(session.get("protocol", "unknown")).strip() or "unknown")
        real_address = str(session.get("real_address", "")).strip()
        virtual_address = str(session.get("virtual_address", "")).strip()
        source_file = str(session.get("source_file", "")).strip()
        if real_address:
            entry["real_addresses"].add(real_address)
        if virtual_address:
            entry["virtual_addresses"].add(virtual_address)
        if source_file:
            entry["source_files"].add(source_file)

    cross_protocol_duplicates: list[dict[str, Any]] = []
    for entry in grouped.values():
        if len(entry["protocols"]) <= 1:
            continue
        cross_protocol_duplicates.append(
            {
                "identity": entry["identity"],
                "session_count": entry["session_count"],
                "protocols": sorted(entry["protocols"]),
                "usernames": sorted(value for value in entry["usernames"] if value),
                "common_names": sorted(value for value in entry["common_names"] if value),
                "real_addresses": sorted(entry["real_addresses"]),
                "virtual_addresses": sorted(entry["virtual_addresses"]),
                "source_files": sorted(entry["source_files"]),
            }
        )

    cross_protocol_duplicates.sort(key=lambda item: (-int(item["session_count"]), str(item["identity"])))

    return {
        "cross_protocol_duplicate_count": len(cross_protocol_duplicates),
        "cross_protocol_duplicates": cross_protocol_duplicates[:12],
    }


def load_openvpn_status(
    status_file: str,
    device_hints: dict[str, dict[str, tuple[str, str]]] | None = None,
) -> dict[str, Any]:
    protocol = _detect_protocol_from_path(status_file)
    hints = device_hints or {"users": {}, "common_names": {}, "real_addresses": {}}
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
            "summary": _empty_summary(),
            "parse_diagnostics": _empty_parse_diagnostics(),
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
            "summary": _empty_summary(),
            "parse_diagnostics": _empty_parse_diagnostics(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    if any(line.startswith("CLIENT_LIST,") or line.startswith("CLIENT_LIST\t") for line in lines):
        sessions, updated_at, parse_diagnostics = _parse_csv_status(
            lines,
            protocol=protocol,
            source_file=str(path),
            device_hints=hints,
        )
    else:
        sessions, updated_at, parse_diagnostics = _parse_legacy_status(
            lines,
            protocol=protocol,
            source_file=str(path),
            device_hints=hints,
        )

    session_dicts: list[dict[str, Any]] = []
    for s in sessions:
        trusted, flags = _audit_session(
            username=s.username,
            common_name=s.common_name,
            real_address=s.real_address,
            virtual_address=s.virtual_address,
            bytes_received=s.bytes_received,
            bytes_sent=s.bytes_sent,
        )

        session_dicts.append(
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
                "device_inference_source": s.device_inference_source,
                "client_id": s.client_id,
                "trusted_session": trusted,
                "audit_class": "trusted" if trusted else "suspect",
                "audit_flags": flags,
            }
        )

    summary = _summarize_sessions(session_dicts)
    diagnostics = _build_diagnostics(session_dicts)

    return {
        "status_file": str(path),
        "status_sources": [
            {
                "path": str(path),
                "protocol": protocol,
                "exists": True,
                "session_count": len(session_dicts),
                "updated_at": updated_at,
                "parse_error_count": int(parse_diagnostics.get("client_rows_skipped", 0)),
            }
        ],
        "status_exists": True,
        "updated_at": updated_at,
        "sessions": session_dicts,
        "summary": summary,
        "diagnostics": diagnostics,
        "parse_diagnostics": parse_diagnostics,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def load_openvpn_status_multi(status_files: list[str], device_hints_file: str = "") -> dict[str, Any]:
    if not status_files:
        status_files = ["/var/log/openvpn/status.log"]

    hints = _load_device_hints(device_hints_file)
    per_source_payloads = [load_openvpn_status(path, device_hints=hints) for path in status_files]

    merged_sessions: list[dict[str, Any]] = []
    status_sources: list[dict[str, Any]] = []
    for payload in per_source_payloads:
        merged_sessions.extend(payload.get("sessions", []))
        status_sources.extend(payload.get("status_sources", []))

    normalized_sessions: list[dict[str, Any]] = []
    for s in merged_sessions:
        trusted = bool(s.get("trusted_session", False))
        flags_value = s.get("audit_flags", [])
        flags = flags_value if isinstance(flags_value, list) else []
        if not flags and "trusted_session" not in s:
            trusted, flags = _audit_session(
                username=str(s.get("username", "")),
                common_name=str(s.get("common_name", "")),
                real_address=str(s.get("real_address", "")),
                virtual_address=str(s.get("virtual_address", "")),
                bytes_received=int(s.get("bytes_received", 0)),
                bytes_sent=int(s.get("bytes_sent", 0)),
            )

        normalized = dict(s)
        normalized["trusted_session"] = trusted
        normalized["audit_class"] = "trusted" if trusted else "suspect"
        normalized["audit_flags"] = flags
        normalized_sessions.append(normalized)

    summary = _summarize_sessions(normalized_sessions)
    diagnostics = _build_diagnostics(normalized_sessions)

    parse_diagnostics_sources: list[dict[str, Any]] = []
    for payload in per_source_payloads:
        source_path = str(payload.get("status_file", ""))
        source_parse_value = payload.get("parse_diagnostics", {})
        source_parse = source_parse_value if isinstance(source_parse_value, dict) else _empty_parse_diagnostics()
        parse_diagnostics_sources.append({
            "path": source_path,
            **source_parse,
        })

    existing_sources = [s for s in status_sources if s.get("exists")]
    updated_candidates = [str(s.get("updated_at", "")) for s in existing_sources if str(s.get("updated_at", ""))]

    return {
        "status_file": ",".join(status_files),
        "status_sources": status_sources,
        "status_exists": any(bool(s.get("exists")) for s in status_sources),
        "updated_at": updated_candidates[0] if updated_candidates else "",
        "sessions": normalized_sessions,
        "summary": summary,
        "diagnostics": diagnostics,
        "parse_diagnostics": {"sources": parse_diagnostics_sources},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
