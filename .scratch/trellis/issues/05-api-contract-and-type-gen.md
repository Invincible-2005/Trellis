# 05 - FastAPI OpenAPI Contract & Next.js Client Generation

- **Type**: `task`
- **Status**: `needs-triage`
- **Assignee**: Frontend Dev & Backend Dev
- **Blocked by**: 02, 03

## Question

How do we establish seamless end-to-end type safety between FastAPI and Next.js?
- Define Pydantic request/response schemas for `/auth/me`, `/admin/roles`, `/admin/teams`, `/documents/upload`, `/dashboard`, and `/chat` (streaming SSE).
- Set up an automated script (`npm run codegen`) in the Next.js repo that fetches `http://localhost:8000/openapi.json` and generates TypeScript types and client methods.
