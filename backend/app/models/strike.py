import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, Enum, Boolean, DateTime, Index, Text, ARRAY
from sqlalchemy.orm import Mapped, mapped_column


from app.core.database import Base


# ─────────────────────────────────────────────
# STRIKES
# ─────────────────────────────────────────────

class Strike(Base):
    """
    Issued by someone with give_strike in the team against a member ranked below
    them there (D30 yardstick). Before saving, the reason is checked against the
    policy documents the giver can see; the result is a warning, never a block
    (Ticket 12 D46), and is kept here for appeal reviewers.

    Status (D6): saved as `confirmed` (the user confirmed the card, D22);
    `pending_agent_review` is no longer written. The receiver may appeal once
    (`appealed`, with appeal_notes); a reviewer upholds it (back to `confirmed`)
    or dismisses it (`dismissed`), setting reviewed_by / reviewed_at.
    Threshold: the 3rd active (confirmed or appealed) strike in a team sets
    escalated = True.
    """
    __tablename__ = "strikes"
    __table_args__ = (Index("idx_strikes_team_receiver", "team_id", "given_to_user_id"),)  # 3-strike count

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    given_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    given_to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    policy_chunk_ids: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)  # policy passages shown on the card
    agent_evaluation: Mapped[Optional[str]] = mapped_column(Text)  # policy check verdict + explanation (D46)
    status: Mapped[str] = mapped_column(
        Enum("pending_agent_review", "confirmed", "appealed", "dismissed", name="strike_status"),
        default="confirmed"
    )
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    # Appeal and review (D6)
    appeal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
