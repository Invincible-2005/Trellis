import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, Integer, DateTime, Text, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ─────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────

class AuditLog(Base):
    """Immutable log of every agent action. Scope is snapshotted at time of query."""
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_ids_at_time: Mapped[List[str]] = mapped_column(ARRAY(String))  # Snapshot of user's roles at query time
    query: Mapped[str] = mapped_column(Text, nullable=False)
    tools_called: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    chunks_retrieved_ids: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    chunks_denied_count: Mapped[int] = mapped_column(Integer, default=0)
    answer_summary: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)