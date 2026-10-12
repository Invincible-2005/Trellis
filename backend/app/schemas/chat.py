"""
app/schemas/chat.py — Chat list, one chat's history, mentions (Ticket 08, Ticket 12 D2/D41–D43)

A chat belongs to one user in one org; nobody else sees it (Ticket 08).
The conversation itself lives in the agent's memory (LangGraph checkpoint in
Neon, D11); ChatDetail.messages is read back from there.
"""
from datetime import datetime
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.auth import AppBaseModel

ChatTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ChatSummary(AppBaseModel):
    """One row in the chat list."""

    id: UUID
    title: Optional[str]       # set from the first message (Ticket 08 §3); None until then
    created_at: datetime
    last_active_at: datetime   # last message sent; the list is sorted by it


class ChatListResponse(BaseModel):
    chats: List[ChatSummary]


class RenameChatRequest(BaseModel):
    title: ChatTitle


class SendMessageRequest(BaseModel):
    """
    One user message. Over CHAT_MAX_MESSAGE_CHARS → 400 message_too_long (D21).
    People and teams picked in the chat box arrive as `@[email](user:<id>)` and
    `/[Team](team:<id>)` (D43). A `resume` field comes with confirm cards (D22).
    """

    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Citation(BaseModel):
    """
    A source badge under an answer (D20: only citations the agent really retrieved).
    `tag` is the 8-character label the answer cites, e.g. [3f9a12bc].
    """

    tag: str
    document_id: UUID
    title: str
    chunk_index: int    # 0-based; show as "part chunk_index + 1"
    excerpt: str        # start of the passage the answer used


class ChatMessage(BaseModel):
    """A question you asked, or the assistant's final answer (no tool steps)."""

    role: Literal["user", "assistant"]
    content: str
    citations: List[Citation] = []


class ChatDetail(ChatSummary):
    messages: List[ChatMessage]


class MentionPerson(BaseModel):
    """`@` in the chat box (D43): picked by email, sent with the exact id."""

    id: UUID
    name: str
    email: str


class MentionTeam(BaseModel):
    """`/` in the chat box (D43)."""

    id: UUID
    name: str


class MentionsResponse(BaseModel):
    """Only teams the user can see (D13) and the people on them."""

    people: List[MentionPerson]
    teams: List[MentionTeam]
