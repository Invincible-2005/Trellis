# 05 - FastAPI OpenAPI Contract & Next.js Client Generation

- **Type**: `task`
- **Status**: `resolved`
- **Assignee**: Frontend Dev & Backend Dev
- **Blocked by**: 02, 03

## Goal

Establish end-to-end type safety between FastAPI and Next.js by defining typed Pydantic models for every route, outputting `openapi.json`, and generating TypeScript interfaces for the frontend via `openapi-typescript`.

---

## Decisions locked

> ⚠️ **Audit notes (2026-10-08):**
> - **Prefix locked (ticket 12 D3):** every FastAPI route lives under **`/api/v1`** (only `/health` stays at root). Paths below updated.
> - **Endpoint list is provisional** (team, 2026-10-08): schemas and contract patterns here are locked; the exact set of REST endpoints is not.
> - Document schemas updated below to match ticket 11 (`org` scope, `file_type`, `status`, `chunk_count`).
> - Codegen path superseded by frontend ticket 03: `frontend/lib/api/v1.d.ts`, script `api:generate`.

1. **Authentication & JIT Enrollment** *(updated 2026-10-08, ticket 12 D8 and D10; full pipeline in ticket 03 §2)*:
   - Next.js sends the Clerk Bearer JWT. User and org come **only** from the verified token; FastAPI ignores `X-Org-*` and `X-User-*` headers.
   - FastAPI verifies it with `PyJWT` + `cryptography` (Clerk JWKS), checking `iss` and `azp`.
   - On **any** authenticated request, `get_identity` creates the `users` row just-in-time if it's missing. `email` and `name` come from custom session claims.
   - On the first request in an org, `get_org_context` creates the `org_members` row just-in-time and **auto-applies pending invitations** (they become `team_members` and are marked `accepted`).
   - `GET /api/v1/auth/context` returns org memberships, pending invitations, and (if the token has a provisioned active org) the **effective permissions** for that org. The frontend uses them to show or hide navigation and admin tabs (D4).
   - ~~`POST /api/v1/invitations/{id}/accept`~~: **dropped** (D10). Accepting happens in Clerk, and the Trellis invitation is applied on the invitee's first request.
2. **Role Hierarchy Representation & Re-parenting**:
   - `GET /api/v1/admin/roles` returns a **flat list with computed `depth` and `parent_role_id`**. Frontend uses this directly to build trees, tables, or React Flow graphs.
   - Roles use **standalone permissions** (explicit array per role, no complex runtime tree inheritance).
   - Re-parenting is supported via `PATCH /api/v1/admin/roles/{role_id}` with `{ "parent_role_id": "<uuid>" }`.
3. **Invitation Pipeline** *(updated 2026-10-08, ticket 12 D10)*:
   - > **Superseded in part 2026-10-09 (ticket 12 D25):** new people are invited into the **org** from `/admin/members` (`POST /api/v1/admin/members {email, role_id?}`, org-level role). The team endpoint below only adds existing org members to a team. `InvitationResponse.team_id/team_name/role_id/role_name` are now optional (null for an org-only invite).
   - `POST /api/v1/admin/teams/{team_id}/members` takes `{ email, role_id }`.
     - Requires `can_org("add_member")` to invite a new person into the org, or `can("add_member", team_id)` to add an existing org member to the team.
     - `role_id` must be **strictly below** the caller's highest role (no privilege escalation).
   - **Already an org member:** added immediately to `team_members`; their scope is invalidated.
   - **Not an org member yet:**
     1. Create an `invitations` row (`pending`). It is the source of truth for team and role.
     2. Create a Clerk org invitation (`POST /v1/organizations/{clerk_org_id}/invitations`, role `org:member`) through the Backend API.
     3. Store `clerk_invitation_id`.
   - `DELETE /api/v1/admin/invitations/{id}` revokes the invitation in both Clerk and the DB.
4. **File Storage Contract**:
   - File uploads handled on frontend via **UploadThing**.
   - FastAPI endpoints only receive and store metadata + final `file_url: str` in DB (no multipart handling in FastAPI).
5. **Dashboard Response**:
   - Single polymorphic endpoint `GET /api/v1/dashboard` returning personal `my_tasks`, `managed_teams` (if managing any teams), and `org_overview` (if user has `view_aggregate` permission).
6. **SSE Streaming Contract**:
   - Chat streaming schema conforms to Ticket 04 (`status`, `tool_call`, `token`, `citations`, `error`, `done`).
7. **Org Provisioning, Org Roles & Membership** *(added 2026-10-08, ticket 12 D4, D9 and D10)*:
   - **`POST /api/v1/orgs/provision`** (identity-only, **idempotent**, called by the `/onboarding` page):
     - The Clerk org ID comes from the token, never the request body.
     - The caller's Clerk org role must be `org:admin`; otherwise 403.
     - The org name is fetched from the Clerk Backend API.
     - One transaction creates the `organizations` row, the root role `Admin` (`is_system`, all 8 permissions), and `org_members(creator, role=Admin)`.
     - Returns 201 the first time and 200 if the org already exists.
   - **`PATCH /api/v1/admin/members/{user_id}`** `{ org_role_id | null }`: sets or clears a member's **org-level** role.
     - Requires `can_org("add_member")`, and the role must be below the caller's.
     - Refused if it would leave zero `Admin` holders.
   - **`DELETE /api/v1/admin/members/{user_id}`**: removes the Clerk membership (Backend API), then the `team_members` and `org_members` rows, then invalidates the scope.
     - Refused for a target at or above the caller, and for the last `Admin`.
   - **Errors:** `409 org_not_provisioned` (the BFF redirects to `/onboarding`) and `400 no_active_org` (the BFF redirects to `/org-selection`).
   - **Error body (ticket 12 D16):** every Trellis error is `{"detail": {"code", "message"}}`, built with `app/core/errors.py::api_error`. The BFF branches on status + `detail.code`: it redirects for the codes above and `invalid_token`, and otherwise shows `detail.message` in a sonner toast. 422 validation errors keep FastAPI's default shape. Codes so far:
     - `invalid_token` (401)
     - `auth_unavailable` (503)
     - `email_required` (400)
     - `email_in_use` (409)
     - `no_active_org` (400)
     - `org_not_provisioned` (409)
     - `forbidden` (403)
     - `clerk_rejected` (400, added 2026-10-09: Clerk refused an invite or membership, e.g. an invalid email; the message is Clerk's)
     - `already_member` (409), `already_invited` (409) (added 2026-10-09, `POST /admin/members`)
     - `invitation_not_found` (404) (added 2026-10-09, `DELETE /admin/invitations/{id}`)
   - **As built 2026-10-08:**
     - `GET /api/v1/auth/me` and `/auth/context` are live (`app/api/v1/auth.py`, schemas in `app/schemas/auth.py`).
     - The error body is published in OpenAPI as `ErrorResponse` via `responses=`, so the generated frontend types include it.
     - `/auth/context` never returns 400/409 for the org. `active_org` is `null` when there's no active org or it isn't set up.
     - `/auth/context` also records the caller's org membership just-in-time, the same as data routes.
   - **Role endpoints** (`POST /admin/roles`, `PATCH /admin/roles/{id}`, `DELETE /admin/roles/{id}`) enforce:
     - **No privilege escalation:** the new or edited role must sit below the caller's role, and the caller may only grant permissions they hold.
     - **The system role is protected:** `is_system` can't be deleted, re-parented, or lose permissions.
     - **As built 2026-10-09 (`GET`/`POST /api/v1/admin/roles`, schemas in `app/schemas/admin.py`):** `GET` needs console access (`can_org("create_role") or can_org("add_member")`) and returns every org role. `RoleResponse` gains `manageable: bool` (strictly below the caller's org role). `CreateRoleRequest.parent_role_id` is **required**, and `permissions` is typed as the 8 names (unknown → 422). New error codes: `role_not_found` (404), `role_name_taken` (409), `role_has_children` (409), `role_in_use` (409), `invalid_parent` (400).
     - **As built 2026-10-09 (`PATCH`/`DELETE /api/v1/admin/roles/{role_id}`):** `UpdateRoleRequest` fields are all optional; missing or `null` = unchanged, `description: ""` clears it, `permissions` is the full new list (only *added* ones must be held by the caller). `DELETE` returns 204. The `is_system` Admin role can't be renamed either (D17 rule 6 is stricter than the line above).
     - **Yardstick (ticket 12 D17, 2026-10-09):** "the caller's role" means their **org-level role only**; the caller needs `can_org("create_role")`. A new role's parent must be that role or a descendant (no parent-less roles). Delete is refused while the role is held or has children.

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


class ActiveOrgPermissions(BaseModel):
    """Effective permissions in the token's active org (ticket 12 D4 and D9). UI gating only;
    the backend still enforces every action."""
    org_id: UUID
    org_role_id: Optional[UUID] = None
    org_role_name: Optional[str] = None
    org_permissions: List[str] = Field(default_factory=list)
    permissions_by_team: dict[UUID, List[str]] = Field(default_factory=dict)
    member_team_ids: List[UUID] = Field(default_factory=list)     # added 2026-10-08 (D13)
    viewable_team_ids: List[UUID] = Field(default_factory=list)   # members + governed teams (D13)
    can_open_admin: bool        # can_org("create_role") or can_org("add_member")


class AuthContextResponse(AppBaseModel):
    organizations: List[OrgSummary]
    pending_invitations: List[InvitationResponse]
    active_org: Optional[ActiveOrgPermissions] = None   # None if no active or provisioned org


# CreateOrgRequest — SUPERSEDED 2026-10-08 (ticket 12 D10): orgs are created in Clerk
# (<OrganizationList />), then provisioned via POST /api/v1/orgs/provision (no body).
class ProvisionOrgResponse(AppBaseModel):
    org: OrgSummary
    admin_role_id: UUID
    created: bool               # False if the org was already provisioned (idempotent call)


class UpdateMemberOrgRoleRequest(BaseModel):
    org_role_id: Optional[UUID] = None   # None clears the org-level role


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
    is_system: bool = False          # root Admin; UI disables delete, re-parent and permission removal (D9)
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
    org = "org"      # added 2026-10-08 to match ticket 11
    role = "role"
    team = "team"


class DocFileTypeEnum(str, Enum):
    pdf = "pdf"
    docx = "docx"
    pptx = "pptx"
    txt = "txt"
    md = "md"


class DocStatusEnum(str, Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class CreateDocumentRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    scope_type: DocScopeTypeEnum
    role_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    file_url: str = Field(..., description="CDN URL returned by UploadThing")
    file_type: DocFileTypeEnum


class DocumentResponse(AppBaseModel):
    id: UUID
    title: str
    description: Optional[str]
    file_url: str
    file_type: DocFileTypeEnum
    scope_type: DocScopeTypeEnum
    role_id: Optional[UUID]
    team_id: Optional[UUID]
    uploaded_by_user_id: UUID
    status: DocStatusEnum          # frontend polls this after the 202 (ticket 11)
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None   # admin-facing reason when status == "failed" (ticket 11 §7a)
    deletable: bool = False               # added 2026-10-09 (ticket 12 D23): caller could upload it to this tag
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
    active_strikes: int   # ⚠️ 2026-10-09 (ticket 12 D24): Optional[int], None unless the user can give/review strikes in the team. Code: app/schemas/tasks.py (also adds `blocked` to TaskSummary)


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

> ⚠️ **Superseded by frontend ticket 03** — use `api:generate` → `./lib/api/v1.d.ts`. Kept for history.

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


