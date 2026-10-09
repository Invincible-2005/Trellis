# 10 - LangGraph Graph Code Structure & Guardrail Integration

- **Type**: `prototype`
- **Status**: `resolved`
- **Assignee**: Agentic Lead
- **Blocked by**: 04

## Question

What is the exact LangGraph `StateGraph` code skeleton — node functions, conditional edges, and Guardrails AI hook points — that the team will use as the shared implementation target for the agentic chat workflow?

---

## Answer

> ⚠️ **Updated 2026-10-09 (ticket 12 D19, lean graph).** Parts of the topology below are superseded:
> - Router is **2-way `read` | `write`**; the `conversational` route is removed (the read agent may answer without tools).
> - Relevancy grader + rewrite loop run **only after `search_documents`**, not after `get_tasks` / `get_team_summary`.
> - The read agent's final message is the answer; no separate Synthesis LLM call.
> - Groundedness is a **code check** (cited chunk IDs ⊆ this turn's `retrieved_chunk_ids`), not an LLM grader.
> - Per-turn state fields are reset on every invocation; the LLM sees a trimmed history (last ~10 turns).
> - **D20:** the answer streams live; the citation check runs after it and only verified citations are sent. The **Post-Graph Output Guardrail is removed** (scope is enforced at the tools, so the stream can't leak out-of-scope data).
> - **D21:** the Pre-Graph Input Gate no longer uses Guardrails AI and never checks PII. It is a small phrase-list injection check that only flags (`injection_suspected` in the audit log), plus a ~4,000-character limit (`400 message_too_long`).
> - **D22:** "HITL Pattern A (conversational confirmation)" is replaced. All three write tools store a `pending_action`, the graph pauses with `interrupt()`, SSE sends `confirm`, and the user's Confirm/Cancel click resumes it (`{"resume": ...}` on the same message endpoint). Permissions are re-checked on confirm.
> - **D7:** models are Gemini Flash (`CHAT_MODEL`) and Flash-Lite (`ROUTER_MODEL`) via `init_chat_model`. `give_strike` / `give_commendation` also take `team_id`.
> The original text is kept below for history.

> **Built 2026-10-09 (agent slices 1–2, read path):** `app/services/tasks.py` (`list_tasks`, `team_summary`, D24) next to `app/services/documents.py::search_chunks`; `app/agent/tools.py`, `prompts.py`, `graph.py`; optional `scripts/try_agent.py`. Implementation choices (no decision needed):
> - Tools get the scope with `get_runtime(AgentContext)`, not an injected `ToolRuntime` argument (that makes LangChain run `AccessScope` through Pydantic and log warnings). Either way it is outside the LLM's tool schema.
> - Citations are 8-hex tags of the chunk id, e.g. `[3f9a12bc]`; `check_citations` maps tags back to this turn's `retrieved_chunks`.
> - `search_documents` returns its chunks as the ToolMessage `artifact`; a `collect` node copies them into state and counts tool calls.
> - The grader runs on Flash-Lite and is skipped (= not relevant) when the search returned nothing. `rewrite` re-runs the search itself and **replaces** the last search ToolMessage (same id), so no synthetic tool calls enter the history.
> - Write intent goes to a placeholder reply until slice 4 (write tools + `interrupt()`, D22).
> - Verified: offline graph paths (found after rewrite, not found after 2 rewrites, 8-call budget, invented citation dropped, per-turn reset) and live Gemini (greeting, write routing). Not yet run against the database (Neon was unreachable from the dev machine).

### 1. High-Level Graph Topology & Node Contracts

The graph operates as an intentional hybrid: a **ReAct execution engine bounded by deterministic guardrail routing**.

```
                           [Incoming Query + Auth]
                                      │
                                      ▼
                        [Pre-Graph Guardrail: Input Check]
                        (Guardrails AI: PII & Injection)
                                      │
                                      ▼
                             [Router Node]
                       (Pydantic Structured Output)
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
    "conversational"             "retrieve"                  "write"
            │                         │                         │
            │                         ▼                         ▼
            │               [Retrieve ReAct Node]         [Write Action Node]
            │               (search_documents,            (create_task,
            │                get_tasks,                    give_strike,
            │                get_team_summary)             give_commendation)
            │                         │                         │
            │                         ▼                         │
            │               [Relevancy Grader Node]             │
            │                         │                         │
            │            ┌────────────┴────────────┐            │
            │            ▼                         ▼            │
            │       [Relevant]              [Not Relevant]      │
            │            │                         │            │
            │            │                rewrites < 2?         │
            │            │                 ┌───────┴───────┐    │
            │            │                 ▼               ▼    │
            │            │           [Query Rewrite]  [Refusal] │
            │            │                 │           (Plain)  │
            │            │                 ▼               │    │
            │            │          (loop back to)         │    │
            │            │           [Retrieve]            │    │
            │            ▼                                 ▼    │
            └────────────►───────[Synthesis Node]◄─────────┴────┘
                                       │
                                       ▼
                            [Groundedness Grader]
                                       │
                                       ▼
                       [Post-Graph Guardrail: Output Check]
                                       │
                                       ▼
                               [SSE Stream Emit]
```

---

### 2. Node Specifications & Engineering Decisions

#### Node 1: Pre-Graph Sanitizer (Input Gate)
* **Type:** Fast deterministic filter (Guardrails AI / Regex).
* **Duty:** Scans for prompt injection attacks and unmasked PII *before* touching LLM tokens or SQLite checkpointers.
* **Failure Handling:** Immediate HTTP 400 / error SSE frame with audit log entry.

#### Node 2: Router Node (`classify_intent`)
* **Type:** Fast LLM with Pydantic Structured Output (`IntentCategory`: `conversational`, `retrieve`, `write`).
* **Compound Queries:** Resolved as **"Retrieve inside Write"**. If a prompt involves any mutation (e.g. *"Check leave records and issue a strike"*), it routes directly to `write`. The write tool internally performs any necessary policy retrieval.

#### Node 3: Retrieve Node (`retrieve_agent`)
* **Type:** ReAct LLM bound to typed tools with server-injected `AccessScope`:
  * `search_documents(query)`: Vector similarity search using **HNSW Cosine Distance (`<=>`)** in pgvector, with scope `WHERE` filter embedded in the SQL query.
  * `get_tasks(filters)`: Relational queries over `tasks` table with mandatory `team_id IN (scope.allowed_teams)`.
  * `get_team_summary()`: Relational rollups/aggregations bounded by `allowed_teams`.
* **Zero Raw SQL:** The LLM cannot craft raw SQL queries.

#### Node 4: Relevancy Grader & Query Rewrite Loop
* **Duty:** Verifies retrieved chunks address the user prompt.
* **Max Rewrite Limit (2x):** If after 2 rewrites the context is still insufficient, the graph routes to a **Plain LLM Refusal Node** (no tools bound).
* **400 Error Prevention:** Transitioning to a plain LLM prevents dangling `tool_calls` without matching `ToolMessage`s, avoiding API provider 400 Bad Request errors.

#### Node 5: Write Node (`write_action`)
* **Entity Disambiguation:** Chat UI supports `@user` / `@team` mention tokens providing exact UUIDs (`user:c4a8...`) to prevent name hallucination.
* **Slot Filling:** If parameters are missing (e.g., no deadline specified), the LLM responds conversationally without invoking DB mutations.
* **Tools:**
  * `create_task(...)`: Verifies `scope.has_permission("assign_task")` for target team.
  * `give_commendation(...)`: Validates hierarchy check (caller above target or same-team peer).
  * `give_strike(...)`: 
    1. Verifies caller is hierarchically above target.
    2. Runs internal RAG retrieval against policy/SOP docs in pgvector.
    3. Evaluates if the reason is a policy-compliant infraction.
    4. **HITL Pattern A (Conversational Confirmation):** Explains policy validation result and requests user confirmation prior to DB commit.

#### Node 6: Groundedness & Output Sanitizer
* Verifies final claims trace back to `retrieved_chunk_ids`.
* Guardrails AI checks final response for accidental scope or PII leakage before streaming.

---

## Context pointer (for map.md)

Resolves ticket **10**. Completely defines the LangGraph execution topology, tool boundaries, and HITL patterns. Unblocks implementation of ticket **08** and ticket **09**.
