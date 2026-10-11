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
import uuid
from typing import Optional

from fastapi import status
from sqlalchemy import and_, delete, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing_extensions import TypedDict

from app.core.errors import api_error
from app.models.document import Document, DocumentChunk
from app.models.role import Role
from app.models.team import Team
from app.schemas.documents import (
    CreateDocumentRequest,
    DocumentResponse,
    DocumentTagOptions,
    TagTarget,
    UpdateDocumentRequest,
)
from app.scope.resolver import AccessScope
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


async def create_document(db: AsyncSession, scope: AccessScope, body: CreateDocumentRequest) -> DocumentResponse:
    """
    Save a new document as 'processing'. The router then starts run_ingestion
    as a background task (after this commit).

    Raises:
        400 invalid_file_url                — not an UploadThing CDN URL (SSRF guard, ticket 11)
        404 role_not_found / team_not_found — the tag isn't a role or team in this org
        403 forbidden                       — tag not at or below the caller (D23)
        409 file_already_registered         — another document already uses this file (D40)
    """
    if not is_allowed_file_url(body.file_url):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_file_url",
            "The file must be uploaded through the app (UploadThing).",
        )

    # One file belongs to one document (D40): deleting a document also deletes its
    # file from UploadThing, so a copy pointing at someone else's file must not exist.
    # Checked across all orgs because every org shares one UploadThing app.
    in_use = await db.scalar(select(Document.id).where(Document.file_url == body.file_url).limit(1))
    if in_use is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "file_already_registered",
            "This file is already registered as a document. Upload it again to add another copy.",
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


async def search_chunks(db: AsyncSession, scope: AccessScope, question: str, k: int = 6) -> list[ChunkHit]:
    """
    The k document pieces closest in meaning to `question` that the user may see.

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
