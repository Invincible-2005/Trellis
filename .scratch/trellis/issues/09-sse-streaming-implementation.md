# 09 - SSE Streaming Implementation (FastAPI Emitter + Next.js BFF Contract)

- **Type**: `task`
- **Status**: `ready-for-agent`
- **Assignee**: Agentic Lead & Frontend Dev
- **Blocked by**: 04, 05

> Frontend half overlaps [frontend-scaffold/07](../../frontend-scaffold/issues/07-chat-streaming-architecture.md) — resolve them together.
> Order decided (ticket 12 D20): `token` frames stream live; after the answer ends, the code citation check runs, `citations` carries only verified chunks (plus a short "couldn't be verified" note as a final `token` if any were dropped), then `done`. No output guardrail.
> Write confirmation (ticket 12 D22): new event `confirm` `{"action", "summary", "policy"}` followed by `done`; the client resumes by POSTing `{"resume": "confirm" | "cancel"}` to the same message endpoint.
> `status` step names (2026-10-09): `checking_input`, `routing`, `searching_documents`, `looking_up_tasks`, `grading_relevance`, `rewriting_query`, `preparing_action`, `writing_answer`, `verifying_citations`.
> Endpoint decided (ticket 12 D2): `POST /api/v1/chat/sessions/{session_id}/message` returns the SSE stream.

## Question

How is the SSE streaming pipeline implemented end-to-end, from LangGraph node emissions in FastAPI to incremental UI updates in the Next.js chat interface?

Specifically:
- How does FastAPI emit typed SSE frames (`status`, `tool_call`, `token`, `citations`, `error`, `done`) from each LangGraph node in the ReAct graph?
- What is the exact FastAPI route signature for `POST /api/v1/chat/sessions/{session_id}/message` returning `StreamingResponse` with `text/event-stream`?
- How does the Next.js BFF Route Handler at `app/api/chat/sessions/[sessionId]/message/route.ts` proxy the stream using `openapi-fetch` with `parseAs: "stream"` (already decided in ticket 03)?
- How does the frontend consume the typed SSE frames to update: `thinking-stepper.tsx` (status/tool_call events), incremental text (token events), `citation-badge.tsx` (citations event)?
- How are errors and stream interruptions handled gracefully on both ends?
