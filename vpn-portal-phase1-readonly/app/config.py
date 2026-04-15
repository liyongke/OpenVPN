from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    title: str
    status_file: str
    log_file: str


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


def load_settings() -> Settings:
    return Settings(
        host=os.getenv("PORTAL_HOST", "127.0.0.1"),
        port=int(os.getenv("PORTAL_PORT", "8088")),
        title=os.getenv("PORTAL_TITLE", "OpenVPN Portal Phase 1 (Read-Only)"),
        status_file=_detect_status_file(),
        log_file=os.getenv("OPENVPN_LOG_FILE", "/var/log/openvpn/openvpn.log"),
    )
