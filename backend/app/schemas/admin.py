"""
app/schemas/admin.py — Admin console schemas (Ticket 05 §2/§7, Ticket 12 D17)
"""
from datetime import datetime
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

from app.models.role import ROLE_PERMISSIONS
from app.schemas.auth import AppBaseModel, InvitationResponse

# The 8 permission names. An unknown name is rejected with 422, and the frontend's
# generated types get them as a fixed union (the permission checkboxes).
Permission = Literal[ROLE_PERMISSIONS]  # type: ignore[valid-type]

RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=50)]


class RoleResponse(AppBaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    parent_role_id: Optional[UUID] = None
    depth: int = 0                   # 0 for the root Admin role
    permissions: List[str] = Field(default_factory=list)
    is_system: bool = False          # root Admin; UI disables edit, move and delete (D9, D17)
    manageable: bool = False         # strictly below the caller's org-level role (D17)
    # manageable AND holds only permissions the caller has: may be given to a member
    # (invite dialog's role picker, D9 "grant only permissions you hold")
    assignable: bool = False
    created_at: datetime


class RoleListResponse(AppBaseModel):
    roles: List[RoleResponse]


class CreateRoleRequest(BaseModel):
    name: RoleName
    description: Optional[str] = None
    # Required: a new role always sits under an existing one; only Admin is a root (D17).
    parent_role_id: UUID
    permissions: List[Permission] = Field(default_factory=list)


class UpdateRoleRequest(BaseModel):
    """Edit or move a role. A missing (or null) field is left unchanged."""
    name: Optional[RoleName] = None
    description: Optional[str] = None       # "" clears it
    parent_role_id: Optional[UUID] = None   # moves the role and everything under it
    permissions: Optional[List[Permission]] = None  # the full new list


# ── Members (Admin → Members, ticket 12 D25/D26) ─────────────────────────────

# Lowercased and trimmed; a light format check only (Clerk validates the address fully).
MemberEmail = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    ),
]


class MemberResponse(AppBaseModel):
    user_id: UUID
    name: str
    email: str
    org_role_id: Optional[UUID] = None     # org-level role (D9); null = no org role
    org_role_name: Optional[str] = None
    joined_at: datetime
    # The caller may change this person's org role or remove them (D38): not the
    # caller, and every role they hold (org-wide and in each team) is below the caller's.
    manageable: bool = False


class MemberListResponse(AppBaseModel):
    members: List[MemberResponse]
    invitations: List[InvitationResponse]  # pending invites to this org, newest first


class AddMemberRequest(BaseModel):
    email: MemberEmail
    role_id: Optional[UUID] = None         # org-level role; must be assignable by the caller


class UpdateMemberRequest(BaseModel):
    # Required, may be null: null = no org-level role. Must be assignable by the caller.
    role_id: Optional[UUID]


class AddMemberResponse(AppBaseModel):
    # "added": had a Trellis account, now in the org (member is set).
    # "invited": Clerk emailed an invite (invitation is set), applied on their first visit.
    status: Literal["added", "invited"]
    member: Optional[MemberResponse] = None
    invitation: Optional[InvitationResponse] = None
