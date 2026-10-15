"""
app/schemas/strikes.py — Strike shapes (Ticket 05 §6, Ticket 12 D6/D46/D54)

Used by the chat agent's give_strike action, the dashboard, and the /feedback
page (preview + save, appeals).
"""
from datetime import datetime
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.auth import AppBaseModel
from app.schemas.chat import Citation, PolicyCheck

StrikeReason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]
AppealNote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]
StrikeStatus = Literal["pending_agent_review", "confirmed", "appealed", "dismissed"]


class CreateStrikeRequest(BaseModel):
    team_id: UUID
    given_to_user_id: UUID
    reason: StrikeReason


class StrikeResponse(AppBaseModel):
    id: UUID
    team_id: UUID
    team_name: str
    given_by_user_id: UUID
    given_by_name: str
    given_to_user_id: UUID
    given_to_name: str
    reason: str
    status: StrikeStatus
    escalated: bool      # the 3rd active strike for this person in this team
    created_at: datetime
    # Appeal and review (D6)
    appeal_notes: Optional[str] = None       # the receiver's reason for appealing
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    can_appeal: bool = False                 # you received it, it's confirmed, never appealed or reviewed


class AppealResponse(StrikeResponse):
    """An appeal you may decide (D6, D55: never your own strike, given or received)."""

    policy_evaluation: Optional[str] = None  # the check saved with the strike (D46)
    policy_sources: List[Citation] = []      # its passages, only from documents you can see


class AppealStrikeRequest(BaseModel):
    appeal_notes: AppealNote


class ReviewAppealRequest(BaseModel):
    decision: Literal["uphold", "dismiss"]   # uphold → confirmed again; dismiss → stops counting


class StrikePreviewResponse(BaseModel):
    """/feedback's check before Confirm (D54): the rules passed; nothing is saved yet."""

    team_name: str
    given_to_name: str
    active_strikes: int      # their active strikes in this team so far
    will_escalate: bool      # this one would be the 3rd active strike
    policy: PolicyCheck      # D46: a warning, never a block
