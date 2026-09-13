# 01 - Lock Core Tech Stack & Communication Protocol

- **Type**: `task`
- **Status**: `resolved`
- **Assignee**: Team Lead
- **Blocked by**: None

## Question

What is the exact tech stack and inter-service communication protocol between frontend and backend to support a 3-person team with 1 Frontend, 1 Backend+DB, and 1 Agentic Lead?

## Answer

- **Frontend**: Next.js 14/15 (App Router, TypeScript, TailwindCSS, shadcn/ui, Recharts)
- **Backend & Agent Engine**: FastAPI (Python 3.11+, SQLModel / SQLAlchemy, LangGraph, Pydantic v2)
- **Database & Vectors**: NeonDB (PostgreSQL with `pgvector` extension)
- **Identity & Auth**: Clerk (handles user authentication, session JWTs passed to FastAPI in `Authorization: Bearer <token>`)
- **API Contract**: FastAPI auto-generated OpenAPI JSON -> `@hey-api/openapi-ts` or `openapi-typescript` for end-to-end typed fetch client in Next.js.
- **Why**: Python is non-negotiable for state-of-the-art LangGraph + pgvector agentic pipelines. Next.js gives the frontend developer a rich ecosystem without touching Python.
