# 05 - FastAPI OpenAPI Contract & Next.js Client Generation

- **Type**: `task`
- **Status**: `ready-for-human`
- **Assignee**: Frontend Dev & Backend Dev
- **Blocked by**: 02, 03

## Goal

Establish end-to-end type safety between FastAPI and Next.js by defining typed Pydantic models for every route, outputting `openapi.json`, and generating TypeScript interfaces for the frontend via `openapi-typescript`.

---

## Decisions already locked

1. **Authentication Flow**:
   - Next.js sends Clerk Bearer JWT.
   - FastAPI verifies via `PyJWT` + `cryptography` (using JWKS from Clerk).
   - FastAPI returns internal user and active org details.
2. **File Upload Contract**:
   - File bytes are uploaded directly to **UploadThing** via Next.js.
   - FastAPI endpoints only receive metadata and the final `file_url: str` (no `multipart/form-data` handling in FastAPI).
3. **SSE Streaming Contract**:
   - Chat streaming schema is locked in Ticket 04 (`status`, `tool_call`, `token`, `citations`, `error`, `done`).

---

## Undecided / What needs to be defined here

We need to formalize the exact Pydantic request and response bodies for the core endpoints:

### 1. Auth & Org Context
- `GET /api/v1/auth/me`:
  - Output: internal `user_id`, email, name, list of organizations, active org membership.
- `POST /api/v1/organizations`:
  - Create organization when user is not invited to one. Input: `{ name: str }`.

### 2. Admin & Hierarchy Configuration
- `GET /api/v1/admin/roles`: List tree of roles.
- `POST /api/v1/admin/roles`: Create role. Input: `{ name: str, description?: str, parent_role_id?: UUID, permissions: list[str] }`.
- `GET /api/v1/admin/teams`: List teams in org.
- `POST /api/v1/admin/teams`: Create team. Input: `{ name: str }`.
- `POST /api/v1/admin/teams/{team_id}/members`: Add user to team with assigned role. Input: `{ email: str, role_id: UUID }`.

### 3. Documents (Governance / SOP)
- `POST /api/v1/documents`: Record newly uploaded document.
  - Input: `{ title: str, description?: str, scope_type: 'role' | 'team', role_id?: UUID, team_id?: UUID, file_url: str }`.
- `GET /api/v1/documents`: List accessible documents for the current user's resolved scope.

### 4. Tasks & Submissions
- `GET /api/v1/teams/{team_id}/tasks`: List tasks in team.
- `POST /api/v1/teams/{team_id}/tasks`: Create task.
  - Input: `{ title: str, description?: str, assigned_to_user_id?: UUID, deadline?: datetime, blocked_by_task_id?: UUID }`.
- `POST /api/v1/tasks/{task_id}/submissions`: Submit task proof (UploadThing link).
  - Input: `{ file_url: str, notes?: str }`.

### 5. Strikes & Commendations
- `POST /api/v1/strikes`: Issue a strike.
  - Input: `{ team_id: UUID, given_to_user_id: UUID, reason: str }`.
- `POST /api/v1/commendations`: Positive recognition counterpart.

### 6. Dashboard Metrics
- `GET /api/v1/dashboard`: Role-scoped statistics (task status breakdown, team members, strike counts).

