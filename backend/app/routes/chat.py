# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import get_current_user
from ..assistant import RAGAssistant
from ..db import DB
from ..config import settings

logger = logging.getLogger("chat")

router = APIRouter()
db = DB(settings.DB_PATH)
assistant = RAGAssistant(db)


class ChatIn(BaseModel):
    message: str


@router.post("/stream")
async def stream(payload: ChatIn, user=Depends(get_current_user)):
    docs = db.list_docs_for_rag(user)
    logger.info(
        "[chat] user=%s role=%s docs_in_rag=%d",
        user["id"], user["role"], len(docs),
    )

    async def gen():
        async for chunk in assistant.ask_stream(
            payload.message, user["id"], user["role"], docs=docs
        ):
            safe = chunk.replace("\r", "").replace("\n", "\\n")
            yield f"data: {safe}\n\n"
        yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history")
def history(user=Depends(get_current_user)):
    return db.get_user_history(user["id"])


@router.delete("/history")
def clear(user=Depends(get_current_user)):
    db.set_user_history(user["id"], [])
    return {"ok": True}