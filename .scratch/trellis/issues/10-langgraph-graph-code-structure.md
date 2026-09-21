# 10 - LangGraph Graph Code Structure & Guardrail Integration

- **Type**: `prototype`
- **Status**: `resolved`
- **Assignee**: Agentic Lead
- **Blocked by**: 04

## Question

What is the exact LangGraph `StateGraph` code skeleton — node functions, conditional edges, and Guardrails AI hook points — that the team will use as the shared implementation target for the agentic chat workflow?

---

## Answer

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
