"""
app/schemas/tasks.py — Task and team summary shapes (Ticket 05 §5/§7, Ticket 12 D24/D32/D33)

Shared by /api/v1/tasks, the future /api/v1/dashboard route and the chat
agent's get_tasks / get_team_summary / create_task tools.
"""
from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, model_validator

from app.schemas.auth import AppBaseModel

TaskStatus = Literal["todo", "in_progress", "done", "blocked"]


class TaskFilters(BaseModel):
    """Optional filters for list_tasks. Leaving all of them out lists every visible task."""

    assigned_to_me: bool = False
    team_id: Optional[UUID] = None
    status: Optional[TaskStatus] = None
    overdue_only: bool = False      # deadline passed and not done
    limit: int = Field(default=20, ge=1, le=200)   # the agent uses the default; pages ask for more


TaskTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]


def _to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """The tasks table stores naive UTC; a deadline sent with a timezone is converted."""
    if value is not None and value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


Deadline = Annotated[Optional[datetime], AfterValidator(_to_naive_utc)]


class CreateTaskRequest(BaseModel):
    """D32: the assignee is required and must be a team member ranked below the creator."""

    team_id: UUID
    title: TaskTitle
    description: Optional[str] = None
    assigned_to_user_id: UUID
    deadline: Deadline = None   # stored as naive UTC


class UpdateTaskRequest(BaseModel):
    """
    Only the fields sent change. The assignee may send only `status`; managers
    may send anything (D33). `deadline: null` clears the deadline; title, assignee
    and status can't be cleared (D32: no unassigned tasks).
    """

    title: Optional[TaskTitle] = None
    description: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    deadline: Deadline = None
    status: Optional[TaskStatus] = None

    @model_validator(mode="after")
    def _no_clearing_required_fields(self) -> "UpdateTaskRequest":
        for name in ("title", "assigned_to_user_id", "status"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} can't be empty")
        return self


class TaskResult(AppBaseModel):
    id: UUID
    team_id: UUID
    team_name: str
    title: str
    description: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    created_by_name: Optional[str] = None
    deadline: Optional[datetime] = None
    status: TaskStatus
    overdue: bool
    # Button flags (D33): managers edit, reassign, delete; the assignee only moves the status
    can_edit: bool = False
    can_change_status: bool = False


class TaskListResponse(BaseModel):
    tasks: List[TaskResult]


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
