"""
app/schemas/tasks.py — Task, hand-in and team summary shapes (Ticket 05 §5/§7, Ticket 12 D24/D32/D33/D59)

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
    assigned_to_user_id: Optional[UUID] = None   # one person's tasks (the chat's @ mentions, D43)
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
    # Hand-ins (D59): only the assignee hands in; the assignee and managers see them
    can_submit: bool = False
    can_view_submissions: bool = False
    # Hand-ins you can see on this task; None when can_view_submissions is false
    submission_count: Optional[int] = None
    # Comments on this task; everyone who sees the task sees them (D60)
    comment_count: int = 0


class TaskListResponse(BaseModel):
    tasks: List[TaskResult]


# ── hand-ins (D59) ────────────────────────────────────────────────────────────

MAX_SUBMISSION_BYTES = 16 * 1024 * 1024   # same as the upload route


class CreateSubmissionRequest(BaseModel):
    """A file already uploaded to UploadThing, handed in on a task with an optional note."""

    file_url: str
    file_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    file_size: Optional[int] = Field(default=None, ge=0, le=MAX_SUBMISSION_BYTES)
    notes: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]] = None


class SubmissionResult(AppBaseModel):
    id: UUID
    task_id: UUID
    submitted_by_user_id: UUID
    submitted_by_name: str
    file_url: str
    file_name: str
    file_size: Optional[int] = None
    notes: Optional[str] = None
    submitted_at: datetime
    can_delete: bool = False   # only the person who handed it in


class SubmissionListResponse(BaseModel):
    submissions: List[SubmissionResult]


# ── comments (D60) ────────────────────────────────────────────────────────────

class CommentRequest(BaseModel):
    """Posting or editing a comment: plain text, trimmed."""

    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class CommentResult(AppBaseModel):
    id: UUID
    task_id: UUID
    author_user_id: UUID
    author_name: str
    content: str
    created_at: datetime
    edited_at: Optional[datetime] = None   # set = show "(edited)"
    # Only the author edits or deletes (D60 b)
    can_edit: bool = False
    can_delete: bool = False


class CommentListResponse(BaseModel):
    comments: List[CommentResult]


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
