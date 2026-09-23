# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

import os
import re
import json
import asyncio
import logging
import threading
from datetime import datetime
from typing import AsyncIterator, List, Dict

from gigachat import GigaChat
from gigachat.exceptions import GigaChatException
from gigachat.models import Chat, Messages, MessagesRole

from .config import settings

logger = logging.getLogger("assistant")


ROLE_MAP = {
    "system": MessagesRole.SYSTEM,
    "user": MessagesRole.USER,
    "assistant": MessagesRole.ASSISTANT,
}


MAX_CONTEXT_CHARS = 40000


class RAGAssistant:
    def __init__(self, db):
        self.db = db

    def _build_client(self) -> GigaChat:
        return GigaChat(
            base_url=settings.GIGACHAT_BASE_URL,
            credentials=settings.GIGACHAT_CREDENTIALS,
            scope=settings.GIGACHAT_SCOPE,
            model=settings.GIGACHAT_MODEL,
            verify_ssl_certs=settings.GIGACHAT_VERIFY_SSL,
            timeout=settings.GIGACHAT_TIMEOUT,
        )

    def has_credentials(self) -> bool:
        return bool(settings.GIGACHAT_CREDENTIALS)

    def retrieve_context(self, question: str = "", docs: List[Dict] = None) -> str:
        if docs is None:
            docs = self.db.list_docs()
        if not docs:
            return ""

        sorted_docs = sorted(
            docs,
            key=lambda d: (-(len(d.get("content") or "")), d.get("id", 0)),
        )

        parts: List[str] = []
        total = 0
        for d in sorted_docs:
            title = (d.get("title") or "Документ").strip()
            body = (d.get("content") or "").strip()
            if not body:
                continue
            block = f"### {title}\n{body}"
            if total + len(block) > MAX_CONTEXT_CHARS:
                remaining = MAX_CONTEXT_CHARS - total
                if remaining > 500:
                    parts.append(block[:remaining] + "\n…[обрезано]")
                break
            parts.append(block)
            total += len(block)

        return "\n\n---\n\n".join(parts)

    def _build_messages(self, question: str, user_id: int, role: str, context: str):
        history = (self.db.get_user_history(user_id) or [])[-10:]
        now = datetime.now().strftime("%d.%m.%Y %H:%M")
        has_ctx = bool(context and context.strip())

        if has_ctx:
            system = f"""Ты — ассистент Лицея GPT. Дружелюбный, живой, отвечаешь по-человечески.
Разработчик этого приложения — Король Дмитрий. Оно работает на базе технологий искусственного интеллекта. Если спросят «кто тебя создал», отвечай: «Я — ИИ-ассистент, приложение разработал Король Дмитрий, а моя основа — это технологии GigaChat от Сбера».
Роль пользователя: {role}. Сейчас: {now}.

Ниже — ВСЕ документы пользователя из его базы знаний. Каждый блок начинается с "### Название".
ПРАВИЛА:
1. Если вопрос пользователя можно связать с содержимым любого блока — опирайся ТОЛЬКО на него, не выдумывай факты. Обязательно используй имя документа, к которому обращаешься.
2. Если вопрос общий (приветствие, кто ты, что умеешь, объяснение, шутка, код и т.п.) — отвечай своими знаниями, документы не нужны.
3. Никогда не упоминай слова «контекст», «база знаний», «промпт». Пользователь видит только ответ.
4. Кратко, по делу. Разрешён Markdown.

ДОКУМЕНТЫ:
{context}"""
        else:
            system = f"""Ты — ассистент Лицея GPT. Дружелюбный, живой.
Разработчик этого приложения — Король Дмитрий. Оно работает на базе технологий искусственного интеллекта. Если спросят «кто тебя создал», отвечай: «Я — ИИ-ассистент, приложение разработал Король Дмитрий, а моя основа — это технологии GigaChat от Сбера».
Роль пользователя: {role}. Сейчас: {now}.

У пользователя пока нет личных документов в базе — отвечай своими знаниями.
Если вопрос про лицей и ты не знаешь ответа — так и скажи.
Никогда не упоминай «контекст» и «промпт»."""

        msgs = [{"role": "system", "content": system}]
        msgs += [{"role": h["role"], "content": h["content"]} for h in history]
        msgs.append({"role": "user", "content": question})
        return msgs, history

    def ask_sync(self, question: str, user_id: int, role: str, docs: List[Dict] = None) -> str:
        context = self.retrieve_context(question, docs)
        msg_dicts, history = self._build_messages(question, user_id, role, context)

        if not self.has_credentials():
            answer = (f"ИИ временно недоступен. Вот что нашлось в базе:\n\n{context}"
                      if context else "ИИ временно недоступен. Попробуйте позже.")
        else:
            payload = self._make_payload(msg_dicts)
            try:
                with self._build_client() as client:
                    response = client.chat(payload)
                answer = response.choices[0].message.content or ""
                answer = self._clean(answer)
            except GigaChatException as e:
                logger.exception("GigaChat error (ask_sync)")
                answer = f"⚠️ GigaChat недоступен: {e}"
            except Exception as e:
                logger.exception("Unexpected error (ask_sync)")
                answer = f"⚠️ Ошибка ИИ: {e}"

        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": answer})
        self.db.set_user_history(user_id, history)
        return answer

    async def ask_stream(self, question: str, user_id: int, role: str, docs: List[Dict] = None) -> AsyncIterator[str]:
        context = self.retrieve_context(question, docs)
        logger.info("RAG: docs=%d context_chars=%d", len(docs or []), len(context))
        msg_dicts, history = self._build_messages(question, user_id, role, context)

        if not self.has_credentials():
            if context:
                answer = f"ИИ временно недоступен. Вот что нашлось в базе знаний:\n\n{context}"
            else:
                answer = "ИИ временно недоступен. Попробуйте позже."
            yield answer
            history.append({"role": "user", "content": question})
            history.append({"role": "assistant", "content": answer})
            self.db.set_user_history(user_id, history)
            return

        try:
            payload = self._make_payload(msg_dicts)
        except Exception as e:
            logger.exception("Не удалось собрать payload для GigaChat")
            yield f"⚠️ Ошибка подготовки запроса: {e}"
            return

        queue: "asyncio.Queue" = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def worker():
            try:
                with self._build_client() as client:
                    for chunk in client.stream(payload):
                        if not chunk.choices:
                            continue
                        choice = chunk.choices[0]
                        text = None
                        delta = getattr(choice, "delta", None)
                        if delta is not None:
                            text = getattr(delta, "content", None)
                        if not text:
                            msg = getattr(choice, "message", None)
                            if msg is not None:
                                text = getattr(msg, "content", None)
                        if text:
                            loop.call_soon_threadsafe(queue.put_nowait, ("chunk", text))
            except GigaChatException as e:
                logger.exception("GigaChat stream error")
                loop.call_soon_threadsafe(queue.put_nowait, ("error", f"GigaChat недоступен: {e}"))
            except Exception as e:
                logger.exception("GigaChat stream unexpected error")
                loop.call_soon_threadsafe(queue.put_nowait, ("error", str(e)))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, ("done", None))

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

        full = ""
        had_error = False
        while True:
            kind, item = await queue.get()
            if kind == "done":
                break
            if kind == "error":
                had_error = True
                yield f"⚠️ {item}"
                continue
            if kind == "chunk":
                full += item
                yield item

        if had_error and not full:
            return

        full_clean = self._clean(full)

        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": full_clean or full})
        self.db.set_user_history(user_id, history)

    @staticmethod
    def _make_payload(msg_dicts: List[Dict]) -> Chat:
        messages = [
            Messages(
                role=ROLE_MAP.get((m.get("role") or "user").lower(), MessagesRole.USER),
                content=m.get("content", ""),
            )
            for m in msg_dicts
        ]
        return Chat(messages=messages)

    @staticmethod
    def _clean(text: str) -> str:
        text = re.sub(r"(Powered by|gigachat\.ai|sberbank).*$", "", text,
                      flags=re.IGNORECASE | re.DOTALL)
        return text.strip()