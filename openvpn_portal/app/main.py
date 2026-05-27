from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.config import load_settings
from app.services.history_store import HistoryStore
from app.services.live_state import LiveStateCollector

settings = load_settings()
app = FastAPI(title=settings.title)
history_store = HistoryStore(settings.history_db_path, retention_days=settings.history_retention_days)
collector = LiveStateCollector(
    settings.status_files,
    poll_interval_seconds=max(0.5, settings.live_poll_seconds),
    history_store=history_store,
    history_sample_seconds=settings.history_sample_seconds,
    device_hints_file=settings.device_hints_file,
)

base_dir = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(base_dir / "templates"))
app.mount("/static", StaticFiles(directory=str(base_dir / "static")), name="static")
frontend_index_file = base_dir / "static" / "frontend" / "index.html"


class ControlActionRequest(BaseModel):
    action: str


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


@app.get("/api/control/features")
def api_control_features() -> JSONResponse:
    return JSONResponse(
        {
            "enabled": settings.control_enabled,
            "auth_required": bool(settings.control_token),
            "allowed_actions": settings.control_allowed_actions,
        }
    )


@app.post("/api/control/actions")
async def api_control_actions(
    body: ControlActionRequest,
    authorization: str | None = Header(default=None),
    x_portal_control_token: str | None = Header(default=None),
) -> JSONResponse:
    if not settings.control_enabled:
        raise HTTPException(status_code=403, detail="Control API is disabled by feature flag")

    expected_token = settings.control_token
    provided_token = _extract_token(authorization, x_portal_control_token)
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

    raise HTTPException(status_code=400, detail="Unhandled control action")


@app.get("/api/sessions")
def api_sessions() -> JSONResponse:
    payload = collector.latest_payload
    return JSONResponse(payload)


@app.get("/api/summary")
def api_summary() -> JSONResponse:
    payload = collector.latest_payload
    return JSONResponse(payload["summary"])


@app.get("/api/live/summary")
def api_live_summary() -> JSONResponse:
    payload = collector.latest_payload
    return JSONResponse(payload)


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
