"""
app/schemas/auth.py — Auth & onboarding response schemas (Ticket 05 §1)

These are the OpenAPI contract the frontend generates its types from.
"""
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AppBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OrgSummary(AppBaseModel):
    id: UUID
    name: str
    clerk_org_id: str


class InvitationStatusEnum(str, Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"


class InvitationResponse(AppBaseModel):
    id: UUID
    email: str
    org_id: UUID
    org_name: str
    # null for an org-only invite (D25); role is then the optional org-level role
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    invited_by_name: str
    status: InvitationStatusEnum
    created_at: datetime


class AuthMeResponse(AppBaseModel):
    user_id: UUID
    clerk_user_id: str
    email: str
    name: str
    active_org_id: Optional[UUID] = None   # None if no active org, or not set up yet


class ActiveOrgPermissions(BaseModel):
    """
    Effective permissions in the token's active org (D4, D9, D13).
    For showing/hiding UI only — the backend still enforces every action.
    """
    org_id: UUID
    org_role_id: Optional[UUID] = None
    org_role_name: Optional[str] = None
    org_permissions: List[str] = Field(default_factory=list)
    permissions_by_team: dict[UUID, List[str]] = Field(default_factory=dict)
    member_team_ids: List[UUID] = Field(default_factory=list)
    viewable_team_ids: List[UUID] = Field(default_factory=list)   # members + governed teams
    # Admin console tabs this user may open (D4 follow-up, 2026-10-09). The layout
    # and sidebar show exactly these; can_open_admin = at least one tab.
    # No "teams" tab since D28 (2026-10-10): teams live at /teams.
    admin_tabs: List[Literal["roles", "members", "documents", "strikes"]] = Field(default_factory=list)
    can_open_admin: bool


class AuthContextResponse(AppBaseModel):
    organizations: List[OrgSummary]
    pending_invitations: List[InvitationResponse]
    active_org: Optional[ActiveOrgPermissions] = None   # None if no active or provisioned org
