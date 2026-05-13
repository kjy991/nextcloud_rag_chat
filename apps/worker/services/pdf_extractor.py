import io
import re
from dataclasses import dataclass

import pdfplumber


@dataclass
class Chunk:
    page_no: int
    paragraph_no: int
    text: str
    bbox: list[float] | None  # [x0, y0, x1, y1]


def extract_chunks(pdf_bytes: bytes, max_chars: int = 800) -> list[Chunk]:
    chunks: list[Chunk] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_no = page_idx + 1
            raw_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""

            paragraphs = _split_paragraphs(raw_text)
            para_idx = 0

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                # Long paragraphs get split into sub-chunks
                sub_chunks = _split_long_text(para, max_chars)
                for sub in sub_chunks:
                    para_idx += 1
                    chunks.append(
                        Chunk(
                            page_no=page_no,
                            paragraph_no=para_idx,
                            text=sub,
                            bbox=None,  # bbox per-paragraph needs word-level extraction
                        )
                    )

    return chunks


def _split_paragraphs(text: str) -> list[str]:
    # Split on two+ newlines or single newline followed by indent/bullet
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
