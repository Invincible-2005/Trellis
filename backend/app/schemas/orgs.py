"""
app/schemas/orgs.py — Org setup and org profile schemas (Ticket 05 §7, Ticket 12 D34/D35)
"""
from typing import Annotated, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.auth import AppBaseModel, OrgSummary


# POST /api/v1/orgs/provision takes no body: the org comes from the token (D10).
class ProvisionOrgResponse(AppBaseModel):
    org: OrgSummary
    admin_role_id: UUID
    created: bool               # False if the org was already provisioned (idempotent call)


# GET/PATCH /api/v1/orgs/current: the active org's profile for the /organization page (D34/D35).
class OrgProfileResponse(AppBaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    can_edit_description: bool  # only holders of the protected root Admin role (D35)


class UpdateOrgDescriptionRequest(BaseModel):
    # Empty or null clears it
    description: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]] = None
