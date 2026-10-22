"""
app/services/documents.py — Documents: who can see them, who can place them
(Ticket 02, 03 §1a, 11; Ticket 12 D13, D23)

The ONE visibility rule for documents, shared by the REST endpoints (list, get)
and the chat agent's search_documents tool (search_chunks). Neither writes its
own filter, so the list page and the agent can never disagree about what a user
may see.

A user sees a document when it is in their org AND:
    scope_type='org'   → always
    scope_type='role'  → role_id is their role or a role below it (visible_role_ids)
    scope_type='team'  → they are on the team, or every member ranks below them
                         (viewable_team_ids, D13)
A document they can't see behaves exactly like a missing one.

Placing (upload) and deleting follow "at or below yourself" (D23):
    org   → can_org("upload_document")
    role  → can_org("upload_document") and the role is the caller's org role or below it
    team  → can("upload_document", team) and can_view_team(team)
"""
import logging
import re
import uuid
from typing import Optional
from urllib.parse import unquote, urlsplit

from fastapi import status
from sqlalchemy import and_, delete, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing_extensions import TypedDict

from app.core.errors import api_error
from app.models.document import Document, DocumentChunk
from app.models.organization import OrgMember
from app.models.role import Role
from app.models.task import TaskSubmission
from app.models.team import Team
from app.schemas.documents import (
    CreateDocumentRequest,
    DocumentResponse,
    DocumentTagOptions,
    FileUsageResponse,
    TagTarget,
    UpdateDocumentRequest,
)
from app.scope.resolver import AccessScope, resolve_scope
from app.services.embeddings import embed_query
from app.services.ingestion import is_allowed_file_url

logger = logging.getLogger(__name__)


def _visible(model, scope: AccessScope):
    """
    SQL condition for the visibility rule. Works on Document and on
    DocumentChunk (chunks carry the same scope columns, denormalized).
    """
    return and_(
        model.org_id == scope.org_id,
        or_(
            model.scope_type == "org",
            and_(model.scope_type == "role", model.role_id.in_(list(scope.visible_role_ids))),
            and_(model.scope_type == "team", model.team_id.in_(list(scope.viewable_team_ids))),
        ),
    )


class SharedDocument(TypedDict):
    title: str
    audience: str       # "whole org", "role TEST-Employee", "team Alpha"
    status: str         # processing | ready | failed


async def documents_visible_to(
    db: AsyncSession, scope: AccessScope, user_id: uuid.UUID
) -> Optional[list[SharedDocument]]:
    """
    Which documents another org member can see, limited to documents the caller
    can see too (D53). Follows the role tree: for someone below the caller it is
    their whole list; for anyone else it never reveals a document the caller
    couldn't open. The person's access is their own resolve_scope().

    Returns None when the person isn't in the caller's org.
    """
    in_org = await db.scalar(
        select(OrgMember.user_id).where(OrgMember.user_id == user_id, OrgMember.org_id == scope.org_id)
    )
    if in_org is None:
        return None
    person = await resolve_scope(user_id, scope.org_id, db)

    rows = (
        await db.execute(
            select(Document.title, Document.scope_type, Document.status, Role.name, Team.name)
            .outerjoin(Role, Role.id == Document.role_id)
            .outerjoin(Team, Team.id == Document.team_id)
            .where(_visible(Document, scope), _visible(Document, person))
            .order_by(Document.title)
        )
    ).all()
    return [
        {"title": title, "audience": _audience(scope_type, role_name, team_name), "status": status_}
        for title, scope_type, status_, role_name, team_name in rows
    ]


def _audience(scope_type: str, role_name: Optional[str], team_name: Optional[str]) -> str:
    if scope_type == "role":
        return f"role {role_name}"
    if scope_type == "team":
        return f"team {team_name}"
    return "whole org"


def can_place(
    scope: AccessScope,
    scope_type: str,
    role_id: Optional[uuid.UUID],
    team_id: Optional[uuid.UUID],
) -> bool:
    """May the caller upload a document with this tag, or delete one that has it (D23)?"""
    if scope_type == "org":
        return scope.can_org("upload_document")
    if scope_type == "role":
        return (
            scope.can_org("upload_document")
            and role_id is not None
            and (role_id == scope.org_role_id or scope.can_manage_role(role_id))
        )
    if scope_type == "team":
        return (
            team_id is not None
            and scope.can("upload_document", team_id)
            and scope.can_view_team(team_id)
        )
    return False


def _to_response(document: Document, scope: AccessScope) -> DocumentResponse:
    response = DocumentResponse.model_validate(document)
    response.deletable = can_place(scope, document.scope_type, document.role_id, document.team_id)
    return response


async def _get_visible(db: AsyncSession, scope: AccessScope, document_id: uuid.UUID) -> Document:
    """A document the user may see; anything else is 404 (its existence never leaks)."""
    document: Optional[Document] = await db.scalar(
        select(Document).where(Document.id == document_id, _visible(Document, scope))
    )
    if document is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "document_not_found", "Document not found.")
    return document


# ── Documents (list page, status polling, upload, delete) ─────────────────────

async def list_documents(db: AsyncSession, scope: AccessScope) -> list[DocumentResponse]:
    """Every document the user may see, newest first (any status)."""
    documents = (
        await db.scalars(
            select(Document).where(_visible(Document, scope)).order_by(Document.created_at.desc())
        )
    ).all()
    return [_to_response(document, scope) for document in documents]


async def get_document(db: AsyncSession, scope: AccessScope, document_id: uuid.UUID) -> DocumentResponse:
    """
    One document the user may see (the page polls this while it's processing).

    Raises:
        404 document_not_found — missing, in another org, or not visible to the user
    """
    return _to_response(await _get_visible(db, scope, document_id), scope)


async def tag_options(db: AsyncSession, scope: AccessScope) -> DocumentTagOptions:
    """Every place the caller may tag a new document, by the same rule as can_place (D23)."""
    role_ids = [
        rid for rid in {scope.org_role_id, *scope.manageable_role_ids}
        if rid is not None and can_place(scope, "role", rid, None)
    ]
    team_ids = [tid for tid in scope.viewable_team_ids if can_place(scope, "team", None, tid)]

    roles = (
        await db.execute(
            select(Role.id, Role.name).where(Role.org_id == scope.org_id, Role.id.in_(role_ids)).order_by(Role.name)
        )
    ).all() if role_ids else []
    teams = (
        await db.execute(
            select(Team.id, Team.name).where(Team.org_id == scope.org_id, Team.id.in_(team_ids)).order_by(Team.name)
        )
    ).all() if team_ids else []

    return DocumentTagOptions(
        org=can_place(scope, "org", None, None),
        roles=[TagTarget(id=r.id, name=r.name) for r in roles],
        teams=[TagTarget(id=t.id, name=t.name) for t in teams],
    )


_FILE_PATH = re.compile(r"^/f/([^/]+)$")


def file_key(file_url: str) -> Optional[str]:
    """The UploadThing file key in a link (<app>.ufs.sh/f/<key> or utfs.io/f/<key>), else None."""
    try:
        match = _FILE_PATH.match(urlsplit(file_url).path)
    except ValueError:
        return None
    return unquote(match.group(1)) if match else None


async def file_in_use(db: AsyncSession, file_url: str) -> bool:
    """
    True when a document or a task hand-in (any org: every org shares one UploadThing
    app) points at the same stored file. Compared by file key, not by the whole link:
    one file has several valid links (two CDN hosts, D40), and an exact-link check
    could be dodged by switching host.
    """
    key = file_key(file_url)
    if key is None:
        return False
    for model in (Document, TaskSubmission):
        links = await db.scalars(select(model.file_url).where(model.file_url.contains(key, autoescape=True)))
        if any(file_key(link) == key for link in links):
            return True
    return False


async def file_usage(db: AsyncSession, file_url: str) -> FileUsageResponse:
    """
    Whether an uploaded file is used by a document or hand-in (D64). The upload
    dialogs ask this before deleting a file they uploaded but never saved, so they
    can't remove a file that a real record points at.

    Raises:
        400 invalid_file_url — not an UploadThing file link
    """
    if not is_allowed_file_url(file_url) or file_key(file_url) is None:
        raise api_error(
            status.HTTP_400_BAD_REQUEST, "invalid_file_url", "That link isn't an uploaded file."
        )
    return FileUsageResponse(in_use=await file_in_use(db, file_url))


async def create_document(db: AsyncSession, scope: AccessScope, body: CreateDocumentRequest) -> DocumentResponse:
    """
    Save a new document as 'processing'. The router then starts run_ingestion
    as a background task (after this commit).

    Raises:
        400 invalid_file_url                — not an UploadThing CDN URL (SSRF guard, ticket 11)
        404 role_not_found / team_not_found — the tag isn't a role or team in this org
        403 forbidden                       — tag not at or below the caller (D23)
        409 file_already_registered         — a document or hand-in already uses this file (D40)
    """
    if not is_allowed_file_url(body.file_url):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_file_url",
            "The file must be uploaded through the app (UploadThing).",
        )

    # One file belongs to one record (D40): deleting a document also deletes its
    # file from UploadThing, so a copy pointing at someone else's file must not exist.
    if await file_in_use(db, body.file_url):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "file_already_registered",
            "This file is already in use. Upload it again to add another copy.",
        )

    await _check_tag(db, scope, body.scope_type, body.role_id, body.team_id)

    document = Document(
        org_id=scope.org_id,
        title=body.title,
        description=body.description,
        file_url=body.file_url,
        file_type=body.file_type,
        scope_type=body.scope_type,
        role_id=body.role_id,
        team_id=body.team_id,
        uploaded_by_user_id=scope.user_id,
        status="processing",
    )
    db.add(document)
    await db.commit()
    logger.info(
        "User %s uploaded document %s (%s) in org %s",
        scope.user_id, document.id, document.scope_type, scope.org_id,
    )
    return _to_response(document, scope)


async def update_document(
    db: AsyncSession, scope: AccessScope, document_id: uuid.UUID, body: UpdateDocumentRequest
) -> DocumentResponse:
    """
    Rename, re-describe or change who sees a document (D39). Allowed when the caller
    could upload it where it is now (like delete) and, for a new audience, there too.
    The document's search pieces get the new audience in the same commit, so the chat
    follows at once (no re-indexing).

    Raises:
        404 document_not_found / role_not_found / team_not_found
        403 forbidden           — can't place it where it is now, or at the new audience
        409 document_processing — changing the audience while it's still indexing
                                  (ingestion copies the audience onto the pieces it writes)
    """
    document = await _get_visible(db, scope, document_id)
    if not can_place(scope, document.scope_type, document.role_id, document.team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only edit documents you could upload to the same place.",
        )

    new_tag = (body.scope_type, body.role_id, body.team_id)
    if body.scope_type is not None and new_tag != (document.scope_type, document.role_id, document.team_id):
        if document.status == "processing":
            raise api_error(
                status.HTTP_409_CONFLICT,
                "document_processing",
                "Wait until the document has finished indexing before changing who can see it.",
            )
        await _check_tag(db, scope, *new_tag)
        document.scope_type, document.role_id, document.team_id = new_tag
        await db.execute(
            update(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .values(scope_type=body.scope_type, role_id=body.role_id, team_id=body.team_id)
        )

    if body.title is not None:
        document.title = body.title
    if body.description is not None:
        document.description = body.description or None

    await db.commit()
    logger.info("User %s edited document %s in org %s", scope.user_id, document.id, scope.org_id)
    return _to_response(document, scope)


async def delete_document(db: AsyncSession, scope: AccessScope, document_id: uuid.UUID) -> None:
    """
    Delete a document and its chunks, so the agent stops citing it.

    Raises:
        404 document_not_found — missing or not visible to the caller
        403 forbidden          — caller couldn't upload a document with this tag (D23)
    """
    document = await _get_visible(db, scope, document_id)
    if not can_place(scope, document.scope_type, document.role_id, document.team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only delete documents you could upload to the same place.",
        )
    # SQL delete: the FK's ON DELETE CASCADE removes the chunks without loading them.
    await db.execute(delete(Document).where(Document.id == document.id))
    await db.commit()
    logger.info("User %s deleted document %s in org %s", scope.user_id, document_id, scope.org_id)


async def _check_tag(
    db: AsyncSession,
    scope: AccessScope,
    scope_type: str,
    role_id: Optional[uuid.UUID],
    team_id: Optional[uuid.UUID],
) -> None:
    """The tag names a role/team in this org that the caller may upload to (D23), or 404/403."""
    if role_id is not None:
        found = await db.scalar(select(Role.id).where(Role.id == role_id, Role.org_id == scope.org_id))
        if found is None:
            raise api_error(status.HTTP_404_NOT_FOUND, "role_not_found", "That role doesn't exist.")
    if team_id is not None:
        found = await db.scalar(select(Team.id).where(Team.id == team_id, Team.org_id == scope.org_id))
        if found is None:
            raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "That team doesn't exist.")

    if not can_place(scope, scope_type, role_id, team_id):
        messages = {
            "org": "You don't have permission to share documents with the whole organization.",
            "role": "You can only share documents with your own role or roles below it.",
            "team": "You can only share documents with teams you can upload to and see.",
        }
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", messages[scope_type])


# ── Chunk search (chat agent) ─────────────────────────────────────────────────

class ChunkHit(TypedDict):
    """One search result. Keys match app.agent.state.RetrievedChunk, plus distance."""

    chunk_id: str
    document_id: str
    title: str
    chunk_index: int
    text: str
    distance: float     # cosine distance: 0 = same meaning, larger = less related


async def search_chunks(db: AsyncSession, scope: AccessScope, question: str, k: int = 4) -> list[ChunkHit]:
    """
    The k document pieces closest in meaning to `question` that the user may see.
    4 by default (D58): with one section per piece, 4 holds the answer as often as 6
    did and sends the AI ~44% less text per question.

    Only pieces of 'ready' documents exist: ingestion writes chunks and
    status='ready' in one commit, and a failed document keeps no chunks.

    May raise EmbeddingError (from embed_query) if the embedding service fails.
    """
    query_vector = await embed_query(question)
    distance = DocumentChunk.embedding.cosine_distance(query_vector)

    # The HNSW index finds the nearest ~40 pieces in the whole org and filters
    # afterwards, so a user who can see few documents could get no results.
    # Iterative scan (pgvector >= 0.8) keeps searching until k visible pieces
    # are found; "relaxed_order" may return them slightly out of order, so we
    # re-sort below. Applies to this transaction only.
    await db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))

    rows = (
        await db.execute(
            select(
                DocumentChunk.id,
                DocumentChunk.document_id,
                Document.title,
                DocumentChunk.chunk_index,
                DocumentChunk.content,
                distance.label("distance"),
            )
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(_visible(DocumentChunk, scope))
            .order_by(distance)
            .limit(k)
        )
    ).all()

    hits: list[ChunkHit] = [
        {
            "chunk_id": str(row.id),
            "document_id": str(row.document_id),
            "title": row.title,
            "chunk_index": row.chunk_index,
            "text": row.content,
            "distance": float(row.distance),
        }
        for row in rows
    ]
    hits.sort(key=lambda hit: hit["distance"])
    return hits


async def visible_chunks(db: AsyncSession, scope: AccessScope, chunk_ids: list[str]) -> list[ChunkHit]:
    """
    These pieces (by id), keeping only the ones the user may see. Used to show a
    strike's saved policy passages to an appeal reviewer (D6/D46): a passage
    from a document the reviewer can't see is left out. Pieces of a deleted
    document are simply gone.
    """
    ids = []
    for chunk_id in chunk_ids or []:
        try:
            ids.append(uuid.UUID(str(chunk_id)))
        except ValueError:
            continue
    if not ids:
        return []
    rows = (
        await db.execute(
            select(
                DocumentChunk.id,
                DocumentChunk.document_id,
                Document.title,
                DocumentChunk.chunk_index,
                DocumentChunk.content,
            )
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.id.in_(ids), _visible(DocumentChunk, scope))
            .order_by(Document.title, DocumentChunk.chunk_index)
        )
    ).all()
    return [
        {
            "chunk_id": str(row.id),
            "document_id": str(row.document_id),
            "title": row.title,
            "chunk_index": row.chunk_index,
            "text": row.content,
            "distance": 0.0,
        }
        for row in rows
    ]
