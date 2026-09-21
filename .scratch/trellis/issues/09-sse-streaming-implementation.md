# 09 - SSE Streaming Implementation (FastAPI Emitter + Next.js BFF Contract)

- **Type**: `task`
- **Status**: `ready-for-agent`
- **Assignee**: Agentic Lead & Frontend Dev
- **Blocked by**: 04, 05

## Question

How is the SSE streaming pipeline implemented end-to-end, from LangGraph node emissions in FastAPI to incremental UI updates in the Next.js chat interface?

Specifically:
- How does FastAPI emit typed SSE frames (`status`, `tool_call`, `token`, `citations`, `error`, `done`) from each LangGraph node in the ReAct graph?
- What is the exact FastAPI route signature for `POST /api/v1/chat/stream` returning `StreamingResponse` with `text/event-stream`?
- How does the Next.js BFF Route Handler at `app/api/chat/stream/route.ts` proxy the stream using `openapi-fetch` with `parseAs: "stream"` (already decided in ticket 03)?
- How does the frontend consume the typed SSE frames to update: `thinking-stepper.tsx` (status/tool_call events), incremental text (token events), `citation-badge.tsx` (citations event)?
- How are errors and stream interruptions handled gracefully on both ends?
