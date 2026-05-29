"""PDF Processing Worker — polls PostgreSQL for PENDING documents every N seconds."""
import logging
import os
import time

import httpx
import psycopg2
import psycopg2.extras

from services.embedder import embed_texts
from services.credentials import decrypt_app_password
from services.pdf_extractor import extract_chunks
from services.vector_store import delete_document_chunks, ensure_collection, upsert_chunks

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
NC_BASE_URL = os.environ.get("NEXTCLOUD_BASE_URL", "http://localhost:8080")
NC_ADMIN = os.environ.get("NEXTCLOUD_ADMIN_USER", "admin")
NC_PASS = os.environ.get("NEXTCLOUD_ADMIN_PASSWORD", "admin_password")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "30"))


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_pending(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.id, d.tenant_id, d.owner_user_id, d.nc_path, d.file_name, d.file_size,
                   u.nc_user_id, u.nc_app_password
            FROM documents d
            JOIN users u ON u.id = d.owner_user_id
            WHERE d.index_status = 'PENDING'
            ORDER BY d.created_at
            LIMIT 5
            """
        )
        return cur.fetchall()


_ALLOWED_UPDATE_FIELDS = {"index_status", "page_count", "chunk_count", "indexed_at"}


def set_status(conn, doc_id: str, status: str, **kwargs) -> None:
    unknown = set(kwargs) - _ALLOWED_UPDATE_FIELDS
    if unknown:
        raise ValueError(f"허용되지 않은 컬럼: {unknown}")

    fields = {"index_status": status}
    fields.update(kwargs)
    if status == "COMPLETED":
        fields["indexed_at"] = "NOW()"

    set_clause = ", ".join(
        f"{k} = %s" if k != "indexed_at" else f"{k} = NOW()" for k in fields
    )
    values = [v for k, v in fields.items() if k != "indexed_at"]
    values.append(doc_id)

    with conn.cursor() as cur:
        cur.execute(f"UPDATE documents SET {set_clause} WHERE id = %s", values)
    conn.commit()


STUCK_PROCESSING_TIMEOUT = int(os.environ.get("STUCK_PROCESSING_TIMEOUT_MINUTES", "5"))
STUCK_PENDING_TIMEOUT = int(os.environ.get("STUCK_PENDING_TIMEOUT_MINUTES", "3"))


def expire_stuck_documents(
    conn,
    processing_timeout_minutes: int = STUCK_PROCESSING_TIMEOUT,
    pending_timeout_minutes: int = STUCK_PENDING_TIMEOUT,
) -> int:
    """PROCESSING/PENDING 상태로 너무 오래 머문 문서를 FAILED로 전환한다."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documents
            SET index_status = 'FAILED', updated_at = NOW()
            WHERE (
                (index_status = 'PROCESSING' AND updated_at < NOW() - (%s * INTERVAL '1 minute'))
                OR
                (index_status = 'PENDING'    AND updated_at < NOW() - (%s * INTERVAL '1 minute'))
            )
            """,
            (processing_timeout_minutes, pending_timeout_minutes),
        )
        count = cur.rowcount
    conn.commit()
    if count:
        log.warning("타임아웃 문서 %d개를 FAILED로 전환했습니다 (PROCESSING >%dm / PENDING >%dm)",
                    count, processing_timeout_minutes, pending_timeout_minutes)
    return count


def download_file(nc_path: str, nc_user_id: str, nc_password: str) -> bytes:
    url = f"{NC_BASE_URL}/remote.php/dav/files/{nc_user_id}{nc_path}"
    with httpx.Client(auth=(nc_user_id, nc_password), timeout=120.0) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.content


def save_chunks_to_db(conn, doc_id: str, tenant_id: str, chunks_data: list[dict]) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM document_chunks WHERE document_id = %s", (doc_id,))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO document_chunks
              (id, document_id, tenant_id, page_no, paragraph_no, chunk_text, bbox_json, embedding_id)
            VALUES %s
            """,
            [
                (
                    c["chunk_id"],
                    doc_id,
                    tenant_id,
                    c["page_no"],
                    c["paragraph_no"],
                    c["text"],
                    psycopg2.extras.Json(c["bbox"]) if c["bbox"] else None,
                    c["chunk_id"],
                )
                for c in chunks_data
            ],
        )
    conn.commit()


def process_document(conn, doc: dict) -> None:
    doc_id = doc["id"]
    tenant_id = doc["tenant_id"]
    nc_path = doc["nc_path"]
    file_name = doc["file_name"]
    nc_user_id = doc["nc_user_id"]
    nc_password = doc["nc_app_password"]

    if not nc_password:
        log.error("  No NC App Password for document %s — user must re-login", doc_id)
        set_status(conn, doc_id, "FAILED")
        return

    log.info("Processing document %s (%s)", doc_id, file_name)
    set_status(conn, doc_id, "PROCESSING")

    try:
        nc_password = decrypt_app_password(nc_password)
        pdf_bytes = download_file(nc_path, nc_user_id, nc_password)
        log.info("  Downloaded %d bytes", len(pdf_bytes))

        raw_chunks = extract_chunks(pdf_bytes)
        log.info("  Extracted %d chunks across %d pages",
                 len(raw_chunks), max((c.page_no for c in raw_chunks), default=0))

        texts = [c.text for c in raw_chunks]
        embeddings = embed_texts(texts)
        log.info("  Generated %d embeddings", len(embeddings))

        chunks_data = [
            {
                "chunk_id": f"{doc_id}_p{c.page_no}_para{c.paragraph_no}",
                "page_no": c.page_no,
                "paragraph_no": c.paragraph_no,
                "text": c.text,
                "bbox": c.bbox,
                "embedding": emb,
            }
            for c, emb in zip(raw_chunks, embeddings)
        ]

        # Ensure collection exists first, then remove old vectors
        ensure_collection()
        delete_document_chunks(tenant_id, doc_id)
        upsert_chunks(
            tenant_id=tenant_id,
            document_id=doc_id,
            file_name=file_name,
            nc_path=nc_path,
            chunks=chunks_data,
        )
        log.info("  Stored in Qdrant")

        page_count = max((c.page_no for c in raw_chunks), default=0)
        save_chunks_to_db(conn, doc_id, tenant_id, chunks_data)

        set_status(
            conn, doc_id, "COMPLETED",
            page_count=page_count,
            chunk_count=len(chunks_data),
        )
        log.info("  Completed: %d pages, %d chunks", page_count, len(chunks_data))

    except Exception as exc:
        log.exception("  Failed to process document %s: %s", doc_id, exc)
        set_status(conn, doc_id, "FAILED")


def main() -> None:
    log.info("Worker started. Poll interval: %ds", POLL_INTERVAL)

    while True:
        try:
            conn = get_db()
            try:
                expire_stuck_documents(conn)
                docs = fetch_pending(conn)
                if docs:
                    log.info("Found %d PENDING document(s)", len(docs))
                    for doc in docs:
                        process_document(conn, doc)
                else:
                    log.debug("No pending documents")
            finally:
                conn.close()
        except Exception as exc:
            log.error("DB connection error: %s", exc)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
