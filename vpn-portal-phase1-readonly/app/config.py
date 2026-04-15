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
    live_poll_seconds: float
    device_hints_file: str


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
    return Settings(
        host=os.getenv("PORTAL_HOST", "127.0.0.1"),
        port=int(os.getenv("PORTAL_PORT", "8088")),
        title=os.getenv("PORTAL_TITLE", "OpenVPN Portal Phase 2 (Read-Only Ops)"),
        status_files=status_files,
        status_file=status_files[0] if status_files else _detect_status_file(),
        log_file=os.getenv("OPENVPN_LOG_FILE", "/var/log/openvpn/openvpn.log"),
        history_db_path=os.getenv("PORTAL_HISTORY_DB", "/home/ec2-user/apps/vpn-portal-phase1-readonly/data/history.sqlite3"),
        history_retention_days=int(os.getenv("PORTAL_HISTORY_RETENTION_DAYS", "7")),
        history_sample_seconds=int(os.getenv("PORTAL_HISTORY_SAMPLE_SECONDS", "60")),
        live_poll_seconds=float(os.getenv("PORTAL_LIVE_POLL_SECONDS", "1.0")),
        device_hints_file=os.getenv("PORTAL_DEVICE_HINTS_FILE", "/home/ec2-user/apps/vpn-portal-phase1-readonly/device_hints.json"),
    )
