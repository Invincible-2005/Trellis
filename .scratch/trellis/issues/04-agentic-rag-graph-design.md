# 04 - Agentic RAG Graph Architecture (LangGraph)

- **Type**: `prototype`
- **Status**: `resolved`
- **Assignee**: Agentic Lead
- **Blocked by**: 03

## Question

How should the LangGraph agent state machine be structured to enforce structural guardrails?
1. **Decision Node**: Classify intent (conversational vs. workspace retrieval vs. action).
2. **Tool Execution Node**: Bind tools (`search_documents`, `get_tasks`, `get_team_summary`). Crucially: the tool receives the server-validated `AccessScope` directly from FastAPI context, NOT from LLM parameters.
3. **Relevancy & Groundedness Nodes**: Grade retrieved chunks and verify final generated answers strictly cite authorized chunks.
4. **Zero-Result & Refusal Handling**: Clear and safe responses when queries target out-of-scope data without leaking existence of unauthorized files.

---

## Answer

> ⚠️ **Partly superseded (2026-10-08):** The graph topology below is replaced by **ticket 10**
> (pre/post guardrails, 3-way Router `conversational`/`retrieve`/`write`, separate Retrieve and
> Write nodes, plain-LLM refusal after 2 rewrites instead of "answer with what we have").
> Still valid from this ticket: the guardrails table, tool list, SSE event *types*, step budget (8),
> rewrite cap (2), and the checkpointer/thread_id design. Scope now travels via runtime context, not state (ticket 12 D1).

### Graph Pattern: ReAct (Agentic) with Structural Guardrails

The LangGraph graph runs as a **ReAct agentic loop** — the LLM reasons and calls tools iteratively until it can synthesize a complete answer. This is the primary architectural commitment: agentic, not hardcoded. The guardrail layer constrains the loop without removing its agency.

```
FastAPI POST /api/v1/chat/sessions/{session_id}/message  (SSE)
    │
    ▼
[Intent Classifier Node]
    │
    ├── conversational/meta ──────────────────────────────► [Synthesis Node] → SSE stream
    │
    └── workspace query / action
            │
            ▼
    [ReAct Agent Node]  ◄──────────────────────────────────┐
    (tool-bound LLM)                                        │
            │                                               │
            ├─ tool calls (typed, scope-injected) ──► [Tool Executor Node]
            │                                               │
            │   Tools available:                            │
            │   • search_documents(query)                   │
            │   • get_tasks(filters)                        │
            │   • get_team_summary()                        │
            │   • create_task(...)                          │
            │   • give_strike(to_user_id, reason)           │
            │   • give_commendation(to_user_id, reason)     │
            │                                               │
            │◄──── tool results ────────────────────────────┘
            │
            ├── [still needs tools + budget remaining] ─────► loop back
            │
            └── [ready to answer OR budget exhausted]
                        │
                        ▼
            [Relevancy Grader Node]
            Grade retrieved chunks against the query.
                        │
                        ├── grade: relevant ──────────────────► [Groundedness Check Node]
                        │
                        └── grade: irrelevant
                                    │
                                    ├── rewrites < 2 ──────────► [Query Rewrite Node] ─► loop back to ReAct
                                    │
                                    └── rewrites == 2 ──────────► [Synthesis Node] (answer with what we have)
                                                                        │
                                                                        ▼
                                                            [Groundedness Check Node]
                                                            Verify every claim traces to an authorized chunk.
                                                                        │
                                                                        ▼
                                                            [SSE Stream Node]
                                                            Emit typed events → Next.js BFF proxy
```

---

### Guardrails Inside the ReAct Loop

| Risk | Guardrail |
|---|---|
| Infinite tool loops | Hard step budget: max **8 tool calls** per query. Graph terminates to Synthesis when exhausted. |
| Tool hallucination (wrong tool name / args) | Strict Pydantic `args_schema` per tool. LangGraph rejects malformed calls before execution. |
| Prompt injection widening scope | `AccessScope` is resolved by FastAPI `Depends(get_scope)` and handed to the graph via **runtime context** (ticket 03 §6). It is frozen, never checkpointed, and the LLM-visible tool schemas **never contain scope**. Injection cannot widen it. |
| Redundant tool calls | Loop detection: same tool + same args twice in one session → short-circuit to Synthesis. |
| Hallucinated answer | Groundedness check: every claim validated against `retrieved_chunk_ids`. Ungrounded claims cut or qualified. |
| Out-of-scope data leakage | SQL-layer filtering (ticket 02). Zero-result path: agent states "I couldn't find authorized documents" — never infers from absence. |

---

### Agent State Shape

> **Updated 2026-10-08 (ticket 12 D1):** `scope` and `audit_id` moved OUT of `AgentState` into the
> runtime context (`AgentContext`, see ticket 03 §6). `AgentState` is checkpointed to SQLite, so it holds
> only conversation + loop bookkeeping — never authorization data. Shape below matches `backend/app/agent/state.py`.

```python
from typing import Annotated, Optional
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages

class AgentState(TypedDict):                       # checkpointed per thread
    messages: Annotated[list, add_messages]        # full conversation + tool messages
    intent: Optional[str]                          # "conversational" | "retrieve" | "write" (ticket 10 router)
    retrieved_chunks: list[str]                    # chunk text for grader / synthesis
    retrieved_chunk_ids: list[str]                 # groundedness + audit
    rewrite_count: int                             # caps query rewrites at 2
    step_count: int                                # caps total tool calls at 8
    groundedness_passed: Optional[bool]

@dataclass(frozen=True)
class AgentContext:                                # per request, NEVER checkpointed
    scope: AccessScope
    audit_id: UUID
```

---

### Tool Definitions (abbreviated)

The LLM-visible schema of every tool contains **only business arguments**. Tools obtain the scope from
the LangGraph runtime (`runtime.context.scope`) and pass it to the shared data-access functions
(ticket 03 §1a) — the same functions REST endpoints use.

```python
# What the LLM sees                          # What the tool does internally
search_documents(query)                      # search_chunks(db, ctx.scope, embed(query))
get_tasks(filters)                           # list_tasks(db, ctx.scope, filters)
get_team_summary()                           # team_summary(db, ctx.scope)
create_task(title, description, team_id,     # require ctx.scope.can("assign_task", team_id)
            assigned_to_user_id, deadline)
give_strike(to_user_id, reason)              # require can("give_strike", team) + hierarchy DB check
give_commendation(to_user_id, reason)        # hierarchy DB check
```

Exact injection mechanism (`ToolRuntime` parameter vs `get_runtime()`) to be confirmed against the
installed LangGraph 1.2.11 at implementation time.

---

### SSE Event Schema (FastAPI → Next.js BFF → Browser)

| Event type | Payload | Purpose |
|---|---|---|
| `status` | `{"step": "classifying_intent" \| "searching_documents" \| "grading_relevance" \| "rewriting_query" \| "synthesizing"}` | Feeds `thinking-stepper.tsx` |
| `tool_call` | `{"tool": "search_documents", "status": "start" \| "end"}` | Shows active tool |
| `token` | `{"content": "..."}` | Incremental answer tokens |
| `citations` | `[{"doc_id": "...", "title": "...", "chunk_index": 1}]` | Feeds `citation-badge.tsx` |
| `error` | `{"message": "..."}` | Graceful error display |
| `done` | `{"audit_id": "..."}` | Stream end + audit trace ID |

Schema is extensible — additional `status` step values can be added without breaking the frontend contract.

> Note (2026-10-08): ticket 10 adds nodes with no `status` step yet (input guardrail, router,
> write action, refusal, groundedness, output guardrail). Define their step names in ticket 09.

---

### Memory: SQLite Checkpointer (Dev/MVP)

```python
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Composite thread_id for strict org-level isolation
thread_id = f"{org_id}:{user_id}:{session_id}"

async with AsyncSqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    graph = build_agent_graph(checkpointer=checkpointer)
    result = await graph.ainvoke(state, config={"configurable": {"thread_id": thread_id}})
```

**Session model**: Multiple named threads per user per org. Users create, name, and switch between conversations. Sessions are scoped to `user_id` — users see only their own threads. Migration path to `AsyncPostgresSaver` (NeonDB) is a one-line swap — same interface.

---

### `request_access` Escalation Tool — Deferred

Kept in the map's **Not yet specified**. Zero-result refusal ("I couldn't find authorized documents") is the safe MVP behavior. The full escalation workflow (notification loop, approval UI, temporary scope grant) is stretch/v2.

---

## Context pointer (for map.md)

Resolves into new tickets **08** (SQLite checkpointer & chat session management) and **09** (SSE streaming implementation — FastAPI emitter + Next.js BFF contract). Unblocks tickets **05** and **07**.
