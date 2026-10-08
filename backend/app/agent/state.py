"""
AgentState — the shared mutable state flowing through every node in the
Trellis LangGraph ReAct graph.

Architectural invariant (Ticket 03 §6 / Ticket 12 D1):
    AccessScope is NEVER stored in this state — this state is checkpointed to
    SQLite, so a stored scope would be persisted and reused stale.
    FastAPI resolves it via Depends(get_scope) and passes it per request through
    LangGraph runtime context (context_schema=AgentContext, invoked with
    context=AgentContext(scope=..., audit_id=...)). Nodes and tools read it from
    the runtime; LLM-visible tool schemas never contain it, so the LLM can never
    read, widen, or forge its own permissions.
"""

from typing import Annotated, Optional
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    Single source of truth for one turn of the agentic loop.

    Fields
    ------
    messages : list
        Full conversation history as LangChain BaseMessage objects.
        Uses the `add_messages` reducer — appends new messages rather than
        replacing the list on every state update (prevents accidental wipes).

    intent : str | None
        Set by the Router Node after classifying the user's query.
        Possible values: "conversational" | "retrieve" | "write"
        None until the router has run.

    retrieved_chunks : list[str]
        Raw text content of chunks returned by search_documents / get_tasks.
        Passed to the Relevancy Grader and then to the Synthesis Node.

    retrieved_chunk_ids : list[str]
        UUIDs of the retrieved DocumentChunk rows.
        Stored separately so the Groundedness Check Node can validate that
        every claim in the final answer traces back to an authorized chunk
        without re-querying the database.

    rewrite_count : int
        Incremented each time the Query Rewrite Node fires.
        Conditional edge: if rewrite_count >= 2 → route to Plain LLM Refusal,
        not back to the Retrieve Node. Prevents infinite rewrite loops and
        the associated token burn. (Ticket 04 decision: max 2 rewrites.)

    step_count : int
        Incremented each time a tool is invoked by the Retrieve or Write node.
        Conditional edge: if step_count >= 8 → force synthesis / abort.
        Guards against runaway ReAct loops. (Ticket 04 decision: max 8 calls.)

    groundedness_passed : bool | None
        Set by the Groundedness Check Node after comparing the Synthesis
        Node's output against retrieved_chunk_ids.
        None = not yet evaluated.
        True = every claim is grounded in an authorized chunk.
        False = ungrounded claim detected → re-synthesis or refusal.
    """

    # ── Core ──────────────────────────────────────────────────────────────────
    messages: Annotated[list, add_messages]

    # ── Routing ───────────────────────────────────────────────────────────────
    intent: Optional[str]

    # ── Retrieval results ─────────────────────────────────────────────────────
    retrieved_chunks: list[str]
    retrieved_chunk_ids: list[str]

    # ── Loop guards (conditional edge inputs) ─────────────────────────────────
    rewrite_count: int
    step_count: int

    # ── Output quality ────────────────────────────────────────────────────────
    groundedness_passed: Optional[bool]
