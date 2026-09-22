# 11 - Document Ingestion & Chunking Pipeline

- **Type**: `task`
- **Status**: `ready-for-agent`
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
  OR (scope_type = 'role' AND role_id IN (SELECT id FROM user_ancestor_roles))
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
      4. Batch embed via HuggingFace Inference API
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
- **Embedding Model:** `mxbai-embed-large-v1` (1024 dims) — context window 512 tokens.

#### A. Standard Docs (`.pdf`, `.docx`, `.txt`, `.md`):
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

- **Provider:** HuggingFace Inference API (`mxbai-embed-large-v1`) — free tier, no local RAM cost
- **Batch Size:** 16–32 chunks per API call

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

- If text extraction fails → `status='failed'`, error message in `description` field, no chunks inserted.
- If HuggingFace API errors mid-batch → retry up to 3 times with exponential backoff; if all retries fail → `status='failed'`, partial chunks rolled back.

### 8. Open Question Deferred to Stretch

- **Document Versioning:** What happens to existing chunks when an SOP is edited and re-uploaded? v1 decision: re-upload creates a new `documents` record; Admin must manually delete the old one. The old chunks remain until the old document is deleted (cascade delete on `document_id`).

---

## Context pointer (for map.md)

Resolves into implementation tasks: (a) Alembic migration adding `file_url`, `file_type`, `status`, `chunk_count` to `documents` and adding `org` to `scope_type` ENUM; (b) ingestion service module in FastAPI.
