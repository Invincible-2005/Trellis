# 07 - Role-Scoped Chatbot & Dashboard UI

- **Type**: `prototype`
- **Status**: `needs-triage`
- **Assignee**: Frontend Dev & Agentic Lead
- **Blocked by**: 04, 05

> **Tracked in detail by the frontend map (2026-10-08):** chat → [frontend-scaffold/07](../../frontend-scaffold/issues/07-chat-streaming-architecture.md),
> dashboard → [frontend-scaffold/08](../../frontend-scaffold/issues/08-dashboard-data-strategy.md). Resolve there; close this when both are resolved.

## Question

How should the user experience reflect role-based scoping in the UI?
- Chat interface with streaming responses, showing citations and retrieved document badges (only for authorized sources).
- Dashboard widgets (using Recharts) dynamically displaying metrics/tasks based on whether the logged-in user is an Employee (own tasks), Manager (team aggregate), or higher leadership (cross-team overview).
