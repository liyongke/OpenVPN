from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    title: str
    status_files: list[str]
    status_file: str
    log_file: str
    history_db_path: str
    history_retention_days: int
    history_sample_seconds: int
    history_payload_mode: str
    history_payload_session_cap: int
    live_poll_seconds: float
    device_hints_file: str
    control_enabled: bool
    control_token: str
    control_allowed_actions: list[str]
    control_terminate_command: str
    openvpn_management_tcp_socket: str
    openvpn_management_udp_socket: str
    openvpn_management_timeout_seconds: float
    control_terminate_min_interval_seconds: float
    sessions_api_max_limit: int


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _parse_csv_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _detect_status_file() -> str:
    explicit = os.getenv("OPENVPN_STATUS_FILE", "").strip()
    if explicit:
        return explicit

    candidates = [
        "/var/log/openvpn/status.log",
        "/var/log/openvpn/openvpn-status.log",
        "/etc/openvpn/openvpn-status.log",
        "/etc/openvpn/server/openvpn-status.log",
        "/tmp/openvpn-status.log",
    ]

    for path in candidates:
        try:
            if Path(path).exists():
                return path
        except PermissionError:
            # Skip paths that exist but are not readable/traversable by this process.
            continue

    return candidates[0]


def _detect_status_files() -> list[str]:
    explicit_list = os.getenv("OPENVPN_STATUS_FILES", "").strip()
    if explicit_list:
        items = [item.strip() for item in explicit_list.split(",") if item.strip()]
        if items:
            return items

    explicit_single = os.getenv("OPENVPN_STATUS_FILE", "").strip()
    if explicit_single:
        return [explicit_single]

    candidates = [
        "/var/log/openvpn/status-tcp.log",
        "/var/log/openvpn/status-udp.log",
        "/run/openvpn-server/status-server.log",
        "/var/log/openvpn/status.log",
    ]
    return candidates


def load_settings() -> Settings:
    status_files = _detect_status_files()
    control_actions = _parse_csv_list(
        os.getenv("PORTAL_CONTROL_ALLOWED_ACTIONS", "refresh_snapshot,sample_history,terminate_head_session")
    )
    return Settings(
        host=os.getenv("PORTAL_HOST", "0.0.0.0"),
        port=int(os.getenv("PORTAL_PORT", "8088")),
        title=os.getenv("PORTAL_TITLE", "OpenVPN Portal Phase 2 (Read-Only Ops)"),
        status_files=status_files,
        status_file=status_files[0] if status_files else _detect_status_file(),
        log_file=os.getenv("OPENVPN_LOG_FILE", "/var/log/openvpn/openvpn.log"),
        history_db_path=os.getenv("PORTAL_HISTORY_DB", "/home/ec2-user/apps/vpn-portal-phase1-readonly/data/history.sqlite3"),
        history_retention_days=int(os.getenv("PORTAL_HISTORY_RETENTION_DAYS", "7")),
        history_sample_seconds=int(os.getenv("PORTAL_HISTORY_SAMPLE_SECONDS", "60")),
        history_payload_mode=os.getenv("PORTAL_HISTORY_PAYLOAD_MODE", "summary").strip().lower(),
        history_payload_session_cap=int(os.getenv("PORTAL_HISTORY_PAYLOAD_SESSION_CAP", "50")),
        live_poll_seconds=float(os.getenv("PORTAL_LIVE_POLL_SECONDS", "1.0")),
        device_hints_file=os.getenv("PORTAL_DEVICE_HINTS_FILE", "/var/log/openvpn/device_hints.json"),
        control_enabled=_env_flag("PORTAL_CONTROL_ENABLED", default=False),
        control_token=os.getenv("PORTAL_CONTROL_TOKEN", "").strip(),
        control_allowed_actions=control_actions,
        control_terminate_command=os.getenv("PORTAL_CONTROL_TERMINATE_COMMAND", "").strip(),
        openvpn_management_tcp_socket=os.getenv("PORTAL_OPENVPN_MANAGEMENT_TCP_SOCKET", "").strip(),
        openvpn_management_udp_socket=os.getenv("PORTAL_OPENVPN_MANAGEMENT_UDP_SOCKET", "").strip(),
        openvpn_management_timeout_seconds=float(os.getenv("PORTAL_OPENVPN_MANAGEMENT_TIMEOUT_SECONDS", "2.0")),
        control_terminate_min_interval_seconds=float(
            os.getenv("PORTAL_CONTROL_TERMINATE_MIN_INTERVAL_SECONDS", "2.0")
        ),
        sessions_api_max_limit=max(10, int(os.getenv("PORTAL_SESSIONS_API_MAX_LIMIT", "1000"))),
    )
