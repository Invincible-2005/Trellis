"""
app/services/dashboard.py — Everything the /dashboard page shows (Ticket 12 D24/D47)

Read-only. Each part comes from the shared, scope-checked lookups:
- my work: services/tasks.py (my_task_summary, upcoming_tasks),
  services/strikes.py (list_my_strikes), services/commendations.py (list_my_commendations);
- team cards: services/tasks.py::team_summary, the same as the chat's get_team_summary;
- org totals: only for org-level view_aggregate.
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.organization import OrgMember
from app.models.role import Role
from app.models.strike import Strike
from app.models.team import Team
from app.schemas.dashboard import DashboardResponse, OrgOverview
from app.scope.resolver import AccessScope
from app.services import commendations, strikes, tasks


async def get_dashboard(db: AsyncSession, scope: AccessScope) -> DashboardResponse:
    return DashboardResponse(
        my_tasks=await tasks.my_task_summary(db, scope),
        upcoming_tasks=await tasks.upcoming_tasks(db, scope),
        my_strikes=await strikes.list_my_strikes(db, scope),
        recent_commendations=await commendations.list_my_commendations(db, scope),
        teams=await tasks.team_summary(db, scope),
        org_overview=await org_overview(db, scope) if scope.can_org("view_aggregate") else None,
    )


async def org_overview(db: AsyncSession, scope: AccessScope) -> OrgOverview:
    """Org-wide totals. The caller checks view_aggregate first."""

    async def count(model, *conditions) -> int:
        return await db.scalar(
            select(func.count()).select_from(model).where(model.org_id == scope.org_id, *conditions)
        ) or 0

    return OrgOverview(
        total_users=await count(OrgMember),
        total_teams=await count(Team),
        total_roles=await count(Role),
        total_documents=await count(Document, Document.status == "ready"),
        active_strikes=await count(Strike, Strike.status != "dismissed"),
    )
