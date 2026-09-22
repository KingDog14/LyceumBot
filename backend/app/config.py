import os
import re
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _normalize_code(c: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (c or "").upper())


def _as_bool(v: str, default: bool = False) -> bool:
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


class Settings:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ALGORITHM = "HS256"
    TOKEN_TTL_MIN = 60 * 24 * 365

    DB_PATH = os.getenv("DB_PATH", str(ROOT / "backend" / "rag_bot.db"))
    COOKIE_SECURE = _as_bool(os.getenv("COOKIE_SECURE"), False)

    ADMIN_CODES = {
        _normalize_code(c)
        for c in os.getenv("ADMIN_CODES", "").split(",")
        if _normalize_code(c)
    }

    # ---------- GigaChat ----------
    GIGACHAT_BASE_URL = os.getenv("GIGACHAT_BASE_URL", "https://api.giga.chat/v1")
    GIGACHAT_MODEL = os.getenv("GIGACHAT_MODEL", "GigaChat-2")
    GIGACHAT_CREDENTIALS = os.getenv("GIGACHAT_CREDENTIALS", "")
    GIGACHAT_SCOPE = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
    GIGACHAT_VERIFY_SSL = _as_bool(os.getenv("GIGACHAT_VERIFY_SSL"), False)
    GIGACHAT_TIMEOUT = float(os.getenv("GIGACHAT_TIMEOUT", "60"))


settings = Settings()