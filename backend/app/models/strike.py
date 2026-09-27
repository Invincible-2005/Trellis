import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, Enum, Boolean, DateTime, Text, ARRAY
from sqlalchemy.orm import Mapped, mapped_column


from app.core.database import Base


# ─────────────────────────────────────────────
# STRIKES
# ─────────────────────────────────────────────

class Strike(Base):
    """
    Issued by a higher-role user against a lower-role user.
    Agent validates reason against org policy docs (RAG) before confirming.
    Threshold: 3 confirmed strikes → escalated = True → notify role above.
    """
    __tablename__ = "strikes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    given_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    given_to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    policy_chunk_ids: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)  # UUIDs of RAG chunks used
    agent_evaluation: Mapped[Optional[str]] = mapped_column(Text)  # Agent's verdict text
    status: Mapped[str] = mapped_column(
        Enum("pending_agent_review", "confirmed", "appealed", "dismissed", name="strike_status"),
        default="pending_agent_review"
    )
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)