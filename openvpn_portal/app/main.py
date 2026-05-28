from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.config import load_settings
from app.services.control_auth import ControlAuthError, ControlAuthService, ControlAuthSettings
from app.services.geoip import GeoIpService
from app.services.history_store import HistoryStore
from app.services.live_state import LiveStateCollector
from app.services.openvpn_control import OpenVPNControlService, OpenVPNControlSettings, SessionTerminationError

settings = load_settings()
app = FastAPI(title=settings.title)
history_store = HistoryStore(
    settings.history_db_path,
    retention_days=settings.history_retention_days,
    payload_mode=settings.history_payload_mode,
    payload_session_cap=settings.history_payload_session_cap,
)
collector = LiveStateCollector(
    settings.status_files,
    poll_interval_seconds=max(0.5, settings.live_poll_seconds),
    history_store=history_store,
    history_sample_seconds=settings.history_sample_seconds,
    device_hints_file=settings.device_hints_file,
)
geoip_service = GeoIpService()
control_service = OpenVPNControlService(
    OpenVPNControlSettings(
        terminate_command=settings.control_terminate_command,
        management_tcp_socket=settings.openvpn_management_tcp_socket,
        management_udp_socket=settings.openvpn_management_udp_socket,
        management_timeout_seconds=max(1.0, settings.openvpn_management_timeout_seconds),
    )
)
control_auth_service = ControlAuthService(
    ControlAuthSettings(
        username=settings.control_auth_username,
        password=settings.control_auth_password,
        session_ttl_seconds=settings.control_auth_session_ttl_seconds,
        max_sessions=settings.control_auth_max_sessions,
    )
)
_last_terminate_request_monotonic = 0.0

base_dir = Path(__file__).resolve().parent
project_root = base_dir.parent.parent


def _resolve_frontend_assets_dir() -> Path:
    local_default_dir = project_root / "local_run" / "openvpn_portal" / "app" / "static" / "frontend"
    fallback_dir = base_dir / "static" / "frontend"
    override = os.getenv("PORTAL_FRONTEND_ASSETS_DIR", "").strip()
    if not override:
        return local_default_dir if local_default_dir.exists() else fallback_dir

    path = Path(override).expanduser()
    if not path.is_absolute():
        path = (project_root / path).resolve()
    return path


frontend_assets_dir = _resolve_frontend_assets_dir()
static_dir = base_dir / "static"
static_dir.mkdir(parents=True, exist_ok=True)
templates = Jinja2Templates(directory=str(base_dir / "templates"))
# Mount frontend assets first so /static/frontend can be redirected to local_run via env.
app.mount("/static/frontend", StaticFiles(directory=str(frontend_assets_dir), check_dir=False), name="static-frontend")
app.mount("/static", StaticFiles(directory=str(static_dir), check_dir=False), name="static")
frontend_index_file = frontend_assets_dir / "index.html"


class ControlActionRequest(BaseModel):
    action: str


class ControlAuthLoginRequest(BaseModel):
    username: str
    password: str


def _extract_token(auth_header: str | None, x_control_token: str | None) -> str:
    if x_control_token:
        return x_control_token.strip()
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return ""


def _seconds_since_iso(value: str) -> float | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    now_utc = datetime.now(timezone.utc)
    delta = (now_utc - parsed.astimezone(timezone.utc)).total_seconds()
    return max(0.0, round(delta, 3))


def _parse_limit_offset(limit: int | None, offset: int | None, max_limit: int) -> tuple[int | None, int]:
    parsed_offset = max(0, int(offset or 0))
    if limit is None:
        return None, parsed_offset
    parsed_limit = max(1, min(int(limit), max_limit))
    return parsed_limit, parsed_offset


def _filter_sessions(
    sessions: list[dict],
    protocol: str | None = None,
    audit_class: str | None = None,
    username: str | None = None,
) -> list[dict]:
    filtered = sessions
    if protocol:
        protocol_value = protocol.strip().lower()
        filtered = [s for s in filtered if str(s.get("protocol", "")).strip().lower() == protocol_value]

    if audit_class:
        audit_value = audit_class.strip().lower()
        filtered = [s for s in filtered if str(s.get("audit_class", "")).strip().lower() == audit_value]

    if username:
        uname = username.strip().lower()
        filtered = [s for s in filtered if uname in str(s.get("username", "")).strip().lower()]

    return filtered


def _select_status_source(payload: dict, selected: str | None = None) -> str:
    default_source = ""
    for source in payload.get("status_sources", []):
        source_path = str(source.get("path", "")).strip()
        if source_path:
            default_source = source_path
            if bool(source.get("exists")):
                break

    if not default_source:
        if settings.status_files:
            default_source = settings.status_files[0]
        elif settings.status_file:
            default_source = settings.status_file.split(",", 1)[0].strip()

    return selected if selected else default_source


def _read_status_file_context(file_path: str | None = None, lines: int = 400) -> dict:
    payload = collector.latest_payload
    selected = _select_status_source(payload, selected=file_path)
    status_path = Path(selected)
    raw_text = ""
    read_error = ""

    line_count = max(50, min(2000, int(lines)))

    try:
        if status_path.exists():
            content_lines = status_path.read_text(encoding="utf-8", errors="ignore").splitlines()
            raw_text = "\n".join(content_lines[-line_count:])
        else:
            read_error = "Status file does not exist at the configured path."
    except (PermissionError, OSError) as exc:
        read_error = f"Unable to read status file: {exc}"

    return {
        "title": settings.title,
        "status_file": selected,
        "read_error": read_error,
        "raw_text": raw_text,
        "payload": payload,
    }


@app.on_event("startup")
async def startup_event() -> None:
    await collector.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await collector.stop()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/portal/status")
def api_portal_status() -> JSONResponse:
    payload = collector.latest_payload
    status_sources = payload.get("status_sources", [])
    live_sources = sum(1 for source in status_sources if bool(source.get("exists")))
    source_total = len(status_sources)
    generated_age = _seconds_since_iso(str(payload.get("generated_at", "")))
    last_refresh_age = (datetime.now(timezone.utc) - collector.last_refresh_at).total_seconds()
    last_broadcast_age = (datetime.now(timezone.utc) - collector.last_broadcast_at).total_seconds()

    return JSONResponse(
        {
            "backend_online": True,
            "source_total": source_total,
            "source_live": live_sources,
            "source_offline": max(0, source_total - live_sources),
            "source_freshness_seconds": generated_age,
            "last_refresh_age_seconds": round(max(0.0, last_refresh_age), 3),
            "sse_subscribers": collector.subscriber_count,
            "sse_last_broadcast_age_seconds": round(max(0.0, last_broadcast_age), 3),
            "sse_latency_hint_ms": int(round(max(0.0, last_broadcast_age) * 1000)),
            "updated_at": payload.get("updated_at", ""),
            "generated_at": payload.get("generated_at", ""),
            "live_poll_seconds": settings.live_poll_seconds,
        }
    )


@app.get("/api/monitoring/backend")
def api_monitoring_backend() -> JSONResponse:
    payload = collector.latest_payload
    now_utc = datetime.now(timezone.utc)

    last_refresh_age = (now_utc - collector.last_refresh_at).total_seconds()
    last_successful_refresh_age = (now_utc - collector.last_successful_refresh_at).total_seconds()
    refresh_attempts = collector.refresh_attempts
    refresh_failures = collector.refresh_failures
    refresh_error_rate = 0.0
    if refresh_attempts > 0:
        refresh_error_rate = round(refresh_failures / refresh_attempts, 4)

    return JSONResponse(
        {
            "backend_online": True,
            "refresh_attempts": refresh_attempts,
            "refresh_failures": refresh_failures,
            "refresh_error_rate": refresh_error_rate,
            "last_refresh_age_seconds": round(max(0.0, last_refresh_age), 3),
            "last_successful_refresh_age_seconds": round(max(0.0, last_successful_refresh_age), 3),
            "last_refresh_error": collector.last_refresh_error,
            "last_refresh_duration_ms": collector.last_refresh_duration_ms,
            "sse_subscribers": collector.subscriber_count,
            "status_sources": payload.get("status_sources", []),
            "generated_at": payload.get("generated_at", ""),
            "updated_at": payload.get("updated_at", ""),
            "live_poll_seconds": settings.live_poll_seconds,
        }
    )


@app.get("/api/control/features")
def api_control_features(
    authorization: str | None = Header(default=None),
    x_portal_control_token: str | None = Header(default=None),
) -> JSONResponse:
    provided_token = _extract_token(authorization, x_portal_control_token)
    if control_auth_service.enabled:
        is_authenticated = control_auth_service.validate_session(provided_token)
        return JSONResponse(
            {
                "enabled": is_authenticated,
                "auth_required": True,
                "auth_mode": "userpass_session",
                "allowed_actions": settings.control_allowed_actions if is_authenticated else [],
            }
        )

    return JSONResponse(
        {
            "enabled": settings.control_enabled,
            "auth_required": bool(settings.control_token),
            "auth_mode": "legacy_token" if settings.control_token else "feature_flag",
            "allowed_actions": settings.control_allowed_actions,
        }
    )


@app.post("/api/control/auth/login")
def api_control_auth_login(body: ControlAuthLoginRequest) -> JSONResponse:
    if not control_auth_service.enabled:
        raise HTTPException(status_code=400, detail="Control auth is not configured")

    try:
        session_token = control_auth_service.authenticate(body.username, body.password)
    except ControlAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    return JSONResponse(
        {
            "ok": True,
            "control_token": session_token,
            "expires_in_seconds": settings.control_auth_session_ttl_seconds,
            "message": "Control session authenticated",
        }
    )


@app.post("/api/control/auth/logout")
def api_control_auth_logout(
    authorization: str | None = Header(default=None),
    x_portal_control_token: str | None = Header(default=None),
) -> JSONResponse:
    provided_token = _extract_token(authorization, x_portal_control_token)
    control_auth_service.logout(provided_token)
    return JSONResponse({"ok": True, "message": "Control session logged out"})


@app.post("/api/control/actions")
async def api_control_actions(
    body: ControlActionRequest,
    authorization: str | None = Header(default=None),
    x_portal_control_token: str | None = Header(default=None),
) -> JSONResponse:
    provided_token = _extract_token(authorization, x_portal_control_token)
    if control_auth_service.enabled:
        if not control_auth_service.validate_session(provided_token):
            raise HTTPException(status_code=401, detail="Control session invalid or expired")
    else:
        if not settings.control_enabled:
            raise HTTPException(status_code=403, detail="Control API is disabled by feature flag")

        expected_token = settings.control_token
        if expected_token:
            if not provided_token or provided_token != expected_token:
                raise HTTPException(status_code=401, detail="Invalid control token")

    action = body.action.strip().lower()
    if action not in settings.control_allowed_actions:
        raise HTTPException(status_code=400, detail="Unsupported control action")

    if action == "refresh_snapshot":
        changed = await collector.refresh_once(force_broadcast=True)
        return JSONResponse(
            {
                "ok": True,
                "action": action,
                "changed": changed,
                "generated_at": collector.latest_payload.get("generated_at", ""),
                "message": "Snapshot refresh completed",
            }
        )

    if action == "sample_history":
        now_utc = datetime.now(timezone.utc)
        history_store.insert_snapshot(collector.latest_payload, sampled_at=now_utc)
        history_store.prune_old(now_utc)
        return JSONResponse(
            {
                "ok": True,
                "action": action,
                "sampled_at": now_utc.isoformat(),
                "message": "History sample inserted",
            }
        )

    if action == "terminate_head_session":
        global _last_terminate_request_monotonic
        now_monotonic = time.monotonic()
        min_interval = max(0.0, settings.control_terminate_min_interval_seconds)
        if min_interval > 0 and (now_monotonic - _last_terminate_request_monotonic) < min_interval:
            retry_after = round(min_interval - (now_monotonic - _last_terminate_request_monotonic), 3)
            raise HTTPException(
                status_code=429,
                detail=f"Terminate action is rate-limited, retry in {retry_after}s",
            )

        sessions_value = collector.latest_payload.get("sessions", [])
        sessions = sessions_value if isinstance(sessions_value, list) else []
        if not sessions:
            raise HTTPException(status_code=404, detail="No active sessions available to terminate")

        target = sessions[0]
        try:
            terminate_result = await asyncio.to_thread(control_service.terminate_session, target)
        except SessionTerminationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        _last_terminate_request_monotonic = now_monotonic

        changed = await collector.refresh_once(force_broadcast=True)
        return JSONResponse(
            {
                "ok": True,
                "action": action,
                "changed": changed,
                "terminated": {
                    "username": target.get("username", ""),
                    "common_name": target.get("common_name", ""),
                    "real_address": target.get("real_address", ""),
                    "virtual_address": target.get("virtual_address", ""),
                    "protocol": target.get("protocol", ""),
                    "client_id": target.get("client_id", None),
                },
                "method": terminate_result.get("method", "unknown"),
                "result": terminate_result.get("result", ""),
                "message": "Head session termination requested",
                "generated_at": collector.latest_payload.get("generated_at", ""),
            }
        )

    raise HTTPException(status_code=400, detail="Unhandled control action")


@app.get("/api/sessions")
def api_sessions(
    limit: int | None = Query(default=None, ge=1),
    offset: int | None = Query(default=0, ge=0),
    protocol: str | None = Query(default=None),
    audit_class: str | None = Query(default=None),
    username: str | None = Query(default=None),
) -> JSONResponse:
    payload = collector.latest_payload
    sessions_value = payload.get("sessions", [])
    sessions = sessions_value if isinstance(sessions_value, list) else []
    filtered = _filter_sessions(sessions, protocol=protocol, audit_class=audit_class, username=username)

    parsed_limit, parsed_offset = _parse_limit_offset(limit, offset, settings.sessions_api_max_limit)
    paged_sessions = (
        filtered[parsed_offset : parsed_offset + parsed_limit]
        if parsed_limit is not None
        else filtered[parsed_offset:]
    )

    response_payload = dict(payload)
    response_payload["sessions"] = paged_sessions
    response_payload["pagination"] = {
        "total": len(sessions),
        "filtered": len(filtered),
        "returned": len(paged_sessions),
        "limit": parsed_limit,
        "offset": parsed_offset,
        "max_limit": settings.sessions_api_max_limit,
    }
    return JSONResponse(response_payload)


@app.get("/api/summary")
def api_summary() -> JSONResponse:
    payload = collector.latest_payload
    return JSONResponse(payload["summary"])


@app.get("/api/live/summary")
def api_live_summary() -> JSONResponse:
    payload = collector.latest_payload
    return JSONResponse(payload)


@app.get("/api/map/sessions")
def api_map_sessions(
    limit: int | None = Query(default=None, ge=1),
    offset: int | None = Query(default=0, ge=0),
    protocol: str | None = Query(default=None),
    audit_class: str | None = Query(default=None),
) -> JSONResponse:
    payload = collector.latest_payload
    sessions_value = payload.get("sessions", [])
    sessions = sessions_value if isinstance(sessions_value, list) else []
    filtered_sessions = _filter_sessions(sessions, protocol=protocol, audit_class=audit_class, username=None)

    parsed_limit, parsed_offset = _parse_limit_offset(limit, offset, settings.sessions_api_max_limit)
    paged_source = (
        filtered_sessions[parsed_offset : parsed_offset + parsed_limit]
        if parsed_limit is not None
        else filtered_sessions[parsed_offset:]
    )

    enriched_sessions = geoip_service.enrich_sessions(paged_source)

    country_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    for session in enriched_sessions:
        geo = session.get("geo", {}) if isinstance(session.get("geo", {}), dict) else {}
        country = str(geo.get("country", "")).strip() or "unknown"
        provider = str(geo.get("isp", "")).strip() or "unknown"
        country_counts[country] = country_counts.get(country, 0) + 1
        provider_counts[provider] = provider_counts.get(provider, 0) + 1

    mappable_total = sum(1 for session in enriched_sessions if bool(session.get("map_eligible")))
    mapped_trusted = sum(
        1
        for session in enriched_sessions
        if bool(session.get("map_eligible")) and str(session.get("audit_class", "")) == "trusted"
    )

    top_countries = sorted(country_counts.items(), key=lambda item: item[1], reverse=True)[:12]
    top_providers = sorted(provider_counts.items(), key=lambda item: item[1], reverse=True)[:12]

    return JSONResponse(
        {
            "generated_at": payload.get("generated_at", ""),
            "updated_at": payload.get("updated_at", ""),
            "live_poll_seconds": settings.live_poll_seconds,
            "session_total": len(filtered_sessions),
            "mappable_total": mappable_total,
            "mappable_trusted_total": mapped_trusted,
            "country_breakdown": [{"country": name, "count": count} for name, count in top_countries],
            "provider_breakdown": [{"provider": name, "count": count} for name, count in top_providers],
            "sessions": enriched_sessions,
            "pagination": {
                "total": len(sessions),
                "filtered": len(filtered_sessions),
                "returned": len(enriched_sessions),
                "limit": parsed_limit,
                "offset": parsed_offset,
                "max_limit": settings.sessions_api_max_limit,
            },
        }
    )


@app.get("/api/history/7d")
def api_history_7d() -> JSONResponse:
    days = history_store.get_daily_history(days=7)
    return JSONResponse(
        {
            "retention_days": settings.history_retention_days,
            "sample_seconds": settings.history_sample_seconds,
            "days": days,
        }
    )


@app.get("/api/live/sessions")
async def api_live_sessions() -> StreamingResponse:
    queue = await collector.subscribe()

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            collector.unsubscribe(queue)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/status-file")
def api_status_file(file: str | None = Query(default=None), lines: int = Query(default=400)) -> JSONResponse:
    context = _read_status_file_context(file_path=file, lines=lines)
    payload = context["payload"]
    return JSONResponse(
        {
            "status_file": context["status_file"],
            "read_error": context["read_error"],
            "raw_text": context["raw_text"],
            "status_exists": payload.get("status_exists", False),
            "updated_at": payload.get("updated_at", ""),
            "generated_at": payload.get("generated_at", ""),
            "status_sources": payload.get("status_sources", []),
        }
    )


@app.get("/status-file")
def status_file_view(request: Request, file: str | None = Query(default=None)) -> HTMLResponse:
    if frontend_index_file.exists():
        return FileResponse(frontend_index_file)

    context = _read_status_file_context(file_path=file, lines=400)

    return templates.TemplateResponse(
        request=request,
        name="status_file.html",
        context=context,
    )


@app.get("/")
def dashboard(request: Request):
    if frontend_index_file.exists():
        return FileResponse(frontend_index_file)

    payload = collector.latest_payload
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "title": settings.title,
            "payload": payload,
        },
    )


@app.get("/control")
def control_page(request: Request):
    if frontend_index_file.exists():
        return FileResponse(frontend_index_file)

    payload = collector.latest_payload
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "title": settings.title,
            "payload": payload,
        },
    )


@app.get("/operations")
def operations_page(request: Request):
    if frontend_index_file.exists():
        return FileResponse(frontend_index_file)

    payload = collector.latest_payload
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "title": settings.title,
            "payload": payload,
        },
    )
