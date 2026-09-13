# Wayfinder Map: Trellis MVP Architecture & Build Roadmap

## Destination

A complete, working, role-aware agentic RAG workspace built by a 3-person team in 3 months. Features strict hierarchical access control (documents accessible only to the owning role and above; zero cross-team data leakage), an agentic RAG chatbot enforcing scope at the retrieval/tool layer, role-scoped dashboards, and an admin console for org/role configuration.

## Notes

- **Team**: 3 B.Tech CSE seniors (1 Frontend, 1 Backend+DB, 1 Agentic Workflows & System Architecture/Lead)
- **Timeline**: 3 months
- **Tracker**: Local Markdown (`.scratch/trellis/issues/`)
- **Key Skills to Consult**: `domain-modeling`, `grilling`
- **Core Architectural Invariant**: Never trust the LLM or frontend for security. Access scope resolution (`resolve_scope()`) happens strictly in the database/backend layer. The LLM calls typed tools with server-injected `AccessScope` — it never receives or manipulates the scope itself.

## Decisions so far

- [01-lock-core-tech-stack](./issues/01-lock-core-tech-stack.md): **Next.js + FastAPI + NeonDB (pgvector) + Clerk.** Python backend is non-negotiable for LangGraph/pgvector ecosystem. OpenAPI → `openapi-typescript` generates typed client for Next.js.
- [02-database-schema-hierarchical-rbac](./issues/02-database-schema-hierarchical-rbac.md): **Hybrid Role + Team model.** Roles are global to the org (tree, `parent_role_id`). Team membership stores a `role_id` per user per team — same user can be "Manager" in Team Alpha and "Employee" in Team Beta. Document access rule confirmed: a doc tagged to Role R is visible to R and all ancestors. A doc tagged to a Team is visible to all team members and all roles hierarchically above the team.
- [03-scope-resolution-engine](./issues/03-scope-resolution-engine.md): `resolve_scope(user_id)` returns `allowed_team_ids` + `accessible_role_ids` (user's roles per team + all ancestor role IDs). Cached with short TTL, explicitly invalidated on admin permission changes.
- [04-agentic-rag-graph-design](./issues/04-agentic-rag-graph-design.md): LLM is bound to typed tools — it does NOT generate raw SQL. Tools receive server-injected `AccessScope`, never from LLM parameters. Strike tool: `give_strike(to_user_id, reason)` checks hierarchy, RAG-validates reason against policy docs, then writes to DB.
- [Permission actions decided]: `create_role`, `create_team`, `add_member`, `upload_document`, `assign_task`, `give_strike`, `view_aggregate`.
- [Strike system]: Strike highlights to direct manager (role immediately above in team). Threshold (3 strikes) escalates to next level up. Commendation system is the positive counterpart. Dispute/appeal flow deferred to stretch.

## Not yet specified

- **Dynamic Access Escalation**: "Request access to document" workflow and notification loop (user requests, manager approves).
- **Scoring & Evaluation Suite**: Red-teaming benchmark and automated prompt injection defense testing.
- **Real-time vs. polling**: WebSocket vs. SSE vs. short-polling for live task/notification updates.
- **Document versioning**: What happens to vector chunks when an SOP document is updated?
- **Commendation system**: Positive counterpart to strikes — same structure, parallel implementation.
- **Strike appeal flow**: Employee disputes a strike → flagged to HR.

## Open questions

- **File storage**: Task submissions reference `file_url`. Where do files physically live — Vercel Blob, S3, or Cloudflare R2? (Needed before implementing upload endpoint.)
- **Embedding model**: `Vector(1536)` assumes OpenAI `text-embedding-3-small`. Confirm which embedding model before chunking pipeline is built.
- **Strike appeal flow UX**: Who sees the appeal and approves/dismisses? (Deferred to stretch but needs a decision before Strike UI is built.)

## Out of scope

- Payroll, legal HR, or full enterprise resource planning modules.
- Multi-tenant SaaS billing / Stripe integration (v1 = single org workspace).
- Natural language admin role configuration via chat ("AI admin").
- Full LLM-generated raw SQL queries (replaced by typed tool binding).
