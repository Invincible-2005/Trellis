"""
app/schemas/strikes.py — Strike shapes (Ticket 05 §6, Ticket 12 D6/D46)

Used by the chat agent's give_strike action today; the admin Strikes tab
(appeals, D6) and the dashboard reuse them later.
"""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.auth import AppBaseModel

StrikeReason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]
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
