import os
import httpx

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

# nomic-embed-text outputs 768-dim vectors
EMBED_DIM = 768


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch embed texts using Ollama. Returns list of embedding vectors."""
    embeddings: list[list[float]] = []

    # Ollama /api/embed accepts a list of inputs
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data["embeddings"]

    return embeddings


def embed_single(text: str) -> list[float]:
    return embed_texts([text])[0]
