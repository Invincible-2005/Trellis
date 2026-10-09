"""
app/schemas/tasks.py — Task list and team summary shapes (Ticket 05 §5/§7, Ticket 12 D24)

Shared by the future /api/v1/tasks and /api/v1/dashboard routes and the chat
agent's get_tasks / get_team_summary tools.
"""
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.auth import AppBaseModel

TaskStatus = Literal["todo", "in_progress", "done", "blocked"]


class TaskFilters(BaseModel):
    """Optional filters for list_tasks. Leaving all of them out lists every visible task."""

    assigned_to_me: bool = False
    team_id: Optional[UUID] = None
    status: Optional[TaskStatus] = None
    overdue_only: bool = False      # deadline passed and not done
    limit: int = Field(default=20, ge=1, le=50)


class TaskResult(AppBaseModel):
    id: UUID
    team_id: UUID
    team_name: str
    title: str
    description: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    deadline: Optional[datetime] = None
    status: TaskStatus
    overdue: bool


class TaskSummary(BaseModel):
    todo: int = 0
    in_progress: int = 0
    done: int = 0
    blocked: int = 0
    overdue: int = 0


class TeamOverview(BaseModel):
    team_id: UUID
    team_name: str
    member_count: int
    task_summary: TaskSummary
    # None = the user can't give or review strikes in this team (D24)
    active_strikes: Optional[int] = None
