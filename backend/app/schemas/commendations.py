"""
app/schemas/commendations.py — Commendation shapes (Ticket 05 §6, Ticket 12 D5)

Used by the chat agent's give_commendation action, the dashboard, and the
/feedback page (give + "given by you", D54).
"""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.auth import AppBaseModel

CommendationReason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]


class CreateCommendationRequest(BaseModel):
    team_id: UUID
    given_to_user_id: UUID
    reason: CommendationReason


class CommendationResponse(AppBaseModel):
    id: UUID
    team_id: UUID
    team_name: str
    given_by_user_id: UUID
    given_by_name: str
    given_to_user_id: UUID
    given_to_name: str
    reason: str
    created_at: datetime
