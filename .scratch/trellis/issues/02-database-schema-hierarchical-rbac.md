# 02 - Database Schema & Hierarchical RBAC Design

- **Type**: `task`
- **Status**: `resolved`
- **Assignee**: Backend + DB Dev & Agentic Lead
- **Blocked by**: 01

## Question

How should the relational schema and vector chunk storage in PostgreSQL represent the hybrid role/team model with strict hierarchical document access?

## Answer

### Tech: SQLAlchemy (async) + Alembic + pgvector-python

Reason: Async SQLAlchemy works natively with FastAPI. Self-referential relationships handle the role tree. Alembic handles migrations. pgvector-python's SQLAlchemy extension provides the `Vector` column type.

---

### Schema

```python
# models.py — SQLAlchemy ORM (async)

import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, Enum, UniqueConstraint, Boolean, Integer, DateTime, Text, ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────
# IDENTITY
# ─────────────────────────────────────────────

class User(Base):
    """Clerk-authenticated user. No org_id — multi-org via OrgMember."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    clerk_user_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org_memberships: Mapped[List["OrgMember"]] = relationship(back_populates="user")
    team_memberships: Mapped[List["TeamMember"]] = relationship(back_populates="user")


class Organization(Base):
    """Top-level workspace. Isolated by org_id — every query is bounded by it."""
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    clerk_org_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[List["OrgMember"]] = relationship(back_populates="org")
    roles: Mapped[List["Role"]] = relationship(back_populates="org")
    teams: Mapped[List["Team"]] = relationship(back_populates="org")


class OrgMember(Base):
    """Bridge: user ↔ org. Supports multi-org membership."""
    __tablename__ = "org_members"
    __table_args__ = (UniqueConstraint("org_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="org_memberships")


# ─────────────────────────────────────────────
# ROLE HIERARCHY
# ─────────────────────────────────────────────

class Role(Base):
    """
    Global org role. Tree via parent_role_id (recursive CTE for traversal).
    Document access: doc tagged to Role R → visible to R and all ancestors.
    """
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_role_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("roles.id"), nullable=True)
    # Permissions stored as array of strings (use Enum in strict implementations)
    # Values: 'create_role','create_team','add_member','upload_document',
    #         'assign_task','give_strike','view_aggregate'
    permissions: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship(back_populates="roles")
    children: Mapped[List["Role"]] = relationship(back_populates="parent")
    parent: Mapped[Optional["Role"]] = relationship(back_populates="children", remote_side="Role.id")


# ─────────────────────────────────────────────
# TEAMS & MEMBERSHIP
# ─────────────────────────────────────────────

class Team(Base):
    """Unit of work within an org."""
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship(back_populates="teams")
    members: Mapped[List["TeamMember"]] = relationship(back_populates="team")
    tasks: Mapped[List["Task"]] = relationship(back_populates="team")


class TeamMember(Base):
    """
    Hybrid model: a user's role is contextual to the team.
    Same user can be Manager in Team A and Employee in Team B.
    """
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    team: Mapped["Team"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="team_memberships")
    role: Mapped["Role"] = relationship()


# ─────────────────────────────────────────────
# DOCUMENTS (Policy/SOP — for RAG)
# ─────────────────────────────────────────────

class Document(Base):
    """
    Governance/SOP document. Tagged to EITHER a role OR a team (not both).
    - scope_type='role': visible to role_id + all ancestor roles.
    - scope_type='team': visible to all team_members + roles above the team.
    Uploaded by roles with 'upload_document' permission for their role scope.
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    scope_type: Mapped[str] = mapped_column(Enum("role", "team", name="doc_scope_type"), nullable=False)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("roles.id"), nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("teams.id"), nullable=True)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chunks: Mapped[List["DocumentChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    """
    Vector chunk for pgvector RAG. Scope columns are DENORMALIZED from the parent
    document for fast WHERE filtering inside the ANN query — avoids a JOIN during retrieval.
    """
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[List[float]] = mapped_column(Vector(1536), nullable=False)  # OpenAI ada-002 / text-embedding-3-small
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # Denormalized for fast scope filtering in vector search
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    scope_type: Mapped[str] = mapped_column(Enum("role", "team", name="doc_scope_type"), nullable=False)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    document: Mapped["Document"] = relationship(back_populates="chunks")


# ─────────────────────────────────────────────
# TASKS & SUBMISSIONS
# ─────────────────────────────────────────────

class Task(Base):
    """Team work item. blocked_by_task_id forms a DAG for dependency tracking."""
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    assigned_to_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("todo", "in_progress", "done", "blocked", name="task_status"),
        default="todo"
    )
    blocked_by_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    team: Mapped["Team"] = relationship(back_populates="tasks")
    submissions: Mapped[List["TaskSubmission"]] = relationship(back_populates="task")
    blocking_task: Mapped[Optional["Task"]] = relationship(remote_side="Task.id")


class TaskSubmission(Base):
    """
    Work deliverable uploaded by a team member for a task (like Google Classroom).
    No 'upload_document' permission required — any member can submit to their own tasks.
    File stored externally (S3/Vercel Blob), URL recorded here.
    """
    __tablename__ = "task_submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False)  # External storage URL
    notes: Mapped[Optional[str]] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="submissions")


# ─────────────────────────────────────────────
# STRIKES
# ─────────────────────────────────────────────

class Strike(Base):
    """
    Issued by a higher-role user against a lower-role user.
    Agent validates reason against org policy docs (RAG) before confirming.
    Threshold: 3 confirmed strikes → escalated = True → notify role above.
    """
    __tablename__ = "strikes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    given_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    given_to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    policy_chunk_ids: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)  # UUIDs of RAG chunks used
    agent_evaluation: Mapped[Optional[str]] = mapped_column(Text)  # Agent's verdict text
    status: Mapped[str] = mapped_column(
        Enum("pending_agent_review", "confirmed", "appealed", "dismissed", name="strike_status"),
        default="pending_agent_review"
    )
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────

class AuditLog(Base):
    """Immutable log of every agent action. Scope is snapshotted at time of query."""
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_ids_at_time: Mapped[List[str]] = mapped_column(ARRAY(String))  # Snapshot of user's roles at query time
    query: Mapped[str] = mapped_column(Text, nullable=False)
    tools_called: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    chunks_retrieved_ids: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    chunks_denied_count: Mapped[int] = mapped_column(Integer, default=0)
    answer_summary: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

---

### Required Indexes (Alembic migration)

```sql
-- pgvector HNSW index for fast approximate nearest-neighbor search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Scope filtering indexes (always applied before vector search)
CREATE INDEX idx_chunks_org_scope_role ON document_chunks (org_id, scope_type, role_id);
CREATE INDEX idx_chunks_org_scope_team ON document_chunks (org_id, scope_type, team_id);

-- Role tree traversal
CREATE INDEX idx_roles_org_parent ON roles (org_id, parent_role_id);

-- Team member lookup
CREATE INDEX idx_team_members_user ON team_members (user_id, org_id);
CREATE INDEX idx_team_members_team ON team_members (team_id);

-- Task deadline queries
CREATE INDEX idx_tasks_team_deadline ON tasks (team_id, deadline, status);

-- Audit log time-series
CREATE INDEX idx_audit_org_time ON audit_log (org_id, created_at DESC);
```

---

### Scoped vector search query (the core guardrail)

```sql
-- Resolve ancestor role IDs (recursive CTE)
WITH RECURSIVE ancestors AS (
    SELECT id FROM roles WHERE id = ANY(:user_role_ids)
    UNION ALL
    SELECT r.id FROM roles r
    INNER JOIN ancestors a ON r.id = a.parent_role_id
    WHERE r.org_id = :org_id
)
SELECT id, content, embedding <=> :query_vec AS distance
FROM document_chunks
WHERE org_id = :org_id
  AND (
    (scope_type = 'role' AND role_id IN (SELECT id FROM ancestors))
    OR
    (scope_type = 'team' AND team_id = ANY(:allowed_team_ids))
  )
ORDER BY embedding <=> :query_vec
LIMIT 5;
```

## Context pointer (for map.md)

Schema finalized. Resolves into Tickets 03 and 05.
