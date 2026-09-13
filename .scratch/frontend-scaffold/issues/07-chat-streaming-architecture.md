# 07 — Chat Interface Streaming Architecture
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
