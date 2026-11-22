# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

import os
import tempfile
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Response
from fastapi.responses import FileResponse

from ..auth import get_current_user
from ..db import DB
from ..assistant import RAGAssistant
from ..rag import ingest_text, SUPPORTED_EXTS
from ..config import settings

router = APIRouter()
db = DB(settings.DB_PATH)
assistant = RAGAssistant(db)


def _ext_ok(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS


def _ext_list_human() -> str:
    return ", ".join(SUPPORTED_EXTS)


def _safe_download_name(title: str, ext: str) -> str:
    base = (title or "document").strip()
    base = base.replace("/", "_").replace("\\", "_").replace('"', "'")
    base = base.replace("\r", "").replace("\n", "")
    if ext:
        ext = ext.lower()
        if not base.lower().endswith(ext):
            if "." in base:
                base = os.path.splitext(base)[0] + ext
            else:
                base = base + ext
    return base or "document"


def _content_disposition(filename: str) -> str:
    ascii_fallback = "".join(
        c if ord(c) < 128 and c not in '"\\' else "_"
        for c in filename
    ) or "document"
    return (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )


@router.get("/list")
def list_docs(user=Depends(get_current_user)):
    docs = db.list_docs_for(user)
    users_cache = {}
    if user["role"] == "admin":
        users_cache = {u["id"]: u["name"] for u in db.list_users()}

    out = []
    for d in docs:
        owner_id = d.get("owner_id")
        out.append({
            "id": d["id"],
            "title": d["title"],
            "preview": (d["content"] or "")[:200],
            "owner_id": owner_id,
            "owner_name": users_cache.get(owner_id) if owner_id else None,
            "mine": owner_id == user["id"],
            "public": owner_id is None,
        })
    return out


@router.get("/{doc_id}/download")
def download_doc(doc_id: int, user=Depends(get_current_user)):
    d = db.get_doc(doc_id)
    if not d:
        raise HTTPException(404, "Документ не найден")
    if user["role"] != "admin" and d.get("owner_id") not in (None, user["id"]):
        raise HTTPException(403, "Нет доступа")

    original_title = (d.get("title") or f"document_{doc_id}").strip()
    file_path = d.get("file_path")

    if file_path and os.path.exists(file_path):
        base = os.path.abspath(settings.UPLOADS_DIR)
        if os.path.abspath(file_path).startswith(base):
            ext = os.path.splitext(file_path)[1]
            download_name = _safe_download_name(original_title, ext)
            return FileResponse(
                path=file_path,
                media_type=d.get("mime_type") or "application/octet-stream",
                headers={
                    "Content-Disposition": _content_disposition(download_name),
                },
            )

    ext = Path(original_title).suffix or ".txt"
    if ext.lower() != ".txt":
        download_name = _safe_download_name(original_title, ".txt")
    else:
        download_name = _safe_download_name(original_title, ".txt")

    content = (d.get("content") or "").encode("utf-8")
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": _content_disposition(download_name),
            "Content-Length": str(len(content)),
        },
    )


@router.get("/{doc_id}")
def get_doc(doc_id: int, user=Depends(get_current_user)):
    d = db.get_doc(doc_id)
    if not d:
        raise HTTPException(404, "Not found")
    if user["role"] != "admin" and d.get("owner_id") not in (None, user["id"]):
        raise HTTPException(403, "Нет доступа")

    fp = d.get("file_path")
    has_file = bool(fp and os.path.exists(fp))

    return {
        "id": d["id"],
        "title": d["title"],
        "content": d["content"],
        "mime_type": d.get("mime_type"),
        "has_file": has_file,
    }


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    public: bool = Query(False),
    user=Depends(get_current_user),
):
    if not file.filename or not _ext_ok(file.filename):
        raise HTTPException(400, f"Поддерживаются только: {_ext_list_human()}")

    if public and user["role"] != "admin":
        raise HTTPException(403, "Публичные файлы может загружать только администратор")

    owner_id = None if public else user["id"]
    suffix = Path(file.filename).suffix.lower()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        ids = ingest_text(
            db, assistant, file.filename,
            file_path=tmp_path, owner_id=owner_id,
        )
        return {"added": len(ids), "ids": ids, "public": public}
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.delete("/{doc_id}")
def delete(doc_id: int, user=Depends(get_current_user)):
    d = db.get_doc(doc_id)
    if not d:
        raise HTTPException(404)
    if user["role"] != "admin" and d.get("owner_id") != user["id"]:
        raise HTTPException(403, "Нет доступа")

    db.delete_doc(doc_id)

    fp = d.get("file_path")
    if fp:
        try:
            base = os.path.abspath(settings.UPLOADS_DIR)
            if os.path.abspath(fp).startswith(base) and os.path.exists(fp):
                os.remove(fp)
        except OSError:
            pass

    return {"ok": True}