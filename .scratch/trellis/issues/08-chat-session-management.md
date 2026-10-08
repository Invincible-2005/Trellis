# 08 - Chat Session Management & SQLite Checkpointer

- **Type**: `task`
- **Status**: `resolved`
- **Assignee**: Agentic Lead
- **Blocked by**: 04

## Question

How should chat sessions be stored, named, listed, and retrieved per user, and how does the SQLite checkpointer integrate with the FastAPI session lifecycle?

---

## Answer

### 1. Session Metadata Schema (NeonDB — Postgres)

Session metadata lives in a dedicated `chat_sessions` table in NeonDB alongside the rest of the app data. The LangGraph checkpointer blob (message history, agent state) lives separately in `checkpoints.db` (SQLite), keyed by `thread_id`. These are two distinct stores — user-facing metadata in Postgres, agent state in SQLite.

```python
class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (UniqueConstraint("org_id", "user_id", "id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # None until first message
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**Required index:**
```sql
CREATE INDEX idx_chat_sessions_user_org ON chat_sessions (user_id, org_id, last_active_at DESC);
```

---

### 2. thread_id Composite Key — Org-Level Isolation Invariant

```python
thread_id = f"{org_id}:{user_id}:{session_id}"
```

This composite key is injected into every LangGraph invocation:
```python
config = {"configurable": {"thread_id": thread_id}}
await graph.ainvoke(state, config=config)
```

Even if two users share the same `session_id` UUID (astronomically unlikely), the `org_id` prefix guarantees absolute cross-org isolation. A user can never accidentally load another user's or another org's conversation.

---

### 3. Session Naming — Auto-Title from First Message (Editable)

- **On session creation:** `title = None`. The session exists but has no name.
- **On first message:** FastAPI extracts the first 60 characters of the user's query and writes it as the session title:
  ```python
  if session.title is None and len(user_message) > 0:
      session.title = user_message[:60].strip()
  ```
- **User can rename anytime** via `PATCH /api/v1/chat/sessions/{session_id}` — sends a new `{ "title": "..." }` payload.

---

### 4. API Endpoints (Session CRUD)

All endpoints are scoped strictly to the authenticated user's `user_id` + `org_id` from the Clerk JWT. Users can only ever see and manage their own sessions.

| Method | Endpoint | Action |
|---|---|---|
| `POST` | `/api/v1/chat/sessions` | Create a new empty session, return `session_id` |
| `GET` | `/api/v1/chat/sessions` | List sessions for this user in this org (ordered by `last_active_at DESC`) |
| `PATCH` | `/api/v1/chat/sessions/{session_id}` | Rename session (update `title`) |
| `DELETE` | `/api/v1/chat/sessions/{session_id}` | Hard delete — NeonDB row + SQLite checkpoint blob |
| `POST` | `/api/v1/chat/sessions/{session_id}/message` | Send a message → invokes LangGraph graph, responds with **SSE stream** (`text/event-stream`). **The single chat endpoint** (ticket 12 D2) |

---

### 5. Hard Delete Behaviour

Deleting a session removes both stores:

```python
async def delete_session(session_id: uuid.UUID, user: ScopedUser, db: AsyncSession):
    # 1. Verify ownership
    session = await db.get(ChatSession, session_id)
    if not session or session.user_id != user.id or session.org_id != user.org_id:
        raise HTTPException(404)

    # 2. Purge LangGraph checkpoint blob from SQLite
    thread_id = f"{user.org_id}:{user.id}:{session_id}"
    async with aiosqlite.connect("checkpoints.db") as conn:
        await conn.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
        await conn.execute("DELETE FROM checkpoint_blobs WHERE thread_id = ?", (thread_id,))
        await conn.execute("DELETE FROM checkpoint_writes WHERE thread_id = ?", (thread_id,))
        await conn.commit()

    # 3. Delete metadata row from NeonDB
    await db.delete(session)
    await db.commit()
```

No soft delete. Once gone, the full conversation is purged.

> ⚠️ **Audit note (2026-10-08):** `checkpoint_blobs` / `checkpoint_writes` are *Postgres*-saver table names;
> the SQLite saver uses different tables. Prefer the checkpointer's own thread-delete method
> (verify exact name in the installed `langgraph` version, e.g. `adelete_thread(thread_id)`) so the
> same code works for SQLite and Postgres and the "one-line swap" stays true.

---

### 6. FastAPI Lifespan — Checkpointer Lifecycle

The SQLite checkpointer is opened once at FastAPI startup and stored on `app.state`. All requests access it via `request.app.state.checkpointer`. It closes cleanly on shutdown.

```python
from contextlib import asynccontextmanager
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSqliteSaver.from_conn_string("checkpoints.db") as saver:
        app.state.checkpointer = saver
        yield
    # saver closes here — clean shutdown, no data loss

app = FastAPI(lifespan=lifespan)
```

In route handlers or graph invocation:
```python
checkpointer = request.app.state.checkpointer
graph = build_agent_graph(checkpointer=checkpointer)
```

This is the official FastAPI pattern for long-lived resources (same as SQLAlchemy engine). Zero logic failure risk.

---

### 7. Production Migration Path (NeonDB `AsyncPostgresSaver`)

When moving to production, replace SQLite with `AsyncPostgresSaver` — one line change:

```python
# Dev (SQLite)
async with AsyncSqliteSaver.from_conn_string("checkpoints.db") as saver: ...

# Production (NeonDB)
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
async with AsyncPostgresSaver.from_conn_string(NEONDB_URL) as saver: ...
```

Same interface, same `app.state.checkpointer` pattern, same `thread_id` composite key. No other code changes required.

---

## Context pointer (for map.md)

Resolves ticket **08**. Schema: `chat_sessions` table in NeonDB + `checkpoints.db` SQLite keyed by `{org_id}:{user_id}:{session_id}`. Session CRUD via 5 FastAPI endpoints. Auto-title from first 60 chars of first message, editable via PATCH. Hard delete purges both Postgres row and SQLite checkpoint blob. FastAPI `lifespan` manages checkpointer lifecycle.
