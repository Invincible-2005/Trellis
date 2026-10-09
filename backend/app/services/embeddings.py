"""
Embeddings  (Ticket 12 D14)
===========================
The ONLY place that turns text into vectors. Ingestion (documents) and
search_documents (questions) both call this module, so they always use the
same model and dimension — a mismatch would make search silently return
unrelated chunks.

Model: gemini-embedding-001 via the Gemini API, outputDimensionality=1024
(must match Vector(1024) on document_chunks.embedding). Google's taskType
replaces mxbai's query prefix:
    documents → RETRIEVAL_DOCUMENT      questions → RETRIEVAL_QUERY
Cosine distance (`<=>`) doesn't need the vectors to be normalized.
"""

import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    """Expected failure. Its message is safe to show to an admin."""


_BATCH_SIZE = 32          # Gemini allows up to 100 texts per batch request
_MAX_ATTEMPTS = 3
_RETRYABLE_STATUS = {500, 502, 503, 504}
_RATE_LIMIT_DELAYS = (20, 40)  # 429 = per-minute free-tier limit; wait into the next minute


def _validate(vectors: object, expected_count: int) -> list[list[float]]:
    """Guards against wrong shapes before they reach pgvector."""
    if not isinstance(vectors, list) or len(vectors) != expected_count:
        raise EmbeddingError("Embedding service returned an unexpected response.")
    for vector in vectors:
        if (
            not isinstance(vector, list)
            or len(vector) != settings.EMBEDDING_DIM
            or not all(isinstance(x, (int, float)) for x in vector)
        ):
            raise EmbeddingError(
                f"Embedding service returned vectors that are not {settings.EMBEDDING_DIM}-dimensional."
            )
    return vectors


async def _embed_batch(client: httpx.AsyncClient, batch: list[str], task_type: str) -> list[list[float]]:
    """
    One batchEmbedContents call. Retries network errors and 5xx after 1 s / 2 s,
    and 429 (rate limit) after 20 s / 40 s.
    """
    url = settings.EMBEDDING_API_URL.format(model=settings.EMBEDDING_MODEL)
    body = {
        "requests": [
            {
                "model": f"models/{settings.EMBEDDING_MODEL}",
                "content": {"parts": [{"text": text}]},
                "taskType": task_type,
                "outputDimensionality": settings.EMBEDDING_DIM,
            }
            for text in batch
        ]
    }
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        delay = 2 ** (attempt - 1)
        try:
            response = await client.post(url, json=body)
        except httpx.TransportError as exc:
            if attempt == _MAX_ATTEMPTS:
                raise EmbeddingError("Embedding service is unreachable.") from exc
        else:
            if response.status_code == 200:
                embeddings = response.json().get("embeddings")
                vectors = [e.get("values") for e in embeddings] if isinstance(embeddings, list) else None
                return _validate(vectors, len(batch))
            retryable = response.status_code == 429 or response.status_code in _RETRYABLE_STATUS
            if not retryable or attempt == _MAX_ATTEMPTS:
                if response.status_code == 429:
                    raise EmbeddingError("Embedding service rate limit reached. Try again in a few minutes.")
                raise EmbeddingError(f"Embedding service failed (HTTP {response.status_code}).")
            if response.status_code == 429:
                delay = _RATE_LIMIT_DELAYS[attempt - 1]
        logger.warning("[embeddings] Batch attempt %d failed — retrying in %ds", attempt, delay)
        await asyncio.sleep(delay)
    raise AssertionError("unreachable")


async def _embed(texts: list[str], task_type: str) -> list[list[float]]:
    if not settings.GOOGLE_API_KEY:
        raise EmbeddingError("Embedding service is not configured (GOOGLE_API_KEY is missing).")
    vectors: list[list[float]] = []
    headers = {"x-goog-api-key": settings.GOOGLE_API_KEY}
    async with httpx.AsyncClient(timeout=60.0, headers=headers) as client:
        for i in range(0, len(texts), _BATCH_SIZE):
            vectors.extend(await _embed_batch(client, texts[i : i + _BATCH_SIZE], task_type))
    return vectors


async def embed_documents(texts: list[str]) -> list[list[float]]:
    """Vectors for document chunks (ingestion)."""
    return await _embed(texts, "RETRIEVAL_DOCUMENT")


async def embed_query(text: str) -> list[float]:
    """Vector for a user's question (search_documents)."""
    return (await _embed([text], "RETRIEVAL_QUERY"))[0]
