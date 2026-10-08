import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.role import Role
    from app.models.team import Team

class Organization(Base):
    """Top-level workspace. Isolated by org_id — every query is bounded by it."""
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    clerk_org_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[List["OrgMember"]] = relationship(back_populates="org")
    roles: Mapped[List["Role"]] = relationship(back_populates="org")
    teams: Mapped[List["Team"]] = relationship(back_populates="org")


class OrgMember(Base):
    """
    Bridge: user ↔ org. Supports multi-org membership.
    `role_id` is the optional org-level role (D9), held alongside per-team roles.
    """
    __tablename__ = "org_members"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id"),
        # "Who holds role X" — cache invalidation, last-Admin check
        Index("idx_org_members_role", "org_id", "role_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("roles.id", name="fk_org_members_role_id_roles"), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="org_memberships")
    role: Mapped[Optional["Role"]] = relationship()