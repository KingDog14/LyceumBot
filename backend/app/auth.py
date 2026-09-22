from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status, Cookie

from .config import settings


def create_token(user_id: int, role: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=settings.TOKEN_TTL_MIN)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "exp": exp},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def _load_user(token: Optional[str]):
    if not token:
        return None
    try:
        payload = _decode(token)
    except HTTPException:
        return None
    from .db import DB
    return DB(settings.DB_PATH).get_user_by_id(int(payload["sub"]))


def get_current_user(token: Optional[str] = Cookie(default=None, alias="access_token")):
    user = _load_user(token)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


def get_optional_user(token: Optional[str] = Cookie(default=None, alias="access_token")):
    return _load_user(token)


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user