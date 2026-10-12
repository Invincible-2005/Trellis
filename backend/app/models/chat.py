import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ─────────────────────────────────────────────
# CHAT SESSIONS
# ─────────────────────────────────────────────

class ChatSession(Base):
    """
    User-facing chat session metadata.
    The conversation itself (messages, agent state) lives in LangGraph's checkpoint
    tables in the same Neon database (D11), keyed by "{org_id}:{user_id}:{id}";
    this row holds what the chat list shows (title, timestamps).
    """
    __tablename__ = "chat_sessions"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id", "id"),
        # Chat list: a user's chats in one org, most recently used first (ticket 08)
        Index("idx_chat_sessions_user_org", "user_id", "org_id", text("last_active_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Auto-titled from first message
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # When a message was last sent (set by the message endpoint); renaming doesn't move a chat in the list
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)