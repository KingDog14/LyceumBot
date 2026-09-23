# Copyright (c) 2026 Король Дмитрий. All rights reserved.
# Проект «Лицей GPT». Автор — Король Дмитрий.

import sqlite3
import json
import os
import secrets
from typing import Optional, List, Dict

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(12))


def format_code(code: str) -> str:
    return f"{code[:4]}-{code[4:8]}-{code[8:12]}"


class DB:
    def __init__(self, path: str):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init()
        self._migrate()

    def _init(self):
        c = self.conn.cursor()
        c.execute("""CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            access_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'student',
            history TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS docs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            embedding TEXT,
            meta TEXT,
            owner_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")
        self.conn.commit()

    def _migrate(self):
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(users)").fetchall()}
        if "email" in cols and "access_code" not in cols:
            self.conn.execute("DROP TABLE users")
            self.conn.execute("""CREATE TABLE users(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                access_code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'student',
                history TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )""")

        doc_cols = {r[1] for r in self.conn.execute("PRAGMA table_info(docs)").fetchall()}
        if "owner_id" not in doc_cols:
            self.conn.execute("ALTER TABLE docs ADD COLUMN owner_id INTEGER")

        self.conn.commit()

    def create_user(self, access_code: str, name: str, role: str = "student") -> int:
        c = self.conn.cursor()
        c.execute(
            "INSERT INTO users(access_code, name, role) VALUES(?,?,?)",
            (access_code, name, role),
        )
        self.conn.commit()
        return c.lastrowid

    def get_user_by_id(self, uid: int) -> Optional[Dict]:
        cur = self.conn.execute("SELECT * FROM users WHERE id=?", (uid,))
        r = cur.fetchone()
        return dict(r) if r else None

    def get_user_by_code(self, code: str) -> Optional[Dict]:
        cur = self.conn.execute("SELECT * FROM users WHERE access_code=?", (code,))
        r = cur.fetchone()
        return dict(r) if r else None

    def set_role(self, uid: int, role: str):
        self.conn.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
        self.conn.commit()

    def generate_unique_code(self, reserved: set) -> str:
        for _ in range(200):
            code = generate_code()
            if code in reserved:
                continue
            if self.get_user_by_code(code):
                continue
            return code
        raise RuntimeError("Не удалось сгенерировать уникальный код")

    def list_users(self) -> List[Dict]:
        cur = self.conn.execute(
            "SELECT id, access_code, name, role, created_at FROM users ORDER BY id"
        )
        return [dict(r) for r in cur.fetchall()]

    def set_user_history(self, uid: int, history: List[Dict]):
        self.conn.execute(
            "UPDATE users SET history=? WHERE id=?",
            (json.dumps(history, ensure_ascii=False), uid),
        )
        self.conn.commit()

    def get_user_history(self, uid: int) -> List[Dict]:
        u = self.get_user_by_id(uid)
        if not u:
            return []
        try:
            return json.loads(u["history"] or "[]")
        except Exception:
            return []

    def add_doc(self, title, content, embedding=None, meta=None, owner_id=None) -> int:
        c = self.conn.cursor()
        c.execute(
            "INSERT INTO docs(title, content, embedding, meta, owner_id) VALUES(?,?,?,?,?)",
            (
                title,
                content,
                json.dumps(embedding) if embedding is not None else None,
                json.dumps(meta or {}, ensure_ascii=False),
                owner_id,
            ),
        )
        self.conn.commit()
        return c.lastrowid

    def list_docs(self) -> List[Dict]:
        cur = self.conn.execute("SELECT * FROM docs")
        out = []
        for r in cur.fetchall():
            d = dict(r)
            d["embedding"] = json.loads(d["embedding"]) if d["embedding"] else None
            d["meta"] = json.loads(d["meta"]) if d["meta"] else {}
            out.append(d)
        return out

    def list_docs_for(self, user: Dict) -> List[Dict]:
        all_docs = self.list_docs()
        if user["role"] == "admin":
            return all_docs
        uid = user["id"]
        return [d for d in all_docs if d.get("owner_id") == uid]

    def list_docs_for_rag(self, user: Dict) -> List[Dict]:
        all_docs = self.list_docs()
        if user["role"] == "admin":
            return all_docs
        uid = user["id"]
        return [
            d for d in all_docs
            if d.get("owner_id") is None or d.get("owner_id") == uid
        ]

    def get_doc(self, doc_id: int) -> Optional[Dict]:
        cur = self.conn.execute("SELECT * FROM docs WHERE id=?", (doc_id,))
        r = cur.fetchone()
        return dict(r) if r else None

    def delete_doc(self, doc_id: int):
        self.conn.execute("DELETE FROM docs WHERE id=?", (doc_id,))
        self.conn.commit()