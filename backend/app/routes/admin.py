from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..db import DB, format_code
from ..config import settings

router = APIRouter()
db = DB(settings.DB_PATH)


class RoleIn(BaseModel):
    role: str


@router.get("/users")
def users(_=Depends(require_admin)):
    out = []
    for u in db.list_users():
        out.append({
            "id": u["id"],
            "name": u["name"],
            "role": u["role"],
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


@router.get("/stats")
def stats(_=Depends(require_admin)):
    return {
        "users": len(db.list_users()),
        "docs": len(db.list_docs()),
        "public_docs": len([d for d in db.list_docs() if d.get("owner_id") is None]),
    }