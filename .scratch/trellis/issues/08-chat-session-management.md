# 08 - Chat Session Management & SQLite Checkpointer

- **Type**: `task`
- **Status**: `ready-for-agent`
- **Assignee**: Agentic Lead
- **Blocked by**: 04

## Question

How should chat sessions be stored, named, listed, and retrieved per user, and how does the SQLite checkpointer integrate with the FastAPI session lifecycle?

Specifically:
- What is the DB schema for storing session metadata (session_id, user_id, org_id, name, created_at, last_active_at) separately from the LangGraph checkpoint blob?
- How does FastAPI expose session CRUD endpoints: create session, list sessions (scoped to user), rename session, delete session?
- How does the `thread_id = f"{org_id}:{user_id}:{session_id}"` composite key enforce org-level isolation in the checkpointer?
- How is `checkpoints.db` (SQLite) managed in the FastAPI process lifecycle (startup/shutdown lifespan)?
- What is the migration path to `AsyncPostgresSaver` for production (NeonDB)?
