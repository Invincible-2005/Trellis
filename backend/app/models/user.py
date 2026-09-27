import uuid
from datetime import datetime
from typing import List

from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.core.database import Base
if TYPE_CHECKING:
    from app.models.organization import OrgMember
    from app.models.team import TeamMember

class User(Base):
    """Clerk-authenticated user. No org_id — multi-org via OrgMember bridge table."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    clerk_user_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships — string references only, no imports needed
    org_memberships: Mapped[List["OrgMember"]] = relationship(back_populates="user")
    team_memberships: Mapped[List["TeamMember"]] = relationship(back_populates="user")