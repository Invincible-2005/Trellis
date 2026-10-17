"""
app/schemas/chat.py — Chat list, one chat's history, mentions, Confirm cards (Ticket 08, Ticket 12 D2/D22/D41–D43/D45)

A chat belongs to one user in one org; nobody else sees it (Ticket 08).
The conversation itself lives in the agent's memory (LangGraph checkpoint in
Neon, D11); ChatDetail.messages is read back from there.
"""
from datetime import datetime
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints, model_validator

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
    Send exactly one of:
    - `message`: a new message. Over CHAT_MAX_MESSAGE_CHARS → 400 message_too_long
      (D21). People and teams picked in the chat box arrive as `@[email](user:<id>)`
      and `/[Team](team:<id>)` (D43). If a Confirm card is waiting, it is cancelled first.
    - `resume`: the click on a Confirm card (D22). 409 nothing_to_confirm when no
      card is waiting (e.g. a second click, D45).
    """

    message: Optional[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]] = None
    resume: Optional[Literal["confirm", "cancel"]] = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "SendMessageRequest":
        if (self.message is None) == (self.resume is None):
            raise ValueError("Send either message or resume.")
        return self


class CardLine(BaseModel):
    label: str      # e.g. "Assignee"
    value: str      # e.g. "Karan Mehta"


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


class PolicyCheck(BaseModel):
    """
    give_strike only (D46): the reason checked against the policy documents the
    giver can see. A warning, never a block: the manager can confirm either way.
    `sources` are only passages that were really retrieved.
    """

    verdict: Literal["supported", "not_covered", "unchecked"]
    explanation: str
    sources: List[Citation] = []


class ConfirmCard(BaseModel):
    """
    A change the assistant prepared and is waiting to save (D22). The text is
    written by code from what will be saved, never by the AI (D45). Sent as the
    SSE `confirm` event and in ChatDetail.pending_action (so a reload shows it again).
    """

    action: Literal["create_task", "give_strike", "give_commendation"]
    summary: str                      # card heading, e.g. "Create a task for Karan Mehta"
    details: List[CardLine]
    policy: Optional[PolicyCheck] = None   # give_strike only: the policy check (D46)


class ChatMessage(BaseModel):
    """A question you asked, or the assistant's final answer (no tool steps)."""

    role: Literal["user", "assistant"]
    content: str
    citations: List[Citation] = []


class ChatDetail(ChatSummary):
    messages: List[ChatMessage]
    pending_action: Optional[ConfirmCard] = None   # a Confirm card still waiting for a click


class MentionPerson(BaseModel):
    """`@` in the chat box (D43): picked by email, sent with the exact id. Every org member (D51)."""

    id: UUID
    name: str
    email: str
    on_my_team: bool = False   # on a team you can see: listed first, under "Your teams" (D51)


class MentionTeam(BaseModel):
    """`/` in the chat box (D43)."""

    id: UUID
    name: str


class MentionsResponse(BaseModel):
    """Every org member, your teammates first (D51); only teams the user can see (D13)."""

    people: List[MentionPerson]
    teams: List[MentionTeam]
