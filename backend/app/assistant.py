import os
import re
import json
import asyncio
import logging
import threading
from datetime import datetime
from typing import AsyncIterator, List, Dict, Optional

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


class RAGAssistant:
    """Ассистент поверх GigaChat с RAG-контекстом и историей пользователя."""

    def __init__(self, db):
        self.db = db

    # ---------- client ----------
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

    # ---------- retrieval ----------
    def retrieve_context(self, question: str, docs: List[Dict] = None, top_k: int = 5) -> str:
        if docs is None:
            docs = self.db.list_docs()
        if not docs:
            return ""

        q_words = {w.lower() for w in re.findall(r"\w+", question) if len(w) > 2}

        scored = []
        for d in docs:
            text = f"{d.get('title', '')} {d.get('content', '')}".lower()
            score = sum(1 for w in q_words if w in text)
            scored.append((score, d))

        scored.sort(key=lambda x: x[0], reverse=True)
        matched = [d for s, d in scored if s > 0][:top_k]

        # Если слов не совпало, но документы у юзера есть — берём первые.
        if not matched:
            matched = [d for _, d in scored[:top_k]]

        return "\n\n---\n\n".join(d.get("content", "") for d in matched)

    # ---------- prompt ----------
    def _build_messages(self, question: str, user_id: int, role: str, context: str):
        history = (self.db.get_user_history(user_id) or [])[-10:]
        now = datetime.now().strftime("%d.%m.%Y %H:%M")
        has_ctx = bool(context and context.strip())

        if has_ctx:
            system = f"""Ты — ассистент Лицея GPT. Дружелюбный, живой, отвечаешь по-человечески.
Роль пользователя: {role}. Сейчас: {now}.

У тебя есть фрагменты базы знаний пользователя (ниже, в блоке КОНТЕКСТ).
ПРАВИЛА:
1. Если вопрос КАСАЕТСЯ содержимого контекста — опирайся ТОЛЬКО на него, не выдумывай факты.
2. Если вопрос общий (приветствие, кто ты, что умеешь, объяснение, шутка, код и т.п.) — отвечай своими знаниями, контекст не нужен.
3. Никогда не упоминай слова «контекст», «база знаний», «промпт». Пользователь видит только ответ.
4. Кратко, по делу, без канцелярита. Разрешён Markdown.

КОНТЕКСТ:
{context}"""
        else:
            system = f"""Ты — ассистент Лицея GPT. Дружелюбный, живой.
Роль пользователя: {role}. Сейчас: {now}.

У пользователя пока нет личных документов в базе — отвечай своими знаниями.
Если вопрос про лицей и ты не знаешь ответа — так и скажи.
Никогда не упоминай «контекст» и «промпт»."""

        msgs = [{"role": "system", "content": system}]
        msgs += [{"role": h["role"], "content": h["content"]} for h in history]
        msgs.append({"role": "user", "content": question})
        return msgs, history

    # ---------- non-stream (на случай, если понадобится) ----------
    def ask_sync(self, question: str, user_id: int, role: str,
                 docs: List[Dict] = None) -> str:
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

    # ---------- stream ----------
    async def ask_stream(self, question: str, user_id: int, role: str,
                         docs: List[Dict] = None) -> AsyncIterator[str]:
        context = self.retrieve_context(question, docs)
        msg_dicts, history = self._build_messages(question, user_id, role, context)

        # --- Fallback: нет ключа GigaChat ---
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

        # --- Собираем payload ---
        try:
            payload = self._make_payload(msg_dicts)
        except Exception as e:
            logger.exception("Не удалось собрать payload для GigaChat")
            yield f"⚠️ Ошибка подготовки запроса: {e}"
            return

        # --- Стрим через thread + asyncio.Queue ---
        queue: "asyncio.Queue[tuple]" = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def worker():
            """Синхронный SDK в отдельном потоке. Кладёт в очередь:
                ("chunk", text) | ("error", text) | ("done", None)
            """
            try:
                with self._build_client() as client:
                    for chunk in client.stream(payload):
                        if not chunk.choices:
                            continue
                        choice = chunk.choices[0]
                        # У стриминговых чанков обычно delta.content
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
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    ("error", f"GigaChat недоступен: {e}"),
                )
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

        # Если совсем ничего не пришло — не сохраняем пустой ответ
        if had_error and not full:
            return

        full_clean = self._clean(full)
        # Если чистили — могли отрезать хвост у уже отданного стрима.
        # Дописываем разницу, чтобы фронт получил полный текст без рекламы.
        if full_clean and full_clean != full:
            # Ничего не доливаем повторно — просто сохраняем в историю
            pass

        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": full_clean or full})
        self.db.set_user_history(user_id, history)

    # ---------- helpers ----------
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
        # убираем рекламные хвосты, если GigaChat их дописывает
        text = re.sub(r"(Powered by|gigachat\.ai|sberbank).*$", "", text,
                      flags=re.IGNORECASE | re.DOTALL)
        return text.strip()