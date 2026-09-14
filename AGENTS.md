# Trellis

Role-Aware Agentic RAG Workspace — guardrails that support growth, not just block it.

## Core Directives for Agents

### 1. Holistic Project Awareness & Wayfinder Alignment
- **Check the Map First**: Before writing or modifying any code in `backend/` or `frontend/`, you **MUST** consult the Wayfinder map at [`.scratch/trellis/map.md`](file:///d:/Trellis/.scratch/trellis/map.md) and review the relevant tickets under [`.scratch/trellis/issues/`](file:///d:/Trellis/.scratch/trellis/issues/).
- **Protect Architectural Invariants**: Do not write siloed code for a single query or isolated task that contradicts settled decisions (e.g., hierarchical RBAC, `resolve_scope` backend enforcement, SQLAlchemy async patterns, typed OpenAPI contract). Every change must serve the long-term integrity of the whole system.
- **Explain & Confirm Approach Before Coding**: When a user asks to implement a feature or change code in `backend/` or `frontend/`, first explain the technical approach, cite which Wayfinder ticket/invariants it follows, and ask for the user's confirmation before executing file edits.

---

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` + `docs/adr/` at root. See `docs/agents/domain.md`.
