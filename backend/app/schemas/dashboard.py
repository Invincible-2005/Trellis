"""
app/schemas/dashboard.py — GET /api/v1/dashboard (Ticket 05 §7, Ticket 12 D24/D47/D48)

One response for the whole /dashboard page. Reuses the task, strike and
commendation shapes, so the frontend already knows them.
"""
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.commendations import CommendationResponse
from app.schemas.strikes import StrikeResponse
from app.schemas.tasks import TaskResult, TaskSummary, TeamOverview


class OrgOverview(BaseModel):
    total_users: int
    total_teams: int
    total_roles: int
    total_documents: int     # ready documents only
    active_strikes: int      # every strike that isn't dismissed (D6)


class DashboardResponse(BaseModel):
    # "My work" (D47): everyone, read-only
    my_tasks: TaskSummary
    upcoming_tasks: List[TaskResult]                 # next 5 unfinished tasks, soonest deadline first
    my_strikes: List[StrikeResponse]                 # not dismissed, newest first
    recent_commendations: List[CommendationResponse]  # latest 5
    # Every team the user can view (D24; ticket 05 called it managed_teams)
    teams: List[TeamOverview]
    # Only with org-level view_aggregate
    org_overview: Optional[OrgOverview] = None
