"""
Read tools for the Trellis agent (ticket 04 tools, ticket 03 §1a/§6, ticket 12 D19/D24).

Each tool is a thin wrapper over a shared data-access function in app/services/.
The user's AccessScope comes from the LangGraph runtime context via
_scope() (get_runtime(AgentContext)). It is not a tool argument, so the LLM can
only pass business arguments and can never read, widen or forge its own
permissions. (An injected ToolRuntime argument works too, but LangChain then runs
the AccessScope through Pydantic on every call and logs serializer warnings.)

Each tool opens its own short DB session (ticket 03 §6): the graph run can
outlive the request that started it.

search_documents returns its chunks as the ToolMessage `artifact`; the graph's
collect step copies them into AgentState.retrieved_chunks (the citation check
needs them). Task and summary results are plain text and are never cited.
"""

import uuid
from typing import Literal, Optional

from fastapi import HTTPException
from langchain_core.tools import tool
from langgraph.runtime import get_runtime

from app.agent.state import AgentContext, RetrievedChunk
from app.core.database import async_session
from app.schemas.tasks import TaskFilters
from app.scope.resolver import AccessScope
from app.services.documents import search_chunks
from app.services.embeddings import EmbeddingError
from app.services.tasks import list_tasks, team_summary


def _scope() -> AccessScope:
    """The caller's AccessScope for this run (ticket 03 §6)."""
    return get_runtime(AgentContext).context.scope


def citation_tag(chunk_id: str) -> str:
    """Short label the answer cites a chunk by, e.g. [3f9a12bc]. Checked in code (D20)."""
    return chunk_id.replace("-", "")[:8]


async def run_document_search(scope: AccessScope, query: str) -> tuple[str, list[RetrievedChunk]]:
    """
    The search behind search_documents: (text for the LLM, chunks for the
    citation check). Also used by the graph's rewrite step.
    """
    try:
        async with async_session() as db:
            hits = await search_chunks(db, scope, query)
    except EmbeddingError as exc:
        return f"Document search is unavailable right now: {exc}", []

    chunks: list[RetrievedChunk] = [
        {
            "chunk_id": hit["chunk_id"],
            "document_id": hit["document_id"],
            "title": hit["title"],
            "chunk_index": hit["chunk_index"],
            "text": hit["text"],
        }
        for hit in hits
    ]
    if not chunks:
        return "No documents matched this search.", []
    content = "\n\n".join(
        f"[{citation_tag(c['chunk_id'])}] {c['title']} (part {c['chunk_index'] + 1})\n{c['text']}"
        for c in chunks
    )
    return content, chunks


@tool(response_format="content_and_artifact")
async def search_documents(query: str) -> tuple[str, list[RetrievedChunk]]:
    """
    Search the organization's documents (policies, SOPs, handbooks) the user is
    allowed to read. Use for any question about rules, procedures or document
    content. `query` is a short, specific search phrase.
    """
    return await run_document_search(_scope(), query)


@tool
async def get_tasks(
    assigned_to_me: bool = False,
    team_id: Optional[str] = None,
    status: Optional[Literal["todo", "in_progress", "done", "blocked"]] = None,
    overdue_only: bool = False,
) -> str:
    """
    List tasks the user can see. Filters: only tasks assigned to the user,
    one team (team_id from an @team mention or from get_team_summary), a
    status, or only overdue tasks. An empty list is a valid answer.
    """
    try:
        filters = TaskFilters(
            assigned_to_me=assigned_to_me,
            team_id=uuid.UUID(team_id) if team_id else None,
            status=status,
            overdue_only=overdue_only,
        )
    except ValueError:
        return "That team id isn't valid."
    try:
        async with async_session() as db:
            tasks = await list_tasks(db, _scope(), filters)
    except HTTPException:
        return "Team not found."

    if not tasks:
        return "No tasks match."
    return "\n".join(
        f"- {t.title} | team: {t.team_name} | status: {t.status}"
        f" | assignee: {t.assigned_to_name or 'unassigned'}"
        f" | deadline: {t.deadline.date().isoformat() if t.deadline else 'none'}"
        f"{' | OVERDUE' if t.overdue else ''}"
        for t in tasks
    )


@tool
async def get_team_summary() -> str:
    """
    Overview of every team the user can see: member count, task counts by
    status, overdue tasks, and active strikes where the user may see them.
    Also gives each team's id, for get_tasks.
    """
    async with async_session() as db:
        teams = await team_summary(db, _scope())

    if not teams:
        return "The user can't see any teams."
    lines = []
    for team in teams:
        s = team.task_summary
        line = (
            f"- {team.team_name} (team_id {team.team_id}) | members: {team.member_count}"
            f" | tasks: {s.todo} to do, {s.in_progress} in progress, {s.blocked} blocked,"
            f" {s.done} done, {s.overdue} overdue"
        )
        if team.active_strikes is not None:
            line += f" | active strikes: {team.active_strikes}"
        lines.append(line)
    return "\n".join(lines)


READ_TOOLS = [search_documents, get_tasks, get_team_summary]
