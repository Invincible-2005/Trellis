"""
app/api/v1/chat.py — The user's chats (Ticket 08, Ticket 12 D2/D41–D43)

The router requires an org (get_org_context); every route also depends on get_scope.
Every chat route only ever touches the caller's own chats (404 otherwise); the
logic lives in app/services/chat.py.

POST /sessions/{id}/message streams the answer as SSE (D2, ticket 09). Checks that
can fail run in the start_turn dependency, before the stream opens, so they come
back as normal JSON errors; its cleanup runs after the stream has finished.
"""
import uuid
from collections.abc import AsyncIterable

from fastapi import APIRouter, Depends, Request, status
from fastapi.sse import EventSourceResponse, ServerSentEvent
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.chat import (
    ChatDetail,
    ChatListResponse,
    ChatSummary,
    MentionsResponse,
    RenameChatRequest,
    SendMessageRequest,
)
from app.scope.resolver import AccessScope
from app.services import chat

router = APIRouter(prefix="/chat", tags=["chat"], dependencies=[Depends(get_org_context)])


def get_agent(request: Request) -> CompiledStateGraph:
    """The agent built once at startup (main.py lifespan)."""
    return request.app.state.agent


def get_checkpointer(request: Request) -> BaseCheckpointSaver:
    """The agent's memory store (Postgres, D11), opened at startup."""
    return request.app.state.checkpointer


@router.post(
    "/sessions",
    response_model=ChatSummary,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 409, 503),
)
async def create_chat(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> ChatSummary:
    """An empty chat. Call it when the first message is sent, not on "New chat" (D42)."""
    return await chat.create_chat(db, scope)


@router.get(
    "/sessions",
    response_model=ChatListResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def list_chats(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> ChatListResponse:
    """Your chats in this org, most recently used first (up to 50)."""
    return ChatListResponse(chats=await chat.list_chats(db, scope))


@router.get(
    "/sessions/{session_id}",
    response_model=ChatDetail,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def get_chat(
    session_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
    agent: CompiledStateGraph = Depends(get_agent),
) -> ChatDetail:
    """One of your chats with its messages (questions and final answers, with source badges)."""
    return await chat.get_chat_detail(db, scope, session_id, agent)


@router.patch(
    "/sessions/{session_id}",
    response_model=ChatSummary,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def rename_chat(
    session_id: uuid.UUID,
    body: RenameChatRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> ChatSummary:
    """Rename one of your chats (1–100 characters)."""
    return await chat.rename_chat(db, scope, session_id, body.title)


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def delete_chat(
    session_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
    checkpointer: BaseCheckpointSaver = Depends(get_checkpointer),
) -> None:
    """Delete one of your chats for good, including the assistant's memory of it."""
    await chat.delete_chat(db, scope, session_id, checkpointer)


@router.get(
    "/mentions",
    response_model=MentionsResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def list_mentions(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> MentionsResponse:
    """Who you can pick in the chat box (D43): `/` teams you can see, `@` the people on them."""
    return await chat.list_mentions(db, scope)


async def start_turn(
    session_id: uuid.UUID,
    body: SendMessageRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
):
    """Checks before the stream opens; frees the chat for its next message once the stream ends."""
    turn = await chat.begin_turn(db, scope, session_id, body.message)
    try:
        yield turn
    finally:
        chat.end_turn(turn)


@router.post(
    "/sessions/{session_id}/message",
    response_class=EventSourceResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def send_message(
    turn: chat.ChatTurn = Depends(start_turn, scope="request"),
    agent: CompiledStateGraph = Depends(get_agent),
) -> AsyncIterable[ServerSentEvent]:
    """
    Send a message to one of your chats; the answer streams back as SSE events:
    status, tool_call, token, citations, error, done (ticket 09). Before the stream
    opens: 404 chat_not_found, 400 message_too_long (over 4,000 characters, D21),
    409 chat_busy (still answering), 422 empty message. The first message sets the title.
    """
    async for event in chat.stream_turn(agent, turn):
        yield event
