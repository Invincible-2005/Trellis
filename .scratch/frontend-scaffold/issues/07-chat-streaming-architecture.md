# 07 — Chat Interface Streaming Architecture

> **Added 2026-10-09 (system ticket 12 D20/D22):** answers stream live; the final `citations` event carries only verified sources. A new `confirm` event means the agent wants to save a task/strike/commendation: show a card with the summary and **Confirm** / **Cancel**; the click POSTs `{"resume": "confirm" | "cancel"}` to the same message route and streams the result.
> **Added 2026-10-12 (system ticket 12 D41):** screen shape settled. `/chat` = new chat, `/chat/[sessionId]` = an existing chat; `(dashboard)/chat/layout.tsx` holds a hideable chat-list panel (plain panel, not a second shadcn Sidebar). Task discussions are "Comments" inside a task, not part of Chat.

> **Built 2026-10-12 (chat slice D):** browser side = plain `fetch` + `response.body` reader in `chat/_components/use-chat-stream.ts` (no library: `EventSource` can't POST). The BFF route passes FastAPI's JSON errors through unchanged; `req.signal` is forwarded so leaving the page stops the backend run. Events and step names: trellis ticket 09.

Type: grilling
Blocked by: 01, 03
Status: open

## Question

How does streaming SSE flow from FastAPI through Next.js to the browser in the BFF pattern?

The PRD specifies the chat interface uses streaming SSE with citation badges. Since the browser cannot call FastAPI directly (BFF), the stream must be proxied through a Next.js Route Handler.

Decisions to lock:
- Next.js Route Handler as SSE proxy: what does the exact response pipeline look like? (`ReadableStream` from FastAPI ? piped through Next.js ? `EventSource` or `fetch` with streaming in the browser)
- Client component for chat: how is streaming state managed? (`useChat` hook pattern, or manual `ReadableStreamDefaultReader`?)
- Citation badges: what data does FastAPI send alongside the stream chunks? (chunk IDs? source document title + role scope?)
- Message history: stored client-side only (session), or persisted to DB and fetched on load?
- Does the chat have a "thinking / tool calling" indicator while the agent is running its LangGraph steps?


## Already answered elsewhere (audit 2026-10-08)

- Message history: persisted server-side. `chat_sessions` metadata in NeonDB + LangGraph checkpoints keyed `{org_id}:{user_id}:{session_id}` (trellis/08). Fetch on load, not client-only.
- Thinking / tool-call indicator: yes. SSE `status` and `tool_call` events feed `thinking-stepper.tsx` (trellis/04 SSE schema).
- Citation payload: `citations` event = `[{doc_id, title, chunk_index}]` (trellis/04).
- BFF proxy: Route Handler with `openapi-fetch` `parseAs: 'stream'` (ticket 03 here).
- Still open: browser-side consumption (`fetch` + `ReadableStream` reader vs a hook), error/interrupt handling, and the exact endpoint path (trellis/12 D2). Resolve together with trellis/09.
