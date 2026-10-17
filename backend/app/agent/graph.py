"""
The Trellis LangGraph agent (ticket 10 as updated by ticket 12 D19–D22, D45).

    START → router ─ read  → read_agent ⇄ tools → collect
              │                  │                  │ searched documents?
              │                  │                  ▼
              │                  │                grade ─ relevant ────────→ read_agent
              │                  │                  ├─ not, rewrites < 2 → rewrite → grade
              │                  │                  └─ not, rewrites used → not_found
              │                  │                     (or back to read_agent, without the
              │                  │                      search tool, if other lookups ran: D52)
              │                  ▼ (no tool calls: final answer)            │
              │            check_citations ←────────────────────────────────┘
              │                  ▼
              └ write → write_agent ─ no tool call (asks for what's missing) ──────→ END
                              └ proposes a change → prepare_action ─ refused (says why) → END
                                                         └ ok → confirm_action → END
                                                                 (pauses with interrupt() until
                                                                  the user's Confirm / Cancel)

LLM calls per message: router (1) + read agent (1–3) + grader only after a
document search; a change costs router + write agent (2). The citation check,
the rule checks, the card text and the replies after a click are code
(D19/D20, D45).

AccessScope arrives per run as context=AgentContext(...) and is read by the tools
and the rewrite node from the runtime; it is never in AgentState (D1).
"""

import re
from datetime import date
from functools import cache
from typing import Literal

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt
from pydantic import BaseModel

from app.agent import actions, prompts
from app.agent.state import AgentContext, AgentState, RetrievedChunk
from app.agent.tools import READ_TOOLS, WRITE_TOOLS, citation_tag, run_document_search
from app.core.config import settings

MAX_STEPS = 8        # tool calls per message (ticket 04)
MAX_REWRITES = 2     # query rewrites per message (ticket 04)
HISTORY_TURNS = 10   # user turns the LLM sees (D19)
# 1 try + 2 retries. The SDK default (6) keeps a user waiting ~45 s when the free
# daily quota is used up, which no retry can fix.
LLM_MAX_RETRIES = 3


# ── Models (created on first use, so importing doesn't need the API key) ─────

@cache
def _chat_model():
    return init_chat_model(settings.CHAT_MODEL, api_key=settings.GOOGLE_API_KEY, max_retries=LLM_MAX_RETRIES)


@cache
def _router_model():
    """Flash-Lite: routing, grading and rewriting (cheap, higher free limits)."""
    return init_chat_model(
        settings.ROUTER_MODEL, api_key=settings.GOOGLE_API_KEY, temperature=0, max_retries=LLM_MAX_RETRIES
    )


class RouteDecision(BaseModel):
    intent: Literal["read", "write"]


class GradeDecision(BaseModel):
    relevant: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _question(messages: list[BaseMessage]) -> str:
    """The latest user message."""
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return message.text
    return ""


def _current_turn(messages: list[BaseMessage]) -> list[BaseMessage]:
    """Messages from the latest user message onwards."""
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            return list(messages[i:])
    return list(messages)


def _trim(messages: list[BaseMessage]) -> list[BaseMessage]:
    """
    What the LLM sees (D19): the last HISTORY_TURNS user turns. Earlier turns
    keep only user messages and final answers (no tool calls or tool output);
    the current turn is kept whole. The checkpoint keeps the full history.
    """
    human_indexes = [i for i, m in enumerate(messages) if isinstance(m, HumanMessage)]
    if not human_indexes:
        return list(messages)
    start = human_indexes[-HISTORY_TURNS] if len(human_indexes) >= HISTORY_TURNS else 0
    current = human_indexes[-1]
    earlier = [
        m for m in messages[start:current]
        if isinstance(m, HumanMessage) or (isinstance(m, AIMessage) and not m.tool_calls)
    ]
    return earlier + list(messages[current:])


def _last_tool_messages(messages: list[BaseMessage]) -> list[ToolMessage]:
    """The results of the most recent tools step (the ToolMessages at the end)."""
    results: list[ToolMessage] = []
    for message in reversed(messages):
        if not isinstance(message, ToolMessage):
            break
        results.append(message)
    return list(reversed(results))


def _add_chunks(existing: list[RetrievedChunk], new: list[RetrievedChunk]) -> list[RetrievedChunk]:
    seen = {c["chunk_id"] for c in existing}
    return existing + [c for c in new if c["chunk_id"] not in seen]


# ── Nodes ─────────────────────────────────────────────────────────────────────

async def router(state: AgentState) -> dict:
    """read | write (D19). Small talk is "read". On any error, "read" (no write tools)."""
    messages = state["messages"]
    previous = next(
        (m.text for m in reversed(messages[:-1]) if isinstance(m, AIMessage) and m.text), ""
    )
    prompt = prompts.ROUTER_PROMPT.format(context=previous[:500] or "(none)", message=_question(messages))
    try:
        decision = await _router_model().with_structured_output(RouteDecision).ainvoke(prompt)
        intent = decision.intent
    except Exception:
        intent = "read"
    return {"intent": intent}


async def read_agent(state: AgentState) -> dict:
    """The ReAct agent. Its last message without tool calls is the answer (D19)."""
    system = prompts.READ_AGENT_PROMPT.format(today=date.today().isoformat())
    if state["step_count"] >= MAX_STEPS:
        model = _chat_model()                       # no tools: must answer now
        system += "\n\n" + prompts.FINAL_ANSWER_NOTE
    elif state.get("documents_exhausted"):
        # Searches failed but other lookups found something (D52): no more searching
        model = _chat_model().bind_tools([t for t in READ_TOOLS if t.name != "search_documents"])
    else:
        model = _chat_model().bind_tools(READ_TOOLS)
    response = await model.ainvoke([SystemMessage(system), *_trim(state["messages"])])
    return {"messages": [response]}


async def collect(state: AgentState) -> dict:
    """After a tools step: count the calls and keep the document chunks found."""
    results = _last_tool_messages(state["messages"])
    new_chunks = [
        chunk
        for message in results
        if message.name == "search_documents" and message.artifact
        for chunk in message.artifact
    ]
    return {
        "step_count": state["step_count"] + len(results),
        "retrieved_chunks": _add_chunks(state["retrieved_chunks"], new_chunks),
    }


def after_collect(state: AgentState) -> Literal["grade", "read_agent"]:
    """Only a document search is graded; task and summary results are answered as-is (D19)."""
    searched = any(m.name == "search_documents" for m in _last_tool_messages(state["messages"]))
    return "grade" if searched else "read_agent"


async def grade(state: AgentState) -> Command[Literal["read_agent", "rewrite", "not_found"]]:
    """Are the latest search results useful for the question?"""
    searches = [m for m in _last_tool_messages(state["messages"]) if m.name == "search_documents"]
    relevant = False
    if any(m.artifact for m in searches):
        prompt = prompts.GRADER_PROMPT.format(
            question=_question(state["messages"]),
            results="\n\n".join(m.text for m in searches)[:12000],
        )
        try:
            decision = await _router_model().with_structured_output(GradeDecision).ainvoke(prompt)
            relevant = decision.relevant
        except Exception:
            relevant = True     # grader down: let the agent judge the results itself

    if relevant:
        return Command(goto="read_agent")
    if state["rewrite_count"] < MAX_REWRITES:
        return Command(goto="rewrite")

    # Rewrites used up. If other lookups (people, tasks, teams) ran this turn, keep
    # their results: the read agent answers from them and says no documents matched
    # (D52). Otherwise the plain "couldn't find it" answer (ticket 10 Node 4).
    others = [
        m for m in _current_turn(state["messages"])
        if isinstance(m, ToolMessage) and m.name != "search_documents"
    ]
    if not others:
        return Command(goto="not_found")
    no_documents = [
        ToolMessage(content=prompts.NO_DOCUMENTS_NOTE, name="search_documents",
                    tool_call_id=m.tool_call_id, id=m.id)
        for m in searches
    ]
    return Command(goto="read_agent", update={"messages": no_documents, "documents_exhausted": True})


async def rewrite(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """
    Search again with a better phrase. The new results replace the last search's
    ToolMessage (same id), so the agent sees one search result per tool call.
    """
    messages = state["messages"]
    last_search = next(m for m in reversed(_last_tool_messages(messages)) if m.name == "search_documents")
    previous = [
        call["args"].get("query", "")
        for m in _current_turn(messages)
        if isinstance(m, AIMessage)
        for call in m.tool_calls
        if call["name"] == "search_documents"
    ]
    prompt = prompts.REWRITE_PROMPT.format(question=_question(messages), previous="; ".join(previous))
    phrase = (await _router_model().ainvoke(prompt)).text.strip().strip('"')[:200] or _question(messages)

    content, chunks = await run_document_search(runtime.context.scope, phrase)
    replaced = ToolMessage(
        content=f'(Searched again as "{phrase}")\n\n{content}',
        artifact=chunks,
        name="search_documents",
        tool_call_id=last_search.tool_call_id,
        id=last_search.id,
    )
    return {
        "messages": [replaced],
        "rewrite_count": state["rewrite_count"] + 1,
        "retrieved_chunks": _add_chunks(state["retrieved_chunks"], chunks),
    }


async def not_found(state: AgentState) -> dict:
    """Rewrites used up: a plain answer with no tools bound (ticket 10 Node 4)."""
    response = await _chat_model().ainvoke(
        [SystemMessage(prompts.NOT_FOUND_PROMPT), HumanMessage(_question(state["messages"]))]
    )
    return {"messages": [AIMessage(content=response.text)]}


_TAG = re.compile(r"\[([^\[\]]+)\]")
_HEX8 = re.compile(r"^[0-9a-f]{8}$")


CITATION_EXCERPT_CHARS = 300


def citation_note(dropped: int) -> str:
    """Appended to an answer that cited sources it didn't retrieve (D20)."""
    if not dropped:
        return ""
    sources = "1 source" if dropped == 1 else f"{dropped} sources"
    return f"\n\n_({sources} couldn't be verified.)_"


async def check_citations(state: AgentState) -> dict:
    """
    Code citation check (D19/D20): keep only cited chunks that were retrieved
    this turn. The answer has already streamed; the SSE layer then sends the
    verified citations and, if any were dropped, citation_note().

    The verified citations (badge data) and the note are also saved on the
    answer message itself (same id, so add_messages replaces it), so a reopened
    chat shows the same badges without searching again.
    """
    last = state["messages"][-1] if state["messages"] else None
    answer = last.text if last else ""
    chunks = {c["chunk_id"]: c for c in state["retrieved_chunks"]}
    by_tag = {citation_tag(chunk_id): chunk_id for chunk_id in chunks}

    cited: list[str] = []
    for group in _TAG.findall(answer):
        for token in re.split(r"[,\s]+", group.strip().lower()):
            if _HEX8.match(token) and token not in cited:
                cited.append(token)

    verified = [by_tag[tag] for tag in cited if tag in by_tag]
    dropped = len(cited) - len(verified)
    update: dict = {"verified_citation_ids": verified, "dropped_citation_count": dropped}

    if isinstance(last, AIMessage) and answer:
        citations = [
            {
                "tag": citation_tag(chunk_id),
                "document_id": chunks[chunk_id]["document_id"],
                "title": chunks[chunk_id]["title"],
                "chunk_index": chunks[chunk_id]["chunk_index"],
                "excerpt": chunks[chunk_id]["text"][:CITATION_EXCERPT_CHARS],
            }
            for chunk_id in verified
        ]
        update["messages"] = [
            last.model_copy(update={
                "content": answer + citation_note(dropped),
                "additional_kwargs": {**last.additional_kwargs, "citations": citations},
            })
        ]
    return update


# ── Write path (D22, D45) ─────────────────────────────────────────────────────

async def write_agent(state: AgentState) -> dict:
    """
    One LLM call with only the write tools bound. Either it proposes a change
    (a tool call, nothing saved) or it asks for what's missing.
    """
    today = date.today()
    system = prompts.WRITE_AGENT_PROMPT.format(today=today.isoformat(), weekday=today.strftime("%A"))
    response = await _chat_model().bind_tools(WRITE_TOOLS).ainvoke(
        [SystemMessage(system), *_trim(state["messages"])]
    )
    return {"messages": [response]}


def _closing_messages(proposal: AIMessage, first_result: str, reply: str) -> list[BaseMessage]:
    """
    A ToolMessage for every proposed call (the history must answer each tool
    call, or the next LLM call fails), then the reply the user sees. Only the
    first call is ever acted on (one change per message, D45).
    """
    calls = proposal.tool_calls
    results: list[BaseMessage] = [
        ToolMessage(
            content=first_result if i == 0 else "Not done: one change per message.",
            name=call["name"],
            tool_call_id=call["id"],
        )
        for i, call in enumerate(calls)
    ]
    if len(calls) > 1:
        reply += "\n\n" + prompts.ONE_ACTION_NOTE
    return results + [AIMessage(content=reply)]


async def prepare_action(
    state: AgentState, runtime: Runtime[AgentContext]
) -> Command[Literal["confirm_action", "__end__"]]:
    """
    Code, no LLM: run the real rules without saving, and write the card text
    from database names (D45). A refused change never becomes a card.
    """
    proposal = state["messages"][-1]
    call = proposal.tool_calls[0]
    try:
        pending = await actions.prepare(runtime.context.scope, call["name"], call["args"])
    except actions.ActionRefused as exc:
        reason = str(exc)
        return Command(
            goto=END,
            update={"messages": _closing_messages(proposal, f"Refused: {reason}", reason)},
        )
    return Command(goto="confirm_action", update={"pending_action": pending})


async def confirm_action(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """
    Pause until the user clicks Confirm or Cancel (D22). LangGraph re-runs this
    node from the top on resume, so nothing before interrupt() may change
    anything. On Confirm the save runs with the scope of the click's own
    request, so the rules are checked again at that moment.
    """
    action = state["pending_action"]
    decision = interrupt(action)        # the SSE `confirm` event shows this card

    if decision == "confirm":
        try:
            reply = await actions.execute(runtime.context.scope, action)
        except actions.ActionRefused as exc:
            reply = str(exc)
    else:
        reply = prompts.CANCELLED

    proposal = next(
        m for m in reversed(state["messages"]) if isinstance(m, AIMessage) and m.tool_calls
    )
    return {
        "messages": _closing_messages(proposal, reply, reply),
        "pending_action": None,
    }


# ── Graph ─────────────────────────────────────────────────────────────────────

def build_graph(checkpointer=None):
    """
    Compile the agent. Run it with:
        graph.astream(new_turn_input(text), config={"configurable": {"thread_id": ...}},
                      context=AgentContext(scope=..., audit_id=...))
    """
    builder = StateGraph(AgentState, context_schema=AgentContext)
    builder.add_node("router", router)
    builder.add_node("read_agent", read_agent)
    builder.add_node("tools", ToolNode(READ_TOOLS))
    builder.add_node("collect", collect)
    builder.add_node("grade", grade)
    builder.add_node("rewrite", rewrite)
    builder.add_node("not_found", not_found)
    builder.add_node("check_citations", check_citations)
    builder.add_node("write_agent", write_agent)
    builder.add_node("prepare_action", prepare_action)
    builder.add_node("confirm_action", confirm_action)

    builder.add_edge(START, "router")
    builder.add_conditional_edges(
        "router", lambda s: "read_agent" if s["intent"] == "read" else "write_agent",
        ["read_agent", "write_agent"],
    )
    builder.add_conditional_edges(
        "read_agent", lambda s: "tools" if s["messages"][-1].tool_calls else "check_citations",
        ["tools", "check_citations"],
    )
    builder.add_edge("tools", "collect")
    builder.add_conditional_edges("collect", after_collect, ["grade", "read_agent"])
    builder.add_edge("rewrite", "grade")
    builder.add_edge("not_found", "check_citations")
    builder.add_edge("check_citations", END)
    builder.add_conditional_edges(
        "write_agent", lambda s: "prepare_action" if s["messages"][-1].tool_calls else END,
        ["prepare_action", END],
    )
    builder.add_edge("confirm_action", END)
    return builder.compile(checkpointer=checkpointer)
