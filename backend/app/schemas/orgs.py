"""
app/schemas/orgs.py — Org setup schemas (Ticket 05 §7)
"""
from uuid import UUID

from app.schemas.auth import AppBaseModel, OrgSummary


# POST /api/v1/orgs/provision takes no body: the org comes from the token (D10).
class ProvisionOrgResponse(AppBaseModel):
    org: OrgSummary
    admin_role_id: UUID
    created: bool               # False if the org was already provisioned (idempotent call)
