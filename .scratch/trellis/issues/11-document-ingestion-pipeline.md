# 11 - Document Ingestion & Chunking Pipeline

- **Type**: `task`
- **Status**: `resolved` (design locked; implementation in progress — `backend/app/services/ingestion.py`)
- **Assignee**: Agentic Lead & Backend Dev
- **Blocked by**: 02, 05

## Question

How does an uploaded policy/SOP document get processed, chunked, embedded, and stored in pgvector so the `search_documents` tool can retrieve authorized chunks?

---

## Answer

### 1. Document Placement & Scope Types (Schema Addition)

Three upload contexts exist in the Admin Console:

| Context | Intended visibility | scope_type |
|---|---|---|
| Org-wide document | All members of the org | `org` (new) |
| Role-attached document | That role + all ancestor roles | `role` |
| Team-attached document | Team members + all roles above team | `team` |

**Schema change required:** Add `org` to the `scope_type` ENUM on both `documents` and `document_chunks` tables.

Updated SQL vector search WHERE clause:
```sql
AND (
  (scope_type = 'org'  AND org_id = :org_id)
  OR (scope_type = 'role' AND role_id IN (SELECT id FROM visible_roles))  -- user's roles + descendants (ticket 02 CTE)
  OR (scope_type = 'team' AND team_id = ANY(:allowed_team_ids))
)
```

### 2. Document Metadata Fields (Updated Schema)

```python
class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID]
    org_id: Mapped[uuid.UUID]
    title: Mapped[str]
    description: Mapped[Optional[str]]
    file_url: Mapped[str]                        # UploadThing CDN URL — required
    file_type: Mapped[str]                       # ENUM: 'pdf','docx','pptx','txt','md'
    scope_type: Mapped[str]                      # ENUM: 'org','role','team'
    role_id: Mapped[Optional[uuid.UUID]]
    team_id: Mapped[Optional[uuid.UUID]]
    uploaded_by_user_id: Mapped[uuid.UUID]
    status: Mapped[str]                          # ENUM: 'processing','ready','failed'
    chunk_count: Mapped[Optional[int]]           # populated after ingestion completes
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

### 3. Async Ingestion Flow

```
Admin uploads file in UI
  → UploadThing handles browser upload → returns file_url + file_type
  → Frontend: POST /api/v1/documents { title, description, file_url, file_type,
                                        scope_type, role_id?, team_id? }
  → FastAPI: INSERT documents row (status='processing') → return 202 Accepted
  → FastAPI BackgroundTask:
      1. Fetch raw file bytes from file_url
      2. Extract text (file_type-aware extractor)
      3. Chunk with RecursiveCharacterTextSplitter
      4. Batch embed via Gemini `batchEmbedContents` (ticket 12 D14; was HuggingFace)
      5. Bulk INSERT document_chunks (with denormalized scope fields)
      6. UPDATE documents SET status='ready', chunk_count=N
  → Frontend polls GET /api/v1/documents/{id} for status
```

FastAPI never handles raw file bytes during the HTTP request — only in the background task.

### 4. Supported File Types & Text Extractors

| Extension | Library | Notes |
|---|---|---|
| `.txt` | Native Python `str` | No library needed |
| `.md` | Native Python `str` | Strip markdown syntax if needed |
| `.pdf` | `pymupdf` (`fitz`) | Fast, handles multi-column layouts |
| `.docx` | `python-docx` | Extracts paragraphs and tables |
| `.pptx` | `python-pptx` | Extracts text from slide text frames + speaker notes; images/charts not extracted |

For `.pptx`: text is extracted per-slide with slide number prepended as context: `"[Slide 3] Attendance Policy: ..."`.

### 5. Chunking Strategy

- **Library:** `langchain_text_splitters.RecursiveCharacterTextSplitter`
- **Embedding Model:** ~~`mxbai-embed-large-v1` (1024 dims) — context window 512 tokens.~~ **`gemini-embedding-001` at 1024 dims (ticket 12 D14, 2026-10-09)** — 2,048-token input, so the 1000-char chunks fit easily.

#### A. Standard Docs (`.pdf`, `.docx`, `.txt`, `.md`):

> **Planned change (ticket 12 D58, decided 2026-10-16, not built yet):** cut at headings instead of every
> 1,000 characters. Headings: Markdown `#` lines, Word "Heading" styles (kept as `## ` markers when the
> text is extracted; today they are dropped), numbered lines like "1. Passwords and sign-in" in PDF and
> txt. A section under ~200 characters is joined to its neighbour; a section over 1,000 is cut with the
> recursive splitter below; every piece starts with "Document title > Section". No headings found →
> the splitter below as today. Slides (B) unchanged. Search returns 4 pieces instead of 6.
> Reason: evaluation 2026-10-16 (`backend/evaluation/results/`).
> The 1,000 / 200 rule below is superseded for documents with headings once D58 is built.

- **Chunk Size:** 1000 characters
- **Chunk Overlap:** 200 characters

```python
standard_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", ".", " ", ""]
)
chunks = standard_splitter.split_text(extracted_text)
```

#### B. Presentations (`.pptx`):
- **Chunk Size:** 500 characters
- **Chunk Overlap:** 100 characters
- **Why still use `RecursiveCharacterTextSplitter`?** Yes! It is still the best tool because it respects paragraph/bullet-point separators (`\n\n`, `\n`) while guaranteeing that text-heavy slides are split cleanly at sentence boundaries without cutting bullet points in half.

```python
pptx_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=100,
    separators=["\n\n", "\n", " • ", ". ", " ", ""]
)
chunks = pptx_splitter.split_text(slide_text_with_header)
```

### 6. Embedding & Denormalized Batch Insert

- **Provider (2026-10-09, D14):** Gemini API via `app/services/embeddings.py` (`embed_documents` for chunks with `taskType=RETRIEVAL_DOCUMENT`, `embed_query` for questions with `RETRIEVAL_QUERY`), authenticated with `GOOGLE_API_KEY`. Retries: network/5xx after 1 s / 2 s, 429 after 20 s / 40 s. Live-verified 2026-10-09: 1024-dim vectors. *Superseded:* HuggingFace Inference API (`mxbai-embed-large-v1`), no local RAM cost. Called directly with `httpx` at `settings.EMBEDDING_API_URL` (the router endpoint). The deprecated LangChain `HuggingFaceInferenceAPIEmbeddings` was dropped 2026-10-08.
  - ✅ Resolved by D14 (Gemini). ⚠️ **Not actually free (found 2026-10-08):** HF Inference Providers bill against small monthly credits, and the team's token already returns `402 "You have no remaining credits"`. **Decision needed: ticket 12 D14.**
- **Batch Size:** 32 chunks per API call. Every vector is validated to be `EMBEDDING_DIM` (1024) long.

```python
# document_chunks insert with denormalized scope (no JOIN needed at query time)
for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
    db.add(DocumentChunk(
        document_id=document.id,
        content=chunk_text,
        embedding=embedding,           # list[float], len=1024
        chunk_index=i,
        org_id=document.org_id,        # denormalized
        scope_type=document.scope_type, # denormalized
        role_id=document.role_id,      # denormalized (None if team/org scoped)
        team_id=document.team_id,      # denormalized (None if role/org scoped)
    ))
```

### 7. Failure Handling

- If text extraction fails → `status='failed'`, the reason goes in **`documents.error_message`** (not `description`), and no chunks are inserted.
- If the embedding API (Gemini since D14) errors mid-batch → retry up to 3 times with exponential backoff; if all retries fail → `status='failed'`, partial chunks rolled back.

#### 7a. Implementation (hardened 2026-10-08, `backend/app/services/ingestion.py`)

The earlier drift is resolved. How it works now:
- **Own session:** `run_ingestion(document_id)` opens its own `async_session()`. Call it as `background_tasks.add_task(run_ingestion, doc.id)` and never pass the request's session.
- **Atomic:** existing chunks are deleted (re-runs are idempotent), new chunks are inserted, and `status='ready'` + `chunk_count` are set, all in **one commit**. A failed document never leaves searchable chunks.
- **Failures:** the pipeline rolls back, then runs an explicit `UPDATE … status='failed', error_message=…`. `IngestionError` messages are admin-safe; unexpected errors store a generic message and log the traceback.
- **SSRF guard:**
  - `is_allowed_file_url()` accepts https only, on hosts in `INGESTION_ALLOWED_HOSTS` (default `utfs.io`, `*.ufs.sh`), with no port. **`POST /api/v1/documents` must also call it** before creating the row.
  - Downloads are streamed with redirects refused and capped at `INGESTION_MAX_FILE_BYTES` (25 MB).
- **Non-blocking:** text extraction runs in `asyncio.to_thread`.
- **Embedding:** direct `httpx` calls; retries on 429/5xx and network errors (3 attempts, 1 s/2 s backoff); vector shape and dimension are validated.
- **Extractors:** PPTX now reads tables, grouped shapes and notes (without creating empty notes slides); PDFs are opened with a context manager.
- **Startup sweep:** the `lifespan` in `main.py` calls `fail_stale_ingestions()`, which marks `processing` documents older than 15 minutes as failed (assumes a single instance, ticket 12 D11).
- **Search indexes** (2026-10-09): migration `a7c2e9f4b310` adds the HNSW index (`vector_cosine_ops`) and the chunk scope indexes from ticket 02, declared in the models too.
- **Migration** `c3f1a9d27e54` adds `documents.error_message`. ⚠️ **Run `alembic upgrade head` before ingestion runs.** The ORM selects this column.
- **Query side (ticket 09/10):** the agent's `search_documents` calls `search_chunks(db, scope, question)` in `app/services/documents.py` (built 2026-10-09). It embeds with `embed_query()` (D14), applies the shared visibility rule, and uses pgvector iterative scan so filtered searches still return results. *Superseded:* mxbai expects queries prefixed with `"Represent this sentence for searching relevant passages: "`. Documents are embedded without a prefix.
- **Verified offline:** URL guard, size cap, redirect and 404 handling, DOCX/PPTX/PDF/TXT extraction, chunk sizes, vector validation.
- ~~**Not verified live:** the embedding output dimension, because of the HF 402 (D14).~~ Verified 2026-10-09 with Gemini: 1024 dims.

## 8. Open Question Deferred to Stretch

- **Document Versioning:** What happens to existing chunks when an SOP is edited and re-uploaded? v1 decision: re-upload creates a new `documents` record; Admin must manually delete the old one. The old chunks remain until the old document is deleted (cascade delete on `document_id`).

---

## Context pointer (for map.md)

Resolves into implementation tasks: (a) Alembic migration adding `file_url`, `file_type`, `status`, `chunk_count` to `documents` and adding `org` to `scope_type` ENUM; (b) ingestion service module in FastAPI.

## Deleting a document (2026-10-11, ticket 12 D40)

Delete removes the `documents` row, its chunks (FK `ON DELETE CASCADE`) and the file in UploadThing (`frontend/lib/api/actions/documents.ts::deleteDocument`). Registering a `file_url` that another document already uses is refused (409 `file_already_registered`), so a delete can never remove someone else's file. A delete during `processing` is safe: the ingestion job's chunk insert fails on the missing document and nothing is kept.
