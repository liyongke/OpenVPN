from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import load_settings
from app.services.openvpn_reader import load_openvpn_status

settings = load_settings()
app = FastAPI(title=settings.title)

base_dir = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(base_dir / "templates"))
app.mount("/static", StaticFiles(directory=str(base_dir / "static")), name="static")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/sessions")
def api_sessions() -> JSONResponse:
    payload = load_openvpn_status(settings.status_file)
    return JSONResponse(payload)


@app.get("/api/summary")
def api_summary() -> JSONResponse:
    payload = load_openvpn_status(settings.status_file)
    return JSONResponse(payload["summary"])


@app.get("/")
def dashboard(request: Request):
    payload = load_openvpn_status(settings.status_file)
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "title": settings.title,
            "payload": payload,
        },
    )
