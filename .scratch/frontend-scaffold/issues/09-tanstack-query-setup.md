# 09 — TanStack Query Provider Placement and Usage Pattern
Type: grilling
Blocked by: 01, 03
Status: open

## Question

Where does the TanStack Query `QueryClientProvider` live, and what is the usage pattern that respects the BFF constraint?

Since the BFF pattern means all FastAPI calls are server-side, TanStack Query cannot be used in the usual way (direct API calls from the browser). Its role in this app is narrower:

Decisions to lock:
- `QueryClientProvider` placement: does it wrap the entire `(authenticated)` group layout, or just the specific pages/components that need it (chat, dashboard polling)?
- Pattern for initial data: Server Components fetch + pass as `initialData` to TanStack Query on the client? Or use `prefetchQuery` + dehydrate/hydrate pattern?
- Which specific features actually need TanStack Query in the MVP? (Chat streaming state, task polling, optimistic task status update?)
- Is there a risk of leaking the FastAPI client into client-side code via TanStack Query `queryFn`? What is the guardrail?
