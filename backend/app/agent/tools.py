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
from app.services.documents import documents_visible_to, search_chunks
from app.services.embeddings import EmbeddingError
from app.services.members import find_people as directory_lookup
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
    assigned_to_user_id: Optional[str] = None,
    team_id: Optional[str] = None,
    status: Optional[Literal["todo", "in_progress", "done", "blocked"]] = None,
    overdue_only: bool = False,
) -> str:
    """
    List tasks the user can see. Filters: only tasks assigned to the user,
    one person's tasks (assigned_to_user_id from an @ mention), one team
    (team_id from a / mention or from get_team_summary), a status, or only
    overdue tasks. An empty list is a valid answer.
    """
    try:
        filters = TaskFilters(
            assigned_to_me=assigned_to_me,
            assigned_to_user_id=uuid.UUID(assigned_to_user_id) if assigned_to_user_id else None,
            team_id=uuid.UUID(team_id) if team_id else None,
            status=status,
            overdue_only=overdue_only,
        )
    except ValueError:
        return "That person or team id isn't valid."
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


@tool
async def find_people(query: Optional[str] = None, user_id: Optional[str] = None) -> str:
    """
    Look people up in the organization's directory: who someone is, their org
    role and the teams they're on. Pass user_id from an @ mention, or query with
    a word from a name, email or role (e.g. "HR", "Jayant"). Only teams the user
    can see are listed.
    """
    try:
        person_id = uuid.UUID(user_id) if user_id else None
    except ValueError:
        return "That person id isn't valid."
    if person_id is None and not (query or "").strip():
        return "Give a name, email or role to search for, or a person from an @ mention."

    async with async_session() as db:
        people = await directory_lookup(db, _scope(), query, person_id)

    if not people:
        return "Nobody in the organization matches."
    lines = []
    for p in people:
        teams = ", ".join(f"{t.team_name} ({t.role_name})" for t in p.teams) or "none the user can see"
        lines.append(
            f"- {p.name} | email: {p.email} | user_id {p.user_id}"
            f" | org role: {p.org_role_name or 'none'} | teams: {teams}"
        )
    return "\n".join(lines)


# D56: the same note for everyone, so it never hints whether anything is hidden.
PERSON_DOCUMENTS_NOTE = (
    "Note (always tell the user): only documents the user can also see are listed;"
    " this person may have access to others."
)


@tool
async def get_person_documents(user_id: str) -> str:
    """
    Which documents a person can see (user_id from an @ mention or find_people).
    Lists only documents the user can see too, with who each is shared with.
    """
    try:
        person_id = uuid.UUID(user_id)
    except ValueError:
        return "That person id isn't valid."
    async with async_session() as db:
        documents = await documents_visible_to(db, _scope(), person_id)

    if documents is None:
        return "That person isn't in this organization."
    if not documents:
        return f"They can't see any of the documents the user can see. {PERSON_DOCUMENTS_NOTE}"
    return PERSON_DOCUMENTS_NOTE + "\n" + "\n".join(
        f"- {d['title']} | shared with: {d['audience']}"
        + ("" if d["status"] == "ready" else f" | status: {d['status']}")
        for d in documents
    )


READ_TOOLS = [search_documents, get_tasks, get_team_summary, find_people, get_person_documents]


# ── Write tools (D22/D45) ────────────────────────────────────────────────────
# Only their schemas reach the LLM. A write tool call is never executed directly:
# the graph's prepare_action step checks it and builds a Confirm card
# (app/agent/actions.py), and the save happens only after the user's click.

@tool
async def create_task(
    team_id: str,
    assigned_to_user_id: str,
    title: str,
    description: Optional[str] = None,
    deadline: Optional[str] = None,
) -> str:
    """
    Propose a new task for one team member. The user confirms it on a card
    before anything is saved. team_id and assigned_to_user_id come from the
    /team and @person tokens in the user's message. deadline is a date as
    YYYY-MM-DD (the task is due by the end of that day).
    """
    return "Waiting for the user to confirm."   # never runs (see above)


@tool
async def give_commendation(team_id: str, to_user_id: str, reason: str) -> str:
    """
    Propose a commendation (praise) for one team member ranked below the user.
    The user confirms it on a card before anything is saved. team_id and
    to_user_id come from the /team and @person tokens in the user's message.
    reason says what the person did well, in a sentence or two.
    """
    return "Waiting for the user to confirm."   # never runs (see above)


@tool
async def give_strike(team_id: str, to_user_id: str, reason: str) -> str:
    """
    Propose a formal strike for one team member ranked below the user. The app
    checks the reason against the policy documents and the user confirms it on
    a card before anything is saved. team_id and to_user_id come from the /team
    and @person tokens in the user's message. reason is what the person did, in
    the user's own words.
    """
    return "Waiting for the user to confirm."   # never runs (see above)


WRITE_TOOLS = [create_task, give_commendation, give_strike]
