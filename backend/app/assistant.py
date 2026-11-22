# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

import os
import re
import json
import asyncio
import logging
import threading
from datetime import datetime
from typing import AsyncIterator, List, Dict, Tuple, Any

from gigachat import GigaChat
from gigachat.exceptions import GigaChatException
from gigachat.models import (
    Chat, Messages, MessagesRole, Function, FunctionParameters
)

from .config import settings

logger = logging.getLogger("assistant")

ROLE_MAP = {
    "system": MessagesRole.SYSTEM,
    "user": MessagesRole.USER,
    "assistant": MessagesRole.ASSISTANT,
    "function": MessagesRole.FUNCTION,
}


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

    # ============================================================
    # ИНСТРУМЕНТЫ (TOOLS)
    # ============================================================
    def _get_functions(self) -> List[Function]:
        return [
            Function(
                name="list_documents",
                description="Возвращает список всех документов в базе знаний (ID и название). Используй, если поиск не дал результатов.",
                parameters=FunctionParameters(type="object", properties={}, required=[]),
            ),
            Function(
                name="search_documents",
                description="Ищет документы по ключевым словам и возвращает текст найденных файлов.",
                parameters=FunctionParameters(
                    type="object",
                    properties={
                        "query": {
                            "type": "string",
                            "description": "Ключевые слова для поиска (например: 'медиакласс', '10 класс', 'олимпиада')",
                        }
                    },
                    required=["query"],
                ),
            ),
            Function(
                name="read_document",
                description="Читает полное содержимое документа по его ID. Вызывай, если в результатах search_documents текст обрезан.",
                parameters=FunctionParameters(
                    type="object",
                    properties={
                        "doc_id": {
                            "type": "integer",
                            "description": "ID документа (число)",
                        }
                    },
                    required=["doc_id"],
                ),
            ),
        ]

    def _execute_tool(self, name: str, args: Dict[str, Any], docs: List[Dict], sources: Dict[int, Dict], question: str = "") -> str:
        if name == "list_documents":
            listing = "\n".join(f"#{d['id']}: {d['title']}" for d in docs)
            return json.dumps({"status": "success", "documents": listing}, ensure_ascii=False)

        elif name == "search_documents":
            query = args.get("query", "").strip()
            if not query:
                query = question
            
            if not query:
                return json.dumps({"status": "error", "message": "Не передан query."}, ensure_ascii=False)
            
            words = [w.lower() for w in re.findall(r'\w+', query) if len(w) >= 2]
            if not words:
                return json.dumps({"status": "error", "message": "Слишком короткие слова."}, ensure_ascii=False)
            
            scored = []
            for d in docs:
                title = (d.get("title") or "").lower()
                content = (d.get("content") or "").lower()
                score = 0
                for w in words:
                    stem = w[:5] if len(w) >= 5 else w
                    if stem in title:
                        score += 20
                    if stem in content:
                        score += 5
                if score > 0:
                    scored.append((score, d))
            
            scored.sort(key=lambda x: x[0], reverse=True)
            top = [d for _, d in scored[:5]]
            
            if not top:
                return json.dumps({"status": "success", "message": f"По запросу '{query}' ничего не найдено. Попробуй list_documents."}, ensure_ascii=False)
            
            result_parts = []
            for d in top[:3]:
                sources[d["id"]] = {"id": d["id"], "title": d["title"]}
                content = (d.get("content") or "")[:6000]
                result_parts.append(f"### Файл #{d['id']} | {d['title']}\n{content}")
            
            res_text = "\n\n".join(result_parts)
            return json.dumps({"status": "success", "results": res_text}, ensure_ascii=False)

        elif name == "read_document":
            doc_id = args.get("doc_id")
            if not isinstance(doc_id, int):
                try:
                    doc_id = int(doc_id)
                except:
                    return json.dumps({"status": "error", "message": "Неверный формат doc_id."}, ensure_ascii=False)
                    
            doc = next((d for d in docs if d["id"] == doc_id), None)
            if not doc:
                return json.dumps({"status": "error", "message": f"Документ #{doc_id} не найден."}, ensure_ascii=False)
            
            content = (doc.get("content") or "")[:12000]
            sources[doc_id] = {"id": doc_id, "title": doc["title"]}
            return json.dumps({"status": "success", "title": doc['title'], "content": content}, ensure_ascii=False)

        return json.dumps({"status": "error", "message": f"Неизвестная функция '{name}'."}, ensure_ascii=False)

    # ============================================================
    # АГЕНТНЫЙ ЦИКЛ (Function Calling)
    # ============================================================
    def _run_agent(self, question: str, docs: List[Dict], max_iter: int = 6) -> Tuple[str, List[Dict]]:
        sources: Dict[int, Dict] = {}
        
        agent_system = (
            "Ты — интеллектуальный агент Лицея GPT. Твоя задача — найти в базе знаний максимум информации по вопросу.\n"
            "У тебя есть инструменты: list_documents, search_documents, read_document.\n\n"
            "СТРАТЕГИЯ:\n"
            "1. Сначала вызови search_documents с ключевыми словами.\n"
            "2. Если в тексте есть хоть какая-то информация по теме — ОБЯЗАТЕЛЬНО используй её. Не игнорируй частичные ответы.\n"
            "3. Если поиск вообще ничего не дал — вызови list_documents и поищи по названиям файлов.\n"
            "4. Если пользователь задал сложный вопрос (например, 'расскажи про X и Y'), ищи информацию по обоим пунктам.\n"
            "НЕ ВЫДУМЫВАЙ факты. Но если факты есть в документах — смело их используй.\n"
        )

        messages = [
            Messages(role=MessagesRole.SYSTEM, content=agent_system),
            Messages(role=MessagesRole.USER, content=question),
        ]

        functions = self._get_functions()
        context_accumulator = ""

        for iteration in range(max_iter):
            payload = Chat(
                messages=messages,
                functions=functions,
                function_call="auto",
            )

            try:
                with self._build_client() as client:
                    response = client.chat(payload)
            except Exception as e:
                logger.error("Agent API error: %s", e)
                break

            choice = response.choices[0]
            message = choice.message

            if choice.finish_reason == "function_call" and message.function_call:
                fn_name = message.function_call.name
                try:
                    fn_args = json.loads(message.function_call.arguments)
                except Exception:
                    fn_args = {}

                logger.info(f"Agent iter {iteration}: call {fn_name}({fn_args})")
                
                result_json = self._execute_tool(fn_name, fn_args, docs, sources, question)
                context_accumulator += f"\n\n[Результат {fn_name}]:\n{result_json}"

                messages.append(message)
                messages.append(Messages(role=MessagesRole.FUNCTION, content=result_json, name=fn_name))
            else:
                break

        return context_accumulator, list(sources.values())

    # ============================================================
    # ОСНОВНОЙ ПОТОК
    # ============================================================
    async def ask_stream(self, question: str, user_id: int, role: str, docs: List[Dict] = None) -> AsyncIterator[dict]:
        docs = docs or []
        yield {"type": "status", "text": f"В базе {len(docs)} документов. Запускаю агента..."}

        context, sources = await asyncio.to_thread(self._run_agent, question, docs)

        yield {"type": "sources", "docs": sources}

        if not self.has_credentials():
            yield {"type": "chunk", "text": "ИИ временно недоступен."}
            return

        history = (self.db.get_user_history(user_id) or [])[-10:]
        now = datetime.now().strftime("%d.%m.%Y %H:%M")

        system = f"""Ты — виртуальный помощник «Лицей GPT». Создан Королём Дмитрием.
НИКОГДА не называй себя GigaChat. Ты — Лицей GPT.
Роль: {role}. Сейчас: {now}.

КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:
{context if context.strip() else 'База знаний пуста по этому запросу.'}

ПРАВИЛА:
1. Отвечай на основе КОНТЕКСТА выше. Если в контексте есть частичная информация — используй её.
2. Если контекст вообще не относится к вопросу — скажи: "В базе знаний нет точной информации об этом".
3. НЕ ВЫДУМЫВАЙ факты, которых нет в тексте.
4. Отвечай кратко, максимум 4 предложения. Используй списки, если это уместно."""

        msgs = [{"role": "system", "content": system}]
        msgs += [{"role": h["role"], "content": h["content"]} for h in history]
        msgs.append({"role": "user", "content": question})

        payload = Chat(messages=[
            Messages(role=ROLE_MAP.get(m["role"], MessagesRole.USER), content=m["content"])
            for m in msgs
        ])

        queue: "asyncio.Queue" = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def worker():
            try:
                with self._build_client() as client:
                    for chunk in client.stream(payload):
                        if not chunk.choices:
                            continue
                        text = getattr(getattr(chunk.choices[0], "delta", None), "content", None)
                        if text:
                            loop.call_soon_threadsafe(queue.put_nowait, ("chunk", text))
            except Exception as e:
                logger.exception("Stream error")
                loop.call_soon_threadsafe(queue.put_nowait, ("error", str(e)))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, ("done", None))

        threading.Thread(target=worker, daemon=True).start()

        full = ""
        while True:
            kind, item = await queue.get()
            if kind == "done":
                break
            if kind == "error":
                yield {"type": "chunk", "text": f"⚠️ {item}"}
                continue
            if kind == "chunk":
                full += item
                yield {"type": "chunk", "text": item}

        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": full, "sources": sources})
        self.db.set_user_history(user_id, history)