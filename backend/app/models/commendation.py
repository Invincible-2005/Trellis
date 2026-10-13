import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ─────────────────────────────────────────────
# COMMENDATIONS
# ─────────────────────────────────────────────

class Commendation(Base):
    """
    Praise from someone ranked above the person in that team (Ticket 12 D5):
    the receiver's team role is strictly below the giver's org role or the
    giver's role in that team. No permission needed; peers can't commend each
    other. The positive counterpart of a strike, without status, appeal or
    escalation. Kept as history when the receiver leaves (D38); a team that
    has any can't be deleted (D31).
    """
    __tablename__ = "commendations"
    __table_args__ = (
        Index("idx_commendations_to_user", "org_id", "given_to_user_id", "created_at"),
        Index("idx_commendations_team", "team_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    given_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    given_to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
