"""
app/schemas/teams.py — Team pages (Ticket 05 §3, Ticket 12 D13/D28–D31)

Each team comes with flags (can_add_member, can_assign_task, deletable) so the
frontend shows exactly the buttons the backend would allow. The backend still
checks every action.
"""
from datetime import datetime
from typing import Annotated, List, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.auth import AppBaseModel

TeamName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class CreateTeamRequest(BaseModel):
    name: TeamName


class AddTeamMemberRequest(BaseModel):
    """An existing org member (D25) and the team role to give them (D30)."""

    user_id: UUID
    role_id: UUID


class TeamResponse(AppBaseModel):
    """One card on /teams: name, your place in the team, members, task numbers."""

    id: UUID
    name: str
    my_role_name: Optional[str] = None  # your role in this team; None = you oversee it from above
    member_count: int
    open_tasks: int                     # todo + in progress + blocked
    overdue_tasks: int
    can_add_member: bool
    can_assign_task: bool
    deletable: bool                     # may delete it once it has no tasks, strikes or documents (D31)


class TeamListResponse(AppBaseModel):
    can_create_team: bool               # org-level create_team: shows "Create team"
    teams: List[TeamResponse]


class TeamMemberResponse(AppBaseModel):
    user_id: UUID
    name: str
    email: str
    role_id: UUID
    role_name: str
    joined_at: datetime
    removable: bool                     # their team role is one you could give (D30)
    assignable: bool                    # you may give them a task: assign_task + ranked below you (D32)


class TeamDetailResponse(TeamResponse):
    """/teams/[teamId]: the card's data plus the member list."""

    members: List[TeamMemberResponse]


class CandidateMember(AppBaseModel):
    user_id: UUID
    name: str
    email: str


class RoleOption(AppBaseModel):
    id: UUID
    name: str


class TeamCandidatesResponse(AppBaseModel):
    """Choices for the Add member dialog."""

    members: List[CandidateMember]      # org members not on this team yet (D25: no new invites here)
    roles: List[RoleOption]             # team roles the caller may give in this team (D30)
