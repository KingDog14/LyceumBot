# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .routes import auth, chat, docs, admin, push

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"

app = FastAPI(title="Лицей GPT", version="1.0")

app.include_router(auth.router,  prefix="/api/auth",  tags=["auth"])
app.include_router(chat.router,  prefix="/api/chat",  tags=["chat"])
app.include_router(docs.router,  prefix="/api/docs",  tags=["docs"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(push.router,  prefix="/api/push",  tags=["push"])

app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/manifest.json")
async def manifest():
    return FileResponse(
        FRONTEND / "manifest.json",
        media_type="application/manifest+json",
    )


@app.get("/sw.js")
async def service_worker():
    return FileResponse(
        FRONTEND / "sw.js",
        media_type="application/javascript",
        headers={
            "Service-Worker-Allowed": "/",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(FRONTEND / "icons" / "192.png", media_type="image/png")


@app.get("/{full_path:path}")
async def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse(FRONTEND / "index.html")