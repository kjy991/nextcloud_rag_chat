import io
import re
from dataclasses import dataclass
from typing import Any

import pdfplumber


@dataclass
class Chunk:
    page_no: int
    paragraph_no: int
    text: str
    bbox: list[float] | None  # [x0, y0, x1, y1]


def extract_chunks(pdf_bytes: bytes, max_chars: int = 800) -> list[Chunk]:
    # Try pdfplumber first; fall back to PyMuPDF for CJK/garbled fonts
    if _pdfplumber_usable(pdf_bytes):
        chunks = _extract_with_pdfplumber(pdf_bytes, max_chars)
    else:
        chunks = _extract_with_pymupdf(pdf_bytes, max_chars)
    # Strip NUL bytes — PostgreSQL rejects string literals containing \x00
    for c in chunks:
        c.text = c.text.replace('\x00', '')
    return [c for c in chunks if c.text]


def _validate_bbox(
    bbox: list[float] | None,
    page_width: float,
    page_height: float,
) -> list[float] | None:
    """bbox가 유효한지 검증하고 페이지 경계 내로 클램핑한다.

    좌표 규약: [x0, y_top, x1, y_bottom] — 모두 페이지 좌상단 기준 포인트 단위.
    pdfplumber(top/bottom)과 PyMuPDF(y0/y1) 모두 이 규약을 따른다.
    """
    if bbox is None:
        return None
    if len(bbox) != 4:
        return None

    x0, y0, x1, y1 = bbox

    # 좌표 부호 및 대소 관계 검증
    if x0 >= x1 or y0 >= y1:
        return None

    # 페이지 경계 내로 클램핑
    x0 = max(0.0, min(x0, page_width))
    y0 = max(0.0, min(y0, page_height))
    x1 = max(0.0, min(x1, page_width))
    y1 = max(0.0, min(y1, page_height))

    # 클램핑 후에도 유효한지 재확인
    if x0 >= x1 or y0 >= y1:
        return None

    return [x0, y0, x1, y1]


def _pdfplumber_usable(pdf_bytes: bytes) -> bool:
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            total = "".join(
                page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                for page in pdf.pages[:3]  # sample first 3 pages
            )
        if not total.strip():
            return False
        # garbled if >5% replacement characters
        return total.count("�") <= len(total) * 0.05
    except Exception:
        return False


def _extract_with_pdfplumber(pdf_bytes: bytes, max_chars: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_no = page_idx + 1
            page_width = float(page.width)
            page_height = float(page.height)
            raw_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            words = page.extract_words(x_tolerance=3, y_tolerance=3) or []
            word_cursor = 0
            paragraphs = _merge_short_paragraphs(_split_paragraphs(raw_text))
            para_idx = 0
            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue
                for sub in _split_long_text(para, max_chars):
                    para_idx += 1
                    raw_bbox, word_cursor = find_text_bbox(sub, words, word_cursor)
                    bbox = _validate_bbox(raw_bbox, page_width, page_height)
                    chunks.append(Chunk(page_no=page_no, paragraph_no=para_idx, text=sub, bbox=bbox))
    return chunks


def _extract_with_pymupdf(pdf_bytes: bytes, max_chars: int) -> list[Chunk]:
    import fitz  # pymupdf

    chunks: list[Chunk] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_no = page_idx + 1
            page_rect = page.rect
            page_width = float(page_rect.width)
            page_height = float(page_rect.height)
            para_idx = 0
            # get_text("blocks") returns (x0,y0,x1,y1,text,block_no,block_type)
            # y0/y1 은 페이지 상단 기준 — pdfplumber의 top/bottom 규약과 동일
            for block in page.get_text("blocks"):
                text = block[4].strip().replace("\n", " ")
                if not text:
                    continue
                raw_bbox = [block[0], block[1], block[2], block[3]]
                subs = _split_long_text(text, max_chars)
                for i, sub in enumerate(subs):
                    para_idx += 1
                    # bbox 는 블록 전체를 가리키므로 텍스트가 분할된 경우
                    # 각 서브청크에 동일 bbox를 할당하면 위치가 부정확하다.
                    # 분할이 없는 경우에만 검증된 bbox를 사용한다.
                    if len(subs) == 1:
                        bbox = _validate_bbox(raw_bbox, page_width, page_height)
                    else:
                        bbox = None
                    chunks.append(Chunk(page_no=page_no, paragraph_no=para_idx, text=sub, bbox=bbox))
    finally:
        doc.close()
    return chunks


def _merge_short_paragraphs(paragraphs: list[str], min_chars: int = 200) -> list[str]:
    """Combine consecutive short paragraphs so isolated fact bullets keep enough context for good embeddings."""
    merged: list[str] = []
    bucket = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        bucket = (bucket + " " + para).strip() if bucket else para
        if len(bucket) >= min_chars:
            merged.append(bucket)
            bucket = ""
    if bucket:
        merged.append(bucket)
    return merged


def _split_paragraphs(text: str) -> list[str]:
    paras = re.split(r"\n{2,}|\n(?=\s{2,}|\t|[•\-\*])", text)
    return [p.replace("\n", " ").strip() for p in paras if p.strip()]


def _split_long_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    parts: list[str] = []
    sentences = re.split(r"(?<=[.!?。])\s+", text)
    current = ""

    for sent in sentences:
        if len(current) + len(sent) + 1 <= max_chars:
            current = f"{current} {sent}".strip()
        else:
            if current:
                parts.append(current)
            current = sent

    if current:
        parts.append(current)

    return parts or [text]


def find_text_bbox(
    text: str,
    words: list[dict[str, Any]],
    start_index: int = 0,
) -> tuple[list[float] | None, int]:
    target = [_normalize_token(part) for part in text.split()]
    target = [part for part in target if part]
    if not target:
        return None, start_index

    normalized_words = [_normalize_token(str(word.get("text", ""))) for word in words]

    for index in range(start_index, len(words)):
        if normalized_words[index] != target[0]:
            continue

        cursor = index
        matched: list[dict[str, Any]] = []
        for token in target:
            while cursor < len(words) and not normalized_words[cursor]:
                cursor += 1
            if cursor >= len(words) or normalized_words[cursor] != token:
                break
            matched.append(words[cursor])
            cursor += 1
        else:
            return _bbox_from_words(matched), cursor

    return None, start_index


def _normalize_token(value: str) -> str:
    return re.sub(r"\W+", "", value, flags=re.UNICODE).casefold()


def _bbox_from_words(words: list[dict[str, Any]]) -> list[float]:
    return [
        min(float(word["x0"]) for word in words),
        min(float(word["top"]) for word in words),
        max(float(word["x1"]) for word in words),
        max(float(word["bottom"]) for word in words),
    ]
