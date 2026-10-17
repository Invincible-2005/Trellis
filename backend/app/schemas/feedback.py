"""
app/schemas/feedback.py — Shapes for the /feedback page (Ticket 12 D54)

One page to give strikes, give commendations and review appeals. Each person
gets only the tabs they can use; the backend still checks every action.
"""
from typing import List
from uuid import UUID

from pydantic import BaseModel

from app.schemas.auth import FeedbackTab
from app.schemas.commendations import CommendationResponse
from app.schemas.strikes import StrikeResponse


class FeedbackPerson(BaseModel):
    user_id: UUID
    name: str
    email: str
    team_role_name: str


class FeedbackTeamOption(BaseModel):
    """One team in the Give form: who you may strike and who you may commend there."""

    team_id: UUID
    team_name: str
    strike_people: List[FeedbackPerson] = []   # empty unless you have give_strike in this team
    commend_people: List[FeedbackPerson] = []


class FeedbackOptionsResponse(BaseModel):
    tabs: List[FeedbackTab]
    teams: List[FeedbackTeamOption]   # only teams with at least one person you can strike or commend


class GivenFeedbackResponse(BaseModel):
    """What you gave, newest first (D54: only your own, not everything in your teams)."""

    strikes: List[StrikeResponse]            # every status, so you see appeals and their outcome
    commendations: List[CommendationResponse]
