import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, DateTime, Text, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
# ─────────────────────────────────────────────
# ROLE HIERARCHY
# ─────────────────────────────────────────────

class Role(Base):
    """
    Global org role. Tree via parent_role_id (recursive CTE for traversal).
    Document access: doc tagged to Role R → visible to R and all ancestors.
    """
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_role_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("roles.id"), nullable=True)
    # Permissions stored as array of strings (use Enum in strict implementations)
    # Values: 'create_role','create_team','add_member','upload_document',
    #         'assign_task','give_strike','view_aggregate'
    permissions: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    org: Mapped["Organization"] = relationship(back_populates="roles")
    children: Mapped[List["Role"]] = relationship(back_populates="parent")
    parent: Mapped[Optional["Role"]] = relationship(back_populates="children", remote_side="Role.id")


