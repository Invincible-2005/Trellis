# 05 - FastAPI OpenAPI Contract & Next.js Client Generation

- **Type**: `task`
- **Status**: `resolved`
- **Assignee**: Frontend Dev & Backend Dev
- **Blocked by**: 02, 03

## Goal

Establish end-to-end type safety between FastAPI and Next.js by defining typed Pydantic models for every route, outputting `openapi.json`, and generating TypeScript interfaces for the frontend via `openapi-typescript`.

---

## Decisions locked

1. **Authentication & JIT Enrollment**:
   - Next.js sends Clerk Bearer JWT.
   - FastAPI verifies via `PyJWT` + `cryptography` (using JWKS from Clerk).
   - If user doesn't exist in DB, JIT create `User` row on `/auth/me`.
   - `/auth/context` returns org memberships + pending invitations for the user's email.
   - Accepting an invitation (`POST /invitations/{id}/accept`) creates `OrgMember` + `TeamMember` rows and redirects to dashboard.
2. **Role Hierarchy Representation & Re-parenting**:
   - `GET /admin/roles` returns a **flat list with computed `depth` and `parent_role_id`**. Frontend uses this directly to build trees, tables, or React Flow graphs.
   - Roles use **standalone permissions** (explicit array per role, no complex runtime tree inheritance).
   - Re-parenting is supported via `PATCH /admin/roles/{role_id}` with `{ "parent_role_id": "<uuid>" }`.
3. **Invitation Pipeline**:
   - `POST /admin/teams/{team_id}/members` takes `{ email, role_id }`.
   - If user exists: added immediately to `team_members`.
   - If user does not exist: creates an `invitations` record with status `pending` and dispatches Clerk invitation.
4. **File Storage Contract**:
   - File uploads handled on frontend via **UploadThing**.
   - FastAPI endpoints only receive and store metadata + final `file_url: str` in DB (no multipart handling in FastAPI).
5. **Dashboard Response**:
   - Single polymorphic endpoint `GET /dashboard` returning personal `my_tasks`, `managed_teams` (if managing any teams), and `org_overview` (if user has `view_aggregate` permission).
6. **SSE Streaming Contract**:
   - Chat streaming schema conforms to Ticket 04 (`status`, `tool_call`, `token`, `citations`, `error`, `done`).

---

## Pydantic Schemas (`schemas.py`)

```python
from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


# ─────────────────────────────────────────────
# COMMON & BASE CONFIG
# ─────────────────────────────────────────────

class AppBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─────────────────────────────────────────────
# 1. AUTH & ONBOARDING SCHEMAS
# ─────────────────────────────────────────────

class OrgSummary(AppBaseModel):
    id: UUID
    name: str
    clerk_org_id: str


class InvitationStatusEnum(str, Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"


class InvitationResponse(AppBaseModel):
    id: UUID
    email: str
    org_id: UUID
    org_name: str
    team_id: UUID
    team_name: str
    role_id: UUID
    role_name: str
    invited_by_name: str
    status: InvitationStatusEnum
    created_at: datetime


class AuthMeResponse(AppBaseModel):
    user_id: UUID
    clerk_user_id: str
    email: str
    name: str
    active_org_id: Optional[UUID] = None


class AuthContextResponse(AppBaseModel):
    organizations: List[OrgSummary]
    pending_invitations: List[InvitationResponse]


class CreateOrgRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


# ─────────────────────────────────────────────
# 2. ROLE HIERARCHY & RE-PARENTING SCHEMAS
# ─────────────────────────────────────────────

class RoleResponse(AppBaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    parent_role_id: Optional[UUID] = None
    depth: int = 0
    permissions: List[str] = Field(default_factory=list)
    created_at: datetime


class RoleListResponse(AppBaseModel):
    roles: List[RoleResponse]


class CreateRoleRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = None
    parent_role_id: Optional[UUID] = None
    permissions: List[str] = Field(
        default_factory=list,
        description="Allowed actions: create_role, create_team, add_member, upload_document, assign_task, give_strike, view_aggregate, review_strike"
    )


class UpdateRoleRequest(BaseModel):
    """Used for editing role details and re-parenting in hierarchy."""
    name: Optional[str] = None
    description: Optional[str] = None
    parent_role_id: Optional[UUID] = None
    permissions: Optional[List[str]] = None


# ─────────────────────────────────────────────
# 3. TEAMS & MEMBERSHIP SCHEMAS
# ─────────────────────────────────────────────

class TeamMemberResponse(AppBaseModel):
    user_id: UUID
    name: str
    email: str
    role_id: UUID
    role_name: str
    joined_at: datetime


class TeamResponse(AppBaseModel):
    id: UUID
    name: str
    created_at: datetime
    member_count: int = 0


class TeamDetailResponse(AppBaseModel):
    id: UUID
    name: str
    created_at: datetime
    members: List[TeamMemberResponse]


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


class AddTeamMemberRequest(BaseModel):
    email: str
    role_id: UUID


class AddTeamMemberResponse(BaseModel):
    status: str = Field(..., description="'added' if member was enrolled immediately, 'invited' if pending email invite")
    member: Optional[TeamMemberResponse] = None
    invitation: Optional[InvitationResponse] = None


# ─────────────────────────────────────────────
# 4. DOCUMENTS (Governance / SOP for RAG)
# ─────────────────────────────────────────────

class DocScopeTypeEnum(str, Enum):
    role = "role"
    team = "team"


class CreateDocumentRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    scope_type: DocScopeTypeEnum
    role_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    file_url: str = Field(..., description="CDN URL returned by UploadThing")


class DocumentResponse(AppBaseModel):
    id: UUID
    title: str
    description: Optional[str]
    scope_type: DocScopeTypeEnum
    role_id: Optional[UUID]
    team_id: Optional[UUID]
    uploaded_by_user_id: UUID
    created_at: datetime


# ─────────────────────────────────────────────
# 5. TASKS & SUBMISSIONS
# ─────────────────────────────────────────────

class TaskStatusEnum(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"
    blocked = "blocked"


class TaskSubmissionResponse(AppBaseModel):
    id: UUID
    task_id: UUID
    submitted_by_user_id: UUID
    submitted_by_name: str
    file_url: str
    notes: Optional[str]
    submitted_at: datetime


class TaskResponse(AppBaseModel):
    id: UUID
    team_id: UUID
    title: str
    description: Optional[str]
    assigned_to_user_id: Optional[UUID]
    assigned_to_name: Optional[str] = None
    deadline: Optional[datetime]
    status: TaskStatusEnum
    blocked_by_task_id: Optional[UUID]
    created_at: datetime
    submissions: List[TaskSubmissionResponse] = Field(default_factory=list)


class CreateTaskRequest(BaseModel):
    team_id: UUID
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    deadline: Optional[datetime] = None
    blocked_by_task_id: Optional[UUID] = None


class UpdateTaskStatusRequest(BaseModel):
    status: TaskStatusEnum


class CreateTaskSubmissionRequest(BaseModel):
    file_url: str = Field(..., description="UploadThing URL of submitted work")
    notes: Optional[str] = None


# ─────────────────────────────────────────────
# 6. STRIKES & COMMENDATIONS
# ─────────────────────────────────────────────

class StrikeResponse(AppBaseModel):
    id: UUID
    team_id: UUID
    given_by_user_id: UUID
    given_by_name: str
    given_to_user_id: UUID
    given_to_name: str
    reason: str
    status: str
    escalated: bool
    created_at: datetime


class CreateStrikeRequest(BaseModel):
    team_id: UUID
    given_to_user_id: UUID
    reason: str = Field(..., min_length=5)


class CommendationResponse(AppBaseModel):
    id: UUID
    team_id: UUID
    given_by_user_id: UUID
    given_by_name: str
    given_to_user_id: UUID
    given_to_name: str
    reason: str
    created_at: datetime


class CreateCommendationRequest(BaseModel):
    team_id: UUID
    given_to_user_id: UUID
    reason: str = Field(..., min_length=5)


# ─────────────────────────────────────────────
# 7. DASHBOARD METRICS (Polymorphic)
# ─────────────────────────────────────────────

class TaskSummary(BaseModel):
    todo: int = 0
    in_progress: int = 0
    done: int = 0
    overdue: int = 0


class TeamOverview(BaseModel):
    team_id: UUID
    team_name: str
    member_count: int
    task_summary: TaskSummary
    active_strikes: int


class OrgOverview(BaseModel):
    total_users: int
    total_teams: int
    total_roles: int
    total_documents: int
    total_strikes: int


class DashboardResponse(BaseModel):
    my_tasks: TaskSummary
    managed_teams: Optional[List[TeamOverview]] = None
    org_overview: Optional[OrgOverview] = None
```

---

## Frontend Codegen Script (`package.json`)

In the Next.js `frontend/package.json`:

```json
{
  "scripts": {
    "codegen": "openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts"
  },
  "devDependencies": {
    "openapi-typescript": "^7.0.0"
  }
}
```

Running `npm run codegen` will generate fully typed TypeScript definitions matching these schemas, giving the frontend 100% compile-time type safety against the FastAPI backend.


