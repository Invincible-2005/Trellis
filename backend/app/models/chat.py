import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ─────────────────────────────────────────────
# CHAT SESSIONS
# ─────────────────────────────────────────────

class ChatSession(Base):
    """
    User-facing chat session metadata.
    LangGraph checkpointer state (message history blobs) lives in checkpoints.db (SQLite),
    while metadata (title, timestamps) lives here in Postgres for fast sidebar listing.
    """
    __tablename__ = "chat_sessions"
    __table_args__ = (UniqueConstraint("org_id", "user_id", "id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Auto-titled from first message
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)