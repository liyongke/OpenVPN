from __future__ import annotations

from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import load_settings
from app.services.history_store import HistoryStore
from app.services.live_state import LiveStateCollector
from app.services.openvpn_reader import load_openvpn_status

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


@app.on_event("startup")
async def startup_event() -> None:
    await collector.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await collector.stop()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


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


@app.get("/status-file")
def status_file_view(request: Request, file: str | None = Query(default=None)) -> HTMLResponse:
    payload = collector.latest_payload

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

    selected = file if file else default_source
    status_path = Path(selected)
    raw_text = ""
    read_error = ""

    try:
        if status_path.exists():
            lines = status_path.read_text(encoding="utf-8", errors="ignore").splitlines()
            raw_text = "\n".join(lines[-400:])
        else:
            read_error = "Status file does not exist at the configured path."
    except (PermissionError, OSError) as exc:
        read_error = f"Unable to read status file: {exc}"

    return templates.TemplateResponse(
        request=request,
        name="status_file.html",
        context={
            "title": settings.title,
            "status_file": selected,
            "read_error": read_error,
            "raw_text": raw_text,
            "payload": payload,
        },
    )


@app.get("/")
def dashboard(request: Request):
    payload = collector.latest_payload
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "title": settings.title,
            "payload": payload,
        },
    )
