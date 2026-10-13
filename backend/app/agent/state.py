"""
AgentState, AgentContext and the per-turn reset helper for the Trellis
LangGraph agent (ticket 10, as updated by ticket 12 D19–D22).

Message flow (D19, lean graph):
    input check (outside the graph, D21) → Router (read | write)
      read  → read agent (search_documents, get_tasks, get_team_summary)
              → relevancy grader + rewrite (max 2), only after search_documents
              → answer streams live → code citation check (D20)
      write → write agent prepares a PendingAction → interrupt() for the
              user's Confirm / Cancel click (D22) → re-check scope → write

Architectural invariant (Ticket 03 §6 / Ticket 12 D1):
    AccessScope is NEVER stored in AgentState. AgentState is checkpointed
    (Postgres, D11), so a stored scope would be persisted and reused stale.
    FastAPI resolves it via Depends(get_scope) and passes it per request through
    LangGraph runtime context (context_schema=AgentContext, invoked with
    context=AgentContext(scope=..., audit_id=...)). Nodes and tools read it from
    the runtime; LLM-visible tool schemas never contain it, so the LLM can never
    read, widen, or forge its own permissions.
"""

import uuid
from dataclasses import dataclass
from typing import Annotated, Any, Literal, Optional

from langchain_core.messages import HumanMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from app.scope.resolver import AccessScope


# ── Runtime context (per request, never checkpointed) ────────────────────────

@dataclass(frozen=True)
class AgentContext:
    """
    Passed to every graph run as `context=AgentContext(...)`.

    scope : AccessScope
        Resolved by FastAPI for THIS request. On a Confirm click (D22) the
        resume request brings a fresh scope, so a role change made while the
        card was open is caught.
    audit_id : UUID
        The audit_log row for this turn. Sent back in the SSE `done` event.
    """

    scope: AccessScope
    audit_id: uuid.UUID


# ── Pieces of state ──────────────────────────────────────────────────────────

class RetrievedChunk(TypedDict):
    """One document chunk returned by search_documents (already scope-filtered)."""

    chunk_id: str
    document_id: str
    title: str          # shown on the citation badge
    chunk_index: int
    text: str


WriteTool = Literal["create_task", "give_strike", "give_commendation"]


class CardLine(TypedDict):
    label: str                 # e.g. "Assignee"
    value: str                 # e.g. "Karan Mehta"


class PendingAction(TypedDict):
    """
    A write the agent has prepared but NOT saved (D22).
    Shown to the user as a Confirm / Cancel card via the SSE `confirm` event.
    On confirm, exactly these args are written after a fresh permission check.
    summary and details are written by code from args and database names, never
    by the LLM, so the card always matches what is saved (D45).
    """

    tool: WriteTool
    args: dict[str, Any]       # validated tool args (JSON-safe), incl. team_id and target user_id
    summary: str               # card heading, e.g. "Create task for Karan Mehta"
    details: list[CardLine]    # card lines: title, team, deadline, …
    policy: Optional[dict]     # give_strike only: policy check result + policy chunk ids


# ── AgentState (checkpointed per thread) ─────────────────────────────────────

class AgentState(TypedDict):
    """
    What the agent remembers within one chat thread.

    Only `messages` carries over between turns. Every other field belongs to
    the current turn and is reset by `new_turn_input()` (they are checkpointed,
    so without the reset turn 2 would start with turn 1's counters).

    Fields
    ------
    messages : list
        Full conversation history as LangChain BaseMessage objects.
        Uses the `add_messages` reducer — appends new messages rather than
        replacing the list on every state update (prevents accidental wipes).
        The LLM is given a trimmed view (last ~10 turns, old tool outputs
        dropped, D19); the full history stays in the checkpoint.

    intent : "read" | "write" | None
        Set by the Router Node. Write tools are bound only on "write".
        Small talk is "read": the read agent may answer without a tool.

    retrieved_chunks : list[RetrievedChunk]
        Chunks returned by search_documents this turn. Task and team-summary
        results are NOT chunks: they reach the agent as tool messages only and
        are never cited.

    verified_citation_ids : list[str]
        Set by the code citation check after the answer has streamed (D20):
        the cited chunk ids that really are in `retrieved_chunks`. Only these
        are sent in the SSE `citations` event.

    dropped_citation_count : int
        Citations the answer made that were not retrieved this turn. If > 0,
        a short "couldn't be verified" note is streamed before `done`.

    pending_action : PendingAction | None
        The write waiting for the user's Confirm / Cancel click (D22). The graph
        is paused with interrupt() while it is set. A new normal message first
        cancels it (services/chat.py), so it never leaks into the next turn.

    rewrite_count : int
        Incremented each time the Query Rewrite Node fires (search_documents
        only). If rewrite_count >= 2 and chunks are still not relevant → plain
        LLM refusal, no tools bound. (Ticket 04: max 2 rewrites.)

    step_count : int
        Incremented on every tool call by the read or write agent.
        If step_count >= 8 → stop calling tools and answer. (Ticket 04: max 8.)
    """

    # ── Core ──────────────────────────────────────────────────────────────────
    messages: Annotated[list, add_messages]

    # ── Routing ───────────────────────────────────────────────────────────────
    intent: Optional[Literal["read", "write"]]

    # ── Retrieval results ─────────────────────────────────────────────────────
    retrieved_chunks: list[RetrievedChunk]

    # ── Citation check (code, D20) ────────────────────────────────────────────
    verified_citation_ids: list[str]
    dropped_citation_count: int

    # ── Write confirmation (D22) ──────────────────────────────────────────────
    pending_action: Optional[PendingAction]

    # ── Loop guards (conditional edge inputs) ─────────────────────────────────
    rewrite_count: int
    step_count: int


def new_turn_input(message: str) -> dict:
    """
    Graph input for a new user message: appends the message and resets every
    per-turn field. Always use this to start a turn (not for a Confirm/Cancel
    resume, which continues the paused turn with Command(resume=...)).
    """
    return {
        "messages": [HumanMessage(content=message)],
        "intent": None,
        "retrieved_chunks": [],
        "verified_citation_ids": [],
        "dropped_citation_count": 0,
        "pending_action": None,
        "rewrite_count": 0,
        "step_count": 0,
    }
