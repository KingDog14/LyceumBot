"""
Модуль уведомлений (заготовка).
Подключается к VAPID-ключу и базе подписок.
Сейчас просто логирует подписку, чтобы фронт мог работать.
"""

import logging
from fastapi import APIRouter, Depends, Request
from ..auth import get_current_user

logger = logging.getLogger("push")

router = APIRouter()

# здесь будет in-memory / SQLite хранилище подписок
_subscriptions: list[dict] = []


@router.post("/subscribe")
async def subscribe(req: Request, user=Depends(get_current_user)):
    data = await req.json()
    entry = {
        "user_id": user["id"],
        "endpoint": data.get("endpoint"),
        "keys": data.get("keys"),
    }
    # TODO: сохранить в БД; отфильтровать дубликаты по endpoint
    _subscriptions.append(entry)
    logger.info("[push] subscribe user=%s endpoint=%s...",
                user["id"], (entry["endpoint"] or "")[:60])
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(req: Request, user=Depends(get_current_user)):
    data = await req.json()
    endpoint = data.get("endpoint")
    global _subscriptions
    _subscriptions = [s for s in _subscriptions if s["endpoint"] != endpoint]
    return {"ok": True}


@router.get("/status")
def status(user=Depends(get_current_user)):
    mine = [s for s in _subscriptions if s["user_id"] == user["id"]]
    return {"subscribed": bool(mine), "count": len(mine)}