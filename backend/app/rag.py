import re
from typing import List


DATE_PATTERNS = [
    r"\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b",
    r"\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b",
]
TIME_PATTERN = r"\b[0-2]?\d[:.][0-5]\d\b"


def extract_meta(text: str) -> dict:
    return {
        "dates": list({d for p in DATE_PATTERNS for d in re.findall(p, text, re.I)}),
        "times": list(set(re.findall(TIME_PATTERN, text))),
        "tags": ["olympiad"] if re.search(r"олимп\w*", text, re.I) else [],
        "size": len(text),
    }


def ingest_text(
    db,
    assistant,
    title: str,
    content: str = None,
    file_path: str = None,
    owner_id: int = None,
) -> List[int]:
    """Сохраняет документ ЕДИНЫМ куском. Никакого чанкинга."""
    if file_path:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    if not content or not content.strip():
        raise ValueError("Пустой документ")

    meta = extract_meta(content)
    doc_id = db.add_doc(title, content, embedding=None, meta=meta, owner_id=owner_id)
    return [doc_id]