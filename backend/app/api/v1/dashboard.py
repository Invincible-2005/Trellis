"""
app/api/v1/dashboard.py — The /dashboard page's data (Ticket 05 §7, Ticket 12 D47/D48)

The router requires an org (get_org_context). One read-only call; the logic
lives in app/services/dashboard.py.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.dashboard import DashboardResponse
from app.scope.resolver import AccessScope
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_org_context)])


@router.get(
    "",
    response_model=DashboardResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def get_dashboard(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    """
    Everything /dashboard shows: my task counts, next 5 deadlines, my strikes and
    latest 5 commendations (D47); a card per team I can view (D24); org totals
    only with org-level view_aggregate.
    """
    return await dashboard.get_dashboard(db, scope)
