import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (UniqueConstraint("email", "org_id", "team_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), nullable=False)
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "expired", name="invitation_status"),
        default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)