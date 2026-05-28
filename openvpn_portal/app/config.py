from __future__ import annotations

import base64
import json
import logging
import os
import platform
from dataclasses import dataclass
from pathlib import Path


logger = logging.getLogger(__name__)


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
    control_auth_username: str
    control_auth_password: str
    control_auth_password_hash: str
    control_auth_secret_id: str
    control_auth_secret_region: str
    control_auth_source: str
    control_auth_local_file: str
    control_auth_session_ttl_seconds: int
    control_auth_max_sessions: int
    control_auth_max_failed_attempts: int
    control_auth_failed_attempt_window_seconds: int
    control_auth_lockout_seconds: int


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


def _load_control_auth_secret(secret_id: str, region: str = "") -> dict[str, str]:
    secret_ref = (secret_id or "").strip()
    if not secret_ref:
        return {}

    try:
        import boto3
    except ImportError:
        logger.warning("PORTAL_CONTROL_AUTH_SECRET_ID is set but boto3 is not installed; skipping secret load")
        return {}

    client_kwargs = {}
    if region:
        client_kwargs["region_name"] = region

    try:
        client = boto3.client("secretsmanager", **client_kwargs)
        response = client.get_secret_value(SecretId=secret_ref)
    except Exception as exc:
        logger.warning("Failed to read control auth secret '%s': %s", secret_ref, exc)
        return {}

    secret_string = str(response.get("SecretString") or "")
    if not secret_string and response.get("SecretBinary"):
        try:
            secret_string = base64.b64decode(response["SecretBinary"]).decode("utf-8")
        except Exception as exc:
            logger.warning("Unable to decode control auth secret binary '%s': %s", secret_ref, exc)
            return {}

    if not secret_string:
        return {}

    try:
        payload = json.loads(secret_string)
    except json.JSONDecodeError as exc:
        logger.warning("Control auth secret '%s' is not valid JSON: %s", secret_ref, exc)
        return {}

    if not isinstance(payload, dict):
        logger.warning("Control auth secret '%s' JSON payload must be an object", secret_ref)
        return {}

    username = str(payload.get("username") or payload.get("control_auth_username") or "").strip()
    password = str(payload.get("password") or payload.get("control_auth_password") or "")
    password_hash = str(payload.get("password_hash") or payload.get("control_auth_password_hash") or "").strip()

    result: dict[str, str] = {}
    if username:
        result["username"] = username
    if password:
        result["password"] = password
    if password_hash:
        result["password_hash"] = password_hash
    return result


def _load_local_control_auth_file(file_path: str) -> dict[str, str]:
    path = Path((file_path or "").strip()).expanduser()
    if not path.is_absolute():
        path = (Path(__file__).resolve().parent.parent.parent / path).resolve()

    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return {}

    values: dict[str, str] = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        normalized_key = key.strip().lower()
        normalized_value = raw_value.strip()
        if normalized_key in {"username", "password"} and normalized_value:
            values[normalized_key] = normalized_value
    return values


def _is_local_runtime() -> bool:
    if _env_flag("PORTAL_LOCAL_RUN", default=False):
        return True
    runtime = os.getenv("PORTAL_RUNTIME", "").strip().lower()
    if runtime in {"local", "dev", "development"}:
        return True
    return platform.system().lower() in {"darwin", "windows"}


def load_settings() -> Settings:
    status_files = _detect_status_files()
    control_actions = _parse_csv_list(
        os.getenv("PORTAL_CONTROL_ALLOWED_ACTIONS", "refresh_snapshot,sample_history,terminate_head_session")
    )

    control_auth_username = ""
    control_auth_password = ""
    control_auth_password_hash = ""
    control_auth_secret_id = os.getenv("PORTAL_CONTROL_AUTH_SECRET_ID", "openvpn/portal/control-auth").strip()
    control_auth_secret_region = os.getenv(
        "PORTAL_CONTROL_AUTH_SECRET_REGION", os.getenv("AWS_REGION", "")
    ).strip()
    control_auth_source = "secret"
    control_auth_local_file = os.getenv(
        "PORTAL_CONTROL_AUTH_LOCAL_FILE",
        str((Path(__file__).resolve().parent.parent.parent / "clients" / "portal_credentials.txt").resolve()),
    ).strip()
    source_mode = os.getenv("PORTAL_CONTROL_AUTH_SOURCE", "auto").strip().lower()
    if source_mode not in {"auto", "secret", "local_file"}:
        source_mode = "auto"

    if source_mode == "local_file" or (source_mode == "auto" and _is_local_runtime()):
        local_values = _load_local_control_auth_file(control_auth_local_file)
        control_auth_source = "local_file"
        control_auth_username = local_values.get("username", "")
        control_auth_password = local_values.get("password", "")
    else:
        # In non-local runtime, control auth stays secret-first.
        secret_values = _load_control_auth_secret(control_auth_secret_id, control_auth_secret_region)
        control_auth_source = "secret"
        control_auth_username = secret_values.get("username", "")
        control_auth_password = secret_values.get("password", "")
        control_auth_password_hash = secret_values.get("password_hash", "")

    return Settings(
        host=os.getenv("PORTAL_HOST", "0.0.0.0"),
        port=int(os.getenv("PORTAL_PORT", "8088")),
        title=os.getenv("PORTAL_TITLE", "OpenVPN Portal (Read-Only Ops)"),
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
        control_auth_username=control_auth_username,
        control_auth_password=control_auth_password,
        control_auth_password_hash=control_auth_password_hash,
        control_auth_secret_id=control_auth_secret_id,
        control_auth_secret_region=control_auth_secret_region,
        control_auth_source=control_auth_source,
        control_auth_local_file=control_auth_local_file,
        control_auth_session_ttl_seconds=max(60, int(os.getenv("PORTAL_CONTROL_AUTH_SESSION_TTL_SECONDS", "3600"))),
        control_auth_max_sessions=max(1, int(os.getenv("PORTAL_CONTROL_AUTH_MAX_SESSIONS", "256"))),
        control_auth_max_failed_attempts=max(2, int(os.getenv("PORTAL_CONTROL_AUTH_MAX_FAILED_ATTEMPTS", "5"))),
        control_auth_failed_attempt_window_seconds=max(
            30, int(os.getenv("PORTAL_CONTROL_AUTH_FAILED_ATTEMPT_WINDOW_SECONDS", "300"))
        ),
        control_auth_lockout_seconds=max(10, int(os.getenv("PORTAL_CONTROL_AUTH_LOCKOUT_SECONDS", "300"))),
    )
