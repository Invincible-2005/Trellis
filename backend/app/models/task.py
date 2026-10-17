import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, Enum, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.team import Team
# ─────────────────────────────────────────────
# TASKS, SUBMISSIONS & COMMENTS
# ─────────────────────────────────────────────

class Task(Base):
    """Team work item. blocked_by_task_id forms a DAG for dependency tracking."""
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    assigned_to_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("todo", "in_progress", "done", "blocked", name="task_status"),
        default="todo"
    )
    blocked_by_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    team: Mapped["Team"] = relationship(back_populates="tasks")
    submissions: Mapped[List["TaskSubmission"]] = relationship(back_populates="task")
    comments: Mapped[List["TaskComment"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    blocking_task: Mapped[Optional["Task"]] = relationship(remote_side="Task.id")


class TaskSubmission(Base):
    """
    Work handed in on a task by its assignee (like Google Classroom), Ticket 12 D59.
    No 'upload_document' permission required. One file per row, stored in UploadThing;
    several rows per task are kept as history. Never embedded or searched by the chat.
    """
    __tablename__ = "task_submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False)  # External storage URL
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # bytes
    notes: Mapped[Optional[str]] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="submissions")
    submitted_by: Mapped["User"] = relationship()


class TaskComment(Base):
    """
    Comments on a task (Ticket 12 D60): anyone who can see the task reads and posts;
    only the author edits or deletes their own. Plain text. Deleted with the task.
    The AI agent will read them in a follow-up ("Why is Task X blocked?").
    """
    __tablename__ = "task_comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # shown as "(edited)"

    task: Mapped["Task"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship()