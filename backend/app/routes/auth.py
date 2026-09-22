import re
from fastapi import APIRouter, HTTPException, Response, Depends
from pydantic import BaseModel, Field

from ..db import DB, format_code
from ..config import settings
from ..auth import create_token, get_current_user, get_optional_user

router = APIRouter()
db = DB(settings.DB_PATH)


def _normalize_code(c: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (c or "").upper())


def _public(u: dict) -> dict:
    return {
        "id": u["id"],
        "name": u["name"],
        "role": u["role"],
        "code": u["access_code"],
        "code_formatted": format_code(u["access_code"]),
        "is_admin": u["role"] == "admin",
    }


def _set_cookie(resp: Response, token: str):
    resp.set_cookie(
        "access_token", token,
        httponly=True, samesite="lax",
        secure=settings.COOKIE_SECURE,
        max_age=settings.TOKEN_TTL_MIN * 60,
    )


class OnboardIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = "student"


class CodeIn(BaseModel):
    code: str


@router.get("/me")
def me(user=Depends(get_current_user)):
    return _public(user)


@router.post("/onboard")
def onboard(data: OnboardIn, resp: Response, user=Depends(get_optional_user)):
    """Первый заход: создаёт аккаунт с уникальным кодом."""
    if user:
        return _public(user)

    if data.role not in ("student", "teacher", "parent"):
        raise HTTPException(400, "Invalid role")

    reserved = settings.ADMIN_CODES  # уже нормализованы в config
    code = db.generate_unique_code(reserved)
    uid = db.create_user(code, data.name.strip(), data.role)
    _set_cookie(resp, create_token(uid, data.role))
    return _public(db.get_user_by_id(uid))


@router.post("/login-code")
def login_code(data: CodeIn, resp: Response):
    """Вход по коду. Админский код → роль admin."""
    code = _normalize_code(data.code)
    if len(code) < 4:
        raise HTTPException(400, "Неверный код")

    if code in settings.ADMIN_CODES:
        u = db.get_user_by_code(code)
        if not u:
            uid = db.create_user(code, "Админ", "admin")
            u = db.get_user_by_id(uid)
        _set_cookie(resp, create_token(u["id"], "admin"))
        return _public(u)

    u = db.get_user_by_code(code)
    if not u:
        raise HTTPException(404, "Код не найден")
    _set_cookie(resp, create_token(u["id"], u["role"]))
    return _public(u)


@router.post("/logout")
def logout(resp: Response):
    resp.delete_cookie("access_token")
    return {"ok": True}