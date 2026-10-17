"""
app/services/chat.py — The user's own chats (Ticket 08, Ticket 12 D2/D11/D22/D42/D43/D45)

A chat belongs to one user in one org. Anyone else's chat, Admin included,
behaves exactly like a missing one (404 chat_not_found).

Two stores, one chat:
- `chat_sessions` row: what the chat list shows (title, timestamps);
- the agent's memory (LangGraph checkpoint in Neon, D11), keyed by
  thread_id(chat) = "{org_id}:{user_id}:{chat_id}" built from the row, never
  from the request (Ticket 08 §2).

The agent and its checkpointer are created once at startup (main.py) and
passed in by the router.

Sending a message (D2, D20, D21): begin_turn() runs every check that can fail
before the answer starts (so failures are normal JSON errors), then
stream_turn() runs the agent and turns what it does into SSE events (ticket 09):
status, tool_call, token, citations, confirm, error, done. One audit row per turn.

Confirm cards (D22, D45): when the agent proposes a change, the graph pauses
(interrupt) and the stream ends with a `confirm` event. The click comes back as
{"resume": "confirm" | "cancel"} on the same endpoint and continues the paused
run. A new message while a card waits cancels the card first. The card is read
back from the checkpoint, so a reloaded chat shows it again.
"""
import logging
import re
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timezone

import anyio
from fastapi import status
from fastapi.sse import ServerSentEvent
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.graph import citation_note
from app.agent.state import AgentContext, new_turn_input
from app.core.config import settings
from app.core.database import async_session
from app.core.errors import api_error
from app.models.audit import AuditLog
from app.models.chat import ChatSession
from app.models.organization import OrgMember
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.chat import (
    ChatDetail,
    ChatMessage,
    ChatSummary,
    Citation,
    ConfirmCard,
    MentionPerson,
    MentionsResponse,
    MentionTeam,
)
from app.scope.resolver import AccessScope

logger = logging.getLogger(__name__)

CHAT_LIST_LIMIT = 50
TITLE_CHARS = 60            # auto-title = start of the first message (Ticket 08 §3)
AUDIT_ANSWER_CHARS = 300


def thread_id(chat: ChatSession) -> str:
    """The agent-memory key for a chat (Ticket 08 §2)."""
    return f"{chat.org_id}:{chat.user_id}:{chat.id}"


async def waiting_card(agent: CompiledStateGraph, thread: str) -> dict | None:
    """The Confirm card this chat is paused on (D22), or None."""
    snapshot = await agent.aget_state({"configurable": {"thread_id": thread}})
    if not snapshot.next:
        return None
    return snapshot.values.get("pending_action")


async def get_own_chat(db: AsyncSession, scope: AccessScope, chat_id: uuid.UUID) -> ChatSession:
    """
    The caller's chat in the active org.

    Raises:
        404 chat_not_found — missing, someone else's, or in another org
    """
    chat = await db.scalar(
        select(ChatSession).where(
            ChatSession.id == chat_id,
            ChatSession.user_id == scope.user_id,
            ChatSession.org_id == scope.org_id,
        )
    )
    if chat is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "chat_not_found", "Chat not found.")
    return chat


async def create_chat(db: AsyncSession, scope: AccessScope) -> ChatSummary:
    """An empty chat. The frontend calls this when the first message is sent (D42)."""
    chat = ChatSession(org_id=scope.org_id, user_id=scope.user_id)
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return ChatSummary.model_validate(chat)


async def list_chats(db: AsyncSession, scope: AccessScope) -> list[ChatSummary]:
    """The caller's chats in this org, most recently used first."""
    rows = await db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == scope.user_id, ChatSession.org_id == scope.org_id)
        .order_by(ChatSession.last_active_at.desc())
        .limit(CHAT_LIST_LIMIT)
    )
    return [ChatSummary.model_validate(chat) for chat in rows]


async def get_chat_detail(
    db: AsyncSession, scope: AccessScope, chat_id: uuid.UUID, agent: CompiledStateGraph
) -> ChatDetail:
    """
    One chat with its messages, read from the agent's memory: the questions and
    the final answers only (no tool calls or tool output). An answer's source
    badges are stored on the answer itself (additional_kwargs["citations"]).
    """
    chat = await get_own_chat(db, scope, chat_id)
    state = await agent.aget_state({"configurable": {"thread_id": thread_id(chat)}})
    card = state.values.get("pending_action") if state.next else None

    messages: list[ChatMessage] = []
    for message in state.values.get("messages", []):
        if isinstance(message, HumanMessage):
            messages.append(ChatMessage(role="user", content=message.text))
        elif isinstance(message, AIMessage) and not message.tool_calls and message.text:
            citations = [Citation(**c) for c in message.additional_kwargs.get("citations", [])]
            messages.append(ChatMessage(role="assistant", content=message.text, citations=citations))

    return ChatDetail(
        **ChatSummary.model_validate(chat).model_dump(),
        messages=messages,
        pending_action=_card(card) if card else None,
    )


async def rename_chat(
    db: AsyncSession, scope: AccessScope, chat_id: uuid.UUID, title: str
) -> ChatSummary:
    """Rename a chat. Doesn't move it in the list (last_active_at is untouched)."""
    chat = await get_own_chat(db, scope, chat_id)
    chat.title = title
    await db.commit()
    await db.refresh(chat)
    return ChatSummary.model_validate(chat)


async def delete_chat(
    db: AsyncSession, scope: AccessScope, chat_id: uuid.UUID, checkpointer: BaseCheckpointSaver
) -> None:
    """
    Hard delete (Ticket 08 §5): the agent's memory first, then the row. If the
    memory delete fails, the row stays and the user can try again.
    """
    chat = await get_own_chat(db, scope, chat_id)
    await checkpointer.adelete_thread(thread_id(chat))
    await db.execute(delete(ChatSession).where(ChatSession.id == chat.id))
    await db.commit()


async def list_mentions(db: AsyncSession, scope: AccessScope) -> MentionsResponse:
    """
    Who the user can pick in the chat box: `@` = every org member (D51), people
    on a team the user can see first; `/` = the teams they can see (D13). Names
    A–Z within each group. The ids are only hints for the agent; its tools still
    check scope (D1).
    """
    team_ids = list(scope.viewable_team_ids)
    teams = []
    teammate_ids: set[uuid.UUID] = set()
    if team_ids:
        teams = (
            await db.execute(
                select(Team.id, Team.name)
                .where(Team.id.in_(team_ids), Team.org_id == scope.org_id)
                .order_by(Team.name)
            )
        ).all()
        teammate_ids = set(
            await db.scalars(select(TeamMember.user_id).where(TeamMember.team_id.in_(team_ids)))
        )

    members = (
        await db.execute(
            select(User.id, User.name, User.email)
            .join(OrgMember, OrgMember.user_id == User.id)
            .where(OrgMember.org_id == scope.org_id)
        )
    ).all()
    people = [
        MentionPerson(id=p.id, name=p.name, email=p.email, on_my_team=p.id in teammate_ids)
        for p in members
    ]
    people.sort(key=lambda p: (not p.on_my_team, p.name.lower()))
    return MentionsResponse(
        people=people,
        teams=[MentionTeam(id=t.id, name=t.name) for t in teams],
    )


# ── Sending a message (SSE) ───────────────────────────────────────────────────

# Obvious prompt-injection phrases (D21). A match never blocks: it only flags the
# turn in the audit log. Scope is enforced by the tools, so an injection can't
# reach anything the user couldn't see anyway.
INJECTION_PHRASES = (
    "ignore previous instructions",
    "ignore all previous",
    "ignore the above",
    "disregard previous",
    "disregard your instructions",
    "forget your instructions",
    "reveal your instructions",
    "system prompt",
    "developer mode",
    "jailbreak",
    "you are now",
)

# Mention tokens from the chat box (D43): @[email](user:<uuid>), /[Team](team:<uuid>)
_MENTION = re.compile(r"([@/])\[([^\]]+)\]\((?:user|team):[0-9a-fA-F-]{36}\)")

# Agent steps → ticket 09 `status` names ("thinking" and "looking_up_teams" added 2026-10-12)
_STATUS_ON_START = {
    "router": "routing",
    "read_agent": "thinking",
    "write_agent": "thinking",
    "prepare_action": "preparing_action",
    "grade": "grading_relevance",
    "rewrite": "rewriting_query",
    "check_citations": "verifying_citations",
}
_STATUS_FOR_TOOL = {
    "search_documents": "searching_documents",
    "get_tasks": "looking_up_tasks",
    "get_task_comments": "reading_comments",
    "get_team_summary": "looking_up_teams",
    "find_people": "looking_up_people",
    "get_person_documents": "checking_document_access",
}
_ANSWER_NODES = {"read_agent", "not_found", "write_agent"}   # nodes whose LLM text is the answer
_CODE_REPLY_NODES = {"prepare_action", "confirm_action"}     # nodes whose reply is written by code

# Chats answering right now. In memory: fine with one backend instance (D11).
_busy: set[uuid.UUID] = set()


@dataclass
class ChatTurn:
    """One message being answered."""

    chat_id: uuid.UUID
    thread_id: str
    scope: AccessScope
    message: str | None             # a new message, or
    resume: str | None              # a click on a Confirm card ("confirm" | "cancel")
    injection_suspected: bool
    audit_id: uuid.UUID = field(default_factory=uuid.uuid4)


def plain_text(message: str) -> str:
    """Mention tokens as the user sees them (D43): @[a@b.com](user:…) → @a@b.com."""
    return _MENTION.sub(lambda m: m.group(1) + m.group(2), message)


async def begin_turn(
    db: AsyncSession,
    scope: AccessScope,
    chat_id: uuid.UUID,
    agent: CompiledStateGraph,
    message: str | None,
    resume: str | None = None,
) -> ChatTurn:
    """
    Everything that can fail before the answer starts. Call end_turn() afterwards.
    Exactly one of message / resume is set (SendMessageRequest checks it).

    Raises:
        404 chat_not_found
        400 message_too_long — over CHAT_MAX_MESSAGE_CHARS (D21)
        409 chat_busy — this chat is still answering the previous message
        409 nothing_to_confirm — a resume, but no Confirm card is waiting (D45)
    """
    chat = await get_own_chat(db, scope, chat_id)
    limit = settings.CHAT_MAX_MESSAGE_CHARS
    if message is not None and len(message) > limit:
        raise api_error(
            status.HTTP_400_BAD_REQUEST, "message_too_long",
            f"Messages can be at most {limit:,} characters. Please shorten it.",
        )
    if chat.id in _busy:
        raise api_error(
            status.HTTP_409_CONFLICT, "chat_busy",
            "This chat is still answering your last message. Wait for it to finish.",
        )
    _busy.add(chat.id)
    try:
        # Checked while holding the chat, so two quick clicks can't both pass
        if resume is not None and await waiting_card(agent, thread_id(chat)) is None:
            raise api_error(
                status.HTTP_409_CONFLICT, "nothing_to_confirm",
                "There's nothing waiting for confirmation in this chat.",
            )
        if message is not None and chat.title is None:
            chat.title = plain_text(message)[:TITLE_CHARS].strip()
        chat.last_active_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()
    except Exception:
        _busy.discard(chat.id)
        raise

    lowered = (message or "").lower()
    return ChatTurn(
        chat_id=chat.id,
        thread_id=thread_id(chat),
        scope=scope,
        message=message,
        resume=resume,
        injection_suspected=any(phrase in lowered for phrase in INJECTION_PHRASES),
    )


def end_turn(turn: ChatTurn) -> None:
    """The chat can take its next message."""
    _busy.discard(turn.chat_id)


def _event(name: str, data) -> ServerSentEvent:
    return ServerSentEvent(event=name, data=data)


def _card(pending: dict) -> ConfirmCard:
    """A pending_action from the agent's state → the card the frontend shows."""
    return ConfirmCard(
        action=pending["tool"],
        summary=pending["summary"],
        details=pending["details"],
        policy=pending.get("policy"),
    )


def _friendly_error(exc: Exception) -> str:
    """Never send the raw exception to the browser."""
    text = str(exc)
    if "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower():
        return "The AI has reached its free usage limit for now. Please try again later."
    return "Something went wrong while answering. Please try again."


async def stream_turn(agent: CompiledStateGraph, turn: ChatTurn) -> AsyncIterator[ServerSentEvent]:
    """
    Run the agent on one message and translate it into SSE events (ticket 09):

        status {step}             a step starts (routing, thinking, searching_documents, …)
        tool_call {tool, status}  a lookup starts / ends
        token {content}           answer text as it's written
        citations [Citation]      verified sources only, after the answer (D20)
        token {content}           "N sources couldn't be verified" note, if any
        confirm ConfirmCard       a change is waiting for Confirm / Cancel (D22)
        done {audit_id}

    On failure: error {message}, and the stream ends. The audit row is written
    either way.
    """
    config = {"configurable": {"thread_id": turn.thread_id}}
    context = AgentContext(scope=turn.scope, audit_id=turn.audit_id)
    tools_called: list[str] = []
    chunk_ids: list[str] = []
    answer = ""
    writing = False     # has the current answer step started writing text?

    try:
        if turn.resume is not None:
            graph_input = Command(resume=turn.resume)
            card = await waiting_card(agent, turn.thread_id)
            if card:
                tools_called.append(f"{card['tool']}:{turn.resume}")
        else:
            # D22: a new message cancels a card that's still waiting (recorded in the chat)
            if await waiting_card(agent, turn.thread_id):
                async for _ in agent.astream(Command(resume="cancel"), config, context=context):
                    pass
            graph_input = new_turn_input(turn.message)

        async for mode, data in agent.astream(
            graph_input, config, context=context,
            stream_mode=["tasks", "updates", "messages"],
        ):
            if mode == "tasks":
                if "input" in data:                                 # a step starts
                    writing = False
                    if data["name"] in _STATUS_ON_START:
                        yield _event("status", {"step": _STATUS_ON_START[data["name"]]})
                    elif data["name"] == "confirm_action" and turn.resume == "confirm":
                        yield _event("status", {"step": "saving_action"})

            elif mode == "messages":
                chunk, meta = data
                if (isinstance(chunk, AIMessageChunk) and chunk.text
                        and meta.get("langgraph_node") in _ANSWER_NODES):
                    if not writing:
                        writing = True
                        yield _event("status", {"step": "writing_answer"})
                    yield _event("token", {"content": chunk.text})

            else:  # updates: what each step produced
                for node, update in data.items():
                    if not isinstance(update, dict):
                        continue
                    if node == "write_agent":
                        tools_called += [call["name"] for call in update["messages"][-1].tool_calls]
                    elif node == "read_agent":
                        for call in update["messages"][-1].tool_calls:
                            tools_called.append(call["name"])
                            yield _event("tool_call", {"tool": call["name"], "status": "start"})
                            if call["name"] in _STATUS_FOR_TOOL:
                                yield _event("status", {"step": _STATUS_FOR_TOOL[call["name"]]})
                    elif node == "tools":
                        for result in update["messages"]:
                            yield _event("tool_call", {"tool": result.name, "status": "end"})
                    elif node == "rewrite":
                        tools_called.append("search_documents")
                    elif node in _CODE_REPLY_NODES and update.get("messages"):
                        yield _event("token", {"content": update["messages"][-1].text})

        snapshot = await agent.aget_state(config)
        state = snapshot.values
        last = state["messages"][-1]
        card = state.get("pending_action") if snapshot.next else None
        if card:
            answer = card["summary"]
            yield _event("confirm", _card(card).model_dump(mode="json"))
        else:
            answer = last.text
            chunk_ids = [c["chunk_id"] for c in state.get("retrieved_chunks", [])]
            citations = last.additional_kwargs.get("citations", []) if isinstance(last, AIMessage) else []
            yield _event("citations", citations)
            note = citation_note(state.get("dropped_citation_count", 0))
            if note:
                yield _event("token", {"content": note})
        yield _event("done", {"audit_id": str(turn.audit_id)})

    except Exception as exc:
        logger.exception("Chat turn %s failed", turn.audit_id)
        yield _event("error", {"message": _friendly_error(exc)})

    finally:
        # Shielded: if the browser disconnects the stream is cancelled, but the
        # audit row must still be written.
        with anyio.CancelScope(shield=True):
            await _save_audit(turn, tools_called, chunk_ids, answer)


async def _save_audit(turn: ChatTurn, tools_called: list[str], chunk_ids: list[str], answer: str) -> None:
    """One audit row per turn (ticket 02 audit_log, D21 flag). Own short session."""
    scope = turn.scope
    try:
        async with async_session() as db:
            team_role_ids = await db.scalars(
                select(TeamMember.role_id)
                .join(Team, Team.id == TeamMember.team_id)
                .where(TeamMember.user_id == scope.user_id, Team.org_id == scope.org_id)
            )
            role_ids = {str(r) for r in team_role_ids}
            if scope.org_role_id:
                role_ids.add(str(scope.org_role_id))
            db.add(AuditLog(
                id=turn.audit_id,
                org_id=scope.org_id,
                user_id=scope.user_id,
                role_ids_at_time=sorted(role_ids),
                query=turn.message if turn.message is not None else f"[{turn.resume}]",
                tools_called=tools_called,
                chunks_retrieved_ids=chunk_ids,
                answer_summary=answer[:AUDIT_ANSWER_CHARS] or None,
                injection_suspected=turn.injection_suspected,
            ))
            await db.commit()
    except Exception:
        logger.exception("Couldn't write the audit row for chat turn %s", turn.audit_id)
