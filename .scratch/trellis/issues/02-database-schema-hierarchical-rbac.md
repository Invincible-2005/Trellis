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
    # Org-level role (added 2026-10-08, ticket 12 D9). Its permissions apply org-wide and in every team.
    # The org creator gets the seeded root "Admin" role. NULL = no org-wide role (team roles only).
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("roles.id"), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="org_memberships")
    role: Mapped[Optional["Role"]] = relationship()


class Invitation(Base):
    """Pending team/org invitation for users who haven't accepted or signed up yet."""
    __tablename__ = "invitations"
    __table_args__ = (UniqueConstraint("email", "org_id", "team_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), nullable=False)
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Clerk delivers the invite email; this row is the source of truth for WHAT the invitee gets
    # (added 2026-10-08, ticket 12 D10). Used to revoke the Clerk invitation too.
    clerk_invitation_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "expired", name="invitation_status"),
        default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship()
    team: Mapped["Team"] = relationship()
    role: Mapped["Role"] = relationship()
    invited_by: Mapped["User"] = relationship()


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
    #         'assign_task','give_strike','view_aggregate','review_strike'
    permissions: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    # True only for the root "Admin" role seeded at org provisioning (added 2026-10-08, ticket 12 D9).
    # A system role can't be deleted or re-parented, can't lose permissions, and must keep >= 1 holder.
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
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
    Governance/SOP document. Tagged to an Org, Role, or Team:
    - scope_type='org': org-wide policy, visible to ALL members of the organization.
    - scope_type='role': visible to role_id + all ANCESTOR roles (roles above it). Equivalently, a user
      at role U sees docs tagged to U and U's descendants. (Wording fixed 2026-10-08 — see ticket 12.)
    - scope_type='team': visible to all team_members + roles above the team.
    Uploaded by roles with 'upload_document' permission for their role/team scope.
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    file_url: Mapped[str] = mapped_column(String, nullable=False)  # UploadThing CDN URL
    file_type: Mapped[str] = mapped_column(
        Enum("pdf", "docx", "pptx", "txt", "md", name="doc_file_type"),
        nullable=False
    )
    scope_type: Mapped[str] = mapped_column(
        Enum("org", "role", "team", name="doc_scope_type"),
        nullable=False
    )
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("roles.id"), nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("teams.id"), nullable=True)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("processing", "ready", "failed", name="doc_ingestion_status"),
        default="processing"
    )
    chunk_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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
    embedding: Mapped[List[float]] = mapped_column(Vector(1024), nullable=False)  # mxbai-embed-large-v1 (1024 dims)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # Denormalized for fast scope filtering in vector search
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    scope_type: Mapped[str] = mapped_column(Enum("org", "role", "team", name="doc_scope_type"), nullable=False)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    document: Mapped["Document"] = relationship(back_populates="chunks")


# ─────────────────────────────────────────────
# TASKS, SUBMISSIONS & COMMENTS
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
    comments: Mapped[List["TaskComment"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    blocking_task: Mapped[Optional["Task"]] = relationship(remote_side="Task.id")


class TaskSubmission(Base):
    """
    Work deliverable uploaded by a team member for a task (like Google Classroom).
    No 'upload_document' permission required — any member can submit to their own tasks.
    File stored externally (S3/Vercel Blob/Uploadthing), URL recorded here.
    """
    __tablename__ = "task_submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False)  # External storage URL
    notes: Mapped[Optional[str]] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="submissions")


class TaskComment(Base):
    """
    Contextual comment thread on a task. Enables team members to discuss blockers,
    clarifications, and progress directly on the deliverable without a noisy chatroom.
    Also retrievable by the AI agent to answer queries like "Why is Task X blocked?".
    """
    __tablename__ = "task_comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship()


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


# ─────────────────────────────────────────────
# CHAT SESSIONS
# ─────────────────────────────────────────────

class ChatSession(Base):
    """
    User-facing chat session metadata.
    LangGraph checkpointer state (message history blobs) lives in checkpoints.db (SQLite),
    while metadata (title, timestamps) lives here in Postgres for fast sidebar listing.
    """
    __tablename__ = "chat_sessions"
    __table_args__ = (UniqueConstraint("org_id", "user_id", "id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Auto-titled from first message
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

### Required Indexes (Alembic migration)

```sql
-- pgvector HNSW index for fast approximate nearest-neighbor search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Scope filtering indexes (always applied before vector search)
CREATE INDEX idx_chunks_org_scope_org ON document_chunks (org_id, scope_type);
CREATE INDEX idx_chunks_org_scope_role ON document_chunks (org_id, scope_type, role_id);
CREATE INDEX idx_chunks_org_scope_team ON document_chunks (org_id, scope_type, team_id);

-- Role tree traversal
CREATE INDEX idx_roles_org_parent ON roles (org_id, parent_role_id);

-- Team member lookup
-- (fixed 2026-10-08: team_members has no org_id column; org is reached via teams.org_id)
CREATE INDEX idx_team_members_user ON team_members (user_id);
CREATE INDEX idx_team_members_team ON team_members (team_id);

-- Org membership + org-level role (ticket 12 D9). Lookup by (org_id, user_id) is already covered
-- by the UNIQUE constraint; this one serves "who holds role X" (cache invalidation, last-Admin check).
CREATE INDEX idx_org_members_role ON org_members (org_id, role_id);

-- Pending-invitation auto-apply on first request (ticket 12 D10)
CREATE INDEX idx_invitations_pending ON invitations (org_id, email) WHERE status = 'pending';

-- Task deadline queries
CREATE INDEX idx_tasks_team_deadline ON tasks (team_id, deadline, status);

-- Task comment threads query
CREATE INDEX idx_task_comments_task ON task_comments (task_id, created_at);

-- Chat sessions query
CREATE INDEX idx_chat_sessions_user_org ON chat_sessions (user_id, org_id, last_active_at DESC);

-- Audit log time-series
CREATE INDEX idx_audit_org_time ON audit_log (org_id, created_at DESC);
```

---

### Scoped vector search query (the core guardrail)

> **⚠️ CORRECTION (2026-09-21):** The original CTE below was walking in the wrong
> direction. It used `r.id = a.parent_role_id` which climbs **upward** to ancestor
> roles. The access rule requires the opposite: a logged-in user at Role U can see
> documents tagged to U **and all roles beneath U** (descendants). The corrected CTE
> walks **downward** using `r.parent_role_id = vr.id`. See explanation below.

**Why descendants, not ancestors:**
```
Tree:  Admin → HR → Manager → Employee
Access rule: doc tagged to Employee is visible to Employee, Manager, HR, Admin.
```
So if I am logged in as HR, I can see docs tagged to: HR, Manager, Employee.
Those are **descendants** of my role — not ancestors.
The recursive query must start at my role and walk **down** to children, then grandchildren.

```sql
-- CORRECT: walk DOWN the role tree (find descendants of user's roles)
WITH RECURSIVE visible_roles AS (
    -- Seed: the user's own role(s) in this org
    SELECT id FROM roles WHERE id = ANY(:user_role_ids)
    UNION ALL
    -- Recursive step: find children of every role already in the set
    SELECT r.id FROM roles r
    INNER JOIN visible_roles vr ON r.parent_role_id = vr.id  -- ← walks DOWN to children
    WHERE r.org_id = :org_id
)
SELECT id, content, embedding <=> :query_vec AS distance
FROM document_chunks
WHERE org_id = :org_id
  AND (
    (scope_type = 'org'   AND org_id = :org_id)
    OR
    (scope_type = 'role'  AND role_id IN (SELECT id FROM visible_roles))
    OR
    (scope_type = 'team'  AND team_id = ANY(:allowed_team_ids))
  )
ORDER BY embedding <=> :query_vec
LIMIT 5;
```

**Critical join condition diff:**

| Version | Join condition | Effect |
|---|---|---|
| Old (wrong) | `r.id = a.parent_role_id` | Finds r whose ID is the parent of a → climbs UP |
| New (correct) | `r.parent_role_id = vr.id` | Finds r whose parent is vr → walks DOWN |

This same descendant traversal must be used in `resolve_scope()` (Ticket 03) to build
the `visible_role_ids` list that gets cached and injected into every request.

## Context pointer (for map.md)

Schema finalized. Resolves into Tickets 03 and 05.

**Schema changes from the 2026-10-08 audit (ticket 12; migration tracked in ticket 13):**
- `org_members.role_id` (nullable FK → roles): org-level role (D9).
- `roles.is_system` (bool, default false): protected root Admin (D9).
- `invitations.clerk_invitation_id` (nullable, unique): links to the Clerk invitation (D10).
- Index fixes and additions: `idx_team_members_user` corrected, plus new `idx_org_members_role` and `idx_invitations_pending`.
- None of the indexes above exist in any Alembic migration yet (ticket 12 "Code drift").
