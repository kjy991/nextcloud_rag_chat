import os
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
)

from .embedder import EMBED_DIM

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.environ.get("QDRANT_COLLECTION", "documents")

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL)
    return _client


def ensure_collection() -> None:
    client = get_client()
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )


def upsert_chunks(
    *,
    tenant_id: str,
    document_id: str,
    file_name: str,
    nc_path: str,
    chunks: list[dict],  # {chunk_id, page_no, paragraph_no, text, bbox, embedding}
) -> None:
    client = get_client()
    points = [
        PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_DNS, c["chunk_id"])),
            vector=c["embedding"],
            payload={
                "tenantId": tenant_id,
                "documentId": document_id,
                "chunkId": c["chunk_id"],
                "fileName": file_name,
                "ncPath": nc_path,
                "pageNo": c["page_no"],
                "paragraphNo": c["paragraph_no"],
                "text": c["text"],
                "bbox": c["bbox"],
            },
        )
        for c in chunks
    ]
    client.upsert(collection_name=COLLECTION, points=points)


def delete_document_chunks(tenant_id: str, document_id: str) -> None:
    client = get_client()
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[
                FieldCondition(key="tenantId", match=MatchValue(value=tenant_id)),
                FieldCondition(key="documentId", match=MatchValue(value=document_id)),
            ]
        ),
    )
