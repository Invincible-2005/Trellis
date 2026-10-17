# Trellis

**Role-Aware Agentic RAG Workspace. Guardrails that support growth, not just block it.**

---

## 1. Introduction

Trellis is a workspace for teams and organizations where **what you can see depends on your role**.

An admin sets up the company's roles (for example Admin → HR → Manager → Employee), creates teams, and uploads documents such as policies and SOPs. Every person then gets two things:

1. **A role-aware dashboard** with their tasks, deadlines, strikes, commendations and, for managers, team and organization summaries.
2. **An AI assistant (chat)** that answers questions from the company's own documents and data, and can do small jobs on request (create a task, give a strike, give a commendation). It only ever sees what the person asking is allowed to see.

The core idea: **access control is enforced in the backend, at the data and tool layer, not by asking the AI nicely in a prompt.** The AI never sees or changes a user's permissions. Even a prompt-injection attempt cannot make it leak a document the user has no access to.

## 2. Who is it for?

| Audience | How they use Trellis |
|---|---|
| **Admins / founders** | Create the organization, design the role hierarchy, invite people, upload policy documents. |
| **HR and managers** | Create teams and tasks, review team progress, give strikes or commendations, answer appeals. |
| **Employees** | See their own tasks and feedback, hand in work, and ask the chat questions about company policy. |
| **Students and developers** | A worked example of role-based access control (RBAC) combined with agentic RAG (retrieval-augmented generation). |

Good fit: small to mid-size organizations with a real hierarchy and a pile of internal documents nobody wants to search by hand.

## 3. Key features

**Organizations and access control**
- Self-serve organization creation, with several organizations per user (each fully isolated).
- Admin-defined **role tree of any depth**, with permissions (`create_role`, `create_team`, `add_member`, `upload_document`, `assign_task`, `give_strike`, `view_aggregate`, `review_strike`).
- **Org-level role plus per-team roles**: the same person can be a Manager in one team and an Employee in another.
- **No privilege escalation**: you can only act on roles below yours and only grant permissions you hold.
- Invite people by email; people who already use Trellis are added instantly.

**Documents**
- Upload PDF, Word, PowerPoint, text and Markdown files, tagged to the whole org, a role, or a team.
- A document tagged to a role is visible to that role **and the roles above it**.
- Files are chunked, embedded and indexed in the background, with a visible status (processing, ready, failed).

**Agentic RAG chat**
- Streaming answers with **verified citations** (a citation only appears if the passage was really retrieved).
- `@` to mention a person and `/` to mention a team; ask who someone is, or which documents they can see.
- **Write actions need a Confirm card**: creating tasks, giving strikes and commendations. Permissions are re-checked when you click Confirm.
- Strikes are checked against policy documents first, as a warning and never a block.
- Multiple saved chats per user, visible only to that user.

**Teams and tasks**
- Teams with their own members and roles; tasks with assignees, deadlines and statuses.
- **Hand-ins**: upload finished work with a note; only the person who handed in and the task's managers can open it.
- **Comments** on every task.

**Feedback**
- Strikes and commendations, a one-time appeal for the receiver, and a review step by a different person. Three active strikes escalate.

**Dashboard and admin console**
- Dashboard with personal stats, team cards and organization totals (with `view_aggregate`).
- Admin console for roles (shown as a React Flow tree), members and documents. Each page is gated by its own permission.

**Protection and quality**
- Rate limiting and bot protection (Arcjet) in front of the app.
- Typed API: the frontend types and form validation are generated from the backend's OpenAPI file.
- Answer-quality evaluation with DeepEval (`backend/evaluation/`).

## 4. Architecture

```
 Browser
    │   (never talks to FastAPI directly)
    ▼
┌──────────────────────────────────────────┐
│  Next.js 16 (frontend)  = the BFF        │
│  • Clerk sign-in, org switcher           │
│  • Server Components load data           │
│  • Server Actions write data             │
│  • /api/chat route proxies the SSE stream│
│  • Arcjet rate limits, UploadThing files │
└───────────────┬──────────────────────────┘
                │  server-to-server, only  Authorization: Bearer <Clerk JWT>
                ▼
┌──────────────────────────────────────────┐
│  FastAPI (backend)   all routes /api/v1  │
│                                          │
│  verify JWT → get_identity → get_org_context → resolve_scope()
│                                          │
│            AccessScope (frozen)          │
│        ┌──────────┴───────────┐          │
│   REST endpoints        LangGraph agent  │
│        └──────────┬───────────┘          │
│     shared data-access functions that    │
│     REQUIRE `scope`  (services/)         │
└──────┬─────────────────────┬─────────────┘
       ▼                     ▼
 NeonDB (Postgres)       Google Gemini
 • app tables            • chat + router (Flash-Lite)
 • pgvector chunks       • embeddings (gemini-embedding-001, 1024 dims)
 • LangGraph checkpoints
```

**The four rules the whole design protects**

1. **Clerk proves identity; the Trellis database decides permissions.** User and org come only from the verified Clerk token. Clerk roles grant nothing.
2. **`AccessScope` is built in one place, `resolve_scope()`**, and enforced inside shared data-access functions. REST endpoints and AI tools call the same functions, so they cannot disagree.
3. **The AI never receives the scope.** It is passed to LangGraph as runtime context, never stored in the agent state or in tool schemas.
4. **The browser never calls FastAPI.** Everything goes through the Next.js server.

**How a chat message flows:** the browser posts to the Next.js route, which forwards it with the user's token to `POST /api/v1/chat/sessions/{id}/message`. The agent (a ReAct loop with a step budget) calls typed tools such as `search_documents`, `get_tasks` and `get_team_summary`. The answer streams back as Server-Sent Events (SSE). Write tools pause for a Confirm card.

**Project layout**

```
Trellis/
├── frontend/   Next.js app (pages, UI, server actions, generated API types)
├── backend/    FastAPI app (api/, services/, scope/, agent/, models/, alembic/)
├── docs/       Agent and issue-tracker notes
├── .scratch/   Design tickets and decision log (the "why" behind the code)
└── trellis-prd.md   Product requirements
```

## 5. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query, react-hook-form + zod, Recharts, React Flow |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| AI | LangGraph, LangChain, Google Gemini (chat and embeddings), DeepEval (evaluation), LangSmith (optional tracing) |
| Database | NeonDB (serverless Postgres) with pgvector |
| Auth | Clerk (identity, organizations, invitations) |
| File storage | UploadThing |
| Protection | Arcjet (rate limits, bot protection) |
| Tooling | pnpm, uv, openapi-typescript and hey-api (typed client and zod schemas from OpenAPI) |

## 6. Prerequisites

Install on your machine:

- **Node.js 20+** and **pnpm** (`npm i -g pnpm`)
- **Python 3.11+** and **[uv](https://docs.astral.sh/uv/)**
- **Git**

Create free accounts and keep these handy:

| Service | What you need from it |
|---|---|
| [Neon](https://neon.tech) | A project and database. Copy the **direct** and **pooled** connection strings. |
| [Clerk](https://clerk.com) | An application with **Organizations enabled**. Copy the publishable key, secret key and Frontend API URL (the issuer). |
| [Google AI Studio](https://aistudio.google.com) | An API key for Gemini (chat and embeddings). |
| [UploadThing](https://uploadthing.com) | An app token. |
| [Arcjet](https://arcjet.com) | A site key. |
| [LangSmith](https://smith.langchain.com) | *Optional.* Only if you want to trace agent runs. |

## 7. Setup

> Open two terminals, one for the backend and one for the frontend. The backend must be running before the frontend can load any data.

### 7.1 Get the code

```bash
git clone https://github.com/Invincible-2005/Trellis.git
cd Trellis
```

### 7.2 Backend

```bash
cd backend
uv sync                     # creates .venv and installs everything
```

Create `backend/.env`:

```env
# Database (Neon)
DATABASE_URL=postgresql://...          # direct connection, used for migrations
DATABASE_URL_POOLED=postgresql://...   # pooled connection, used by the app

# Clerk
CLERK_SECRET_KEY=sk_test_...
CLERK_ISSUER=https://your-instance.clerk.accounts.dev

# Gemini
GOOGLE_API_KEY=...

# Optional: LangSmith tracing (off by default)
# LANGSMITH_TRACING=true
# LANGSMITH_API_KEY=...
# LANGSMITH_PROJECT=trellis-dev
```

Everything else (model names, allowed upload hosts, `FRONTEND_URL`, and so on) has a sensible default in `backend/app/core/config.py`.

Create the tables (this also turns on the `pgvector` extension) and start the server:

```bash
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

The API runs at <http://127.0.0.1:8000>, with interactive docs at <http://127.0.0.1:8000/docs>.

> **Windows note:** start the backend with `uvicorn app.main:app --reload` or `fastapi dev`, as shown above. The chat memory connection needs the selector event loop these commands set up.

### 7.3 Frontend

```bash
cd frontend
pnpm install
```

Create `frontend/.env`:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Where the Next.js server finds FastAPI (server-side only)
FASTAPI_INTERNAL_URL=http://127.0.0.1:8000

# Arcjet
ARCJET_KEY=ajkey_...
ARCJET_ENV=development

# UploadThing
UPLOADTHING_TOKEN=...
```

Start the app:

```bash
pnpm dev
```

Open <http://localhost:3000>.

### 7.4 First run

1. Click **Sign up** and create your account.
2. Create an organization. Trellis sends you to **/onboarding**, which creates your org with a protected root **Admin** role and makes you its Admin.
3. In **Admin → Roles**, add a few roles (for example HR, Manager, Employee).
4. In **Admin → Members**, invite people and give them roles.
5. In **Admin → Documents**, upload a policy file. Wait for its status to turn **ready**.
6. Open **Chat** and ask a question about that document.

### 7.5 Useful commands

| Where | Command | What it does |
|---|---|---|
| `backend` | `uv run python scripts/export_openapi.py` | Regenerate `openapi.json` after changing an endpoint. |
| `frontend` | `pnpm api:generate` | Regenerate the typed API client and zod schemas from `openapi.json`. Run it after the line above. |
| `backend` | `uv run alembic revision --autogenerate -m "message"` | Create a migration after changing a model. |
| `backend` | `uv run pytest` | Run the backend tests. |
| `frontend` | `pnpm lint` / `pnpm build` | Lint and production build. |

### 7.6 Troubleshooting

| Problem | Likely cause |
|---|---|
| Pages show a "not provisioned" or redirect to onboarding | The Clerk org exists but `/onboarding` has not been completed yet. |
| Every request returns `invalid_token` | `CLERK_ISSUER` in `backend/.env` does not match your Clerk Frontend API URL. |
| Frontend cannot reach the API | The backend is not running, or `FASTAPI_INTERNAL_URL` is wrong. |
| Uploaded document stays "processing" or turns "failed" | Missing `GOOGLE_API_KEY`, or the Gemini free-tier quota (about 1,000 embeddings a day) is used up. |
| Chat stops answering | Gemini free-tier request limit; wait or switch `CHAT_MODEL` in `backend/.env`. |

## 8. Learn more

- [`trellis-prd.md`](trellis-prd.md): product requirements.
- [`.scratch/trellis/map.md`](.scratch/trellis/map.md): the system map and the list of settled decisions.
- [`.scratch/trellis/issues/`](.scratch/trellis/issues/): the design tickets, including the decision log (ticket 12).
- [`frontend/README.md`](frontend/README.md) and [`backend/README.md`](backend/README.md): day-to-day notes for each half.
