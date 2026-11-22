# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..db import DB, format_code
from ..config import settings

router = APIRouter()
db = DB(settings.DB_PATH)


class RoleIn(BaseModel):
    role: str

class BanIn(BaseModel):
    is_banned: bool

class ConfigIn(BaseModel):
    system_prompt: str
    max_context_chars: int


@router.get("/users")
def users(_=Depends(require_admin)):
    out = []
    for u in db.list_users():
        out.append({
            "id": u["id"],
            "name": u["name"],
            "role": u["role"],
            "is_banned": bool(u.get("is_banned", 0)),
            "code": u["access_code"],
            "code_formatted": format_code(u["access_code"]),
            "created_at": u["created_at"],
        })
    return out


@router.post("/users/{uid}/role")
def set_role(uid: int, data: RoleIn, _=Depends(require_admin)):
    if data.role not in ("student", "teacher", "parent", "admin"):
        raise HTTPException(400, "Invalid role")
    db.set_role(uid, data.role)
    return {"ok": True}


@router.post("/users/{uid}/ban")
def set_ban(uid: int, data: BanIn, _=Depends(require_admin)):
    db.set_ban(uid, data.is_banned)
    return {"ok": True}


@router.get("/stats")
def stats(_=Depends(require_admin)):
    return {
        "users": len(db.list_users()),
        "docs": len(db.list_docs()),
        "public_docs": len([d for d in db.list_docs() if d.get("owner_id") is None]),
    }


@router.get("/config")
def get_config(_=Depends(require_admin)):
    return {
        "system_prompt": db.get_config("system_prompt", ""),
        "max_context_chars": int(db.get_config("max_context_chars", "120000")),
    }


@router.post("/config")
def set_config(data: ConfigIn, _=Depends(require_admin)):
    db.set_config("system_prompt", data.system_prompt)
    db.set_config("max_context_chars", str(data.max_context_chars))
    return {"ok": True}