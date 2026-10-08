import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, ForeignKey, Enum, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.core.database import Base

# ─────────────────────────────────────────────
# DOCUMENTS (Policy/SOP — for RAG)
# ─────────────────────────────────────────────

class Document(Base):
    """
    Governance/SOP document. Tagged to an Org, Role, or Team:
    - scope_type='org': org-wide policy, visible to ALL members of the organization.
    - scope_type='role': visible to role_id + all ANCESTOR roles (roles above it). Equivalently,
      a user at role U sees docs tagged to U and U's descendants.
    - scope_type='team': visible to all team_members + roles above the team.
    Uploaded by roles with 'upload_document' permission for their role/team scope.
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    file_url: Mapped[str] = mapped_column(String, nullable=False)  # UploadThing CDN URL
    file_type: Mapped[str] = mapped_column(
        Enum("pdf", "docx", "pptx", "txt", "md", name="doc_file_type"),
        nullable=False
    )
    scope_type: Mapped[str] = mapped_column(
        Enum("org", "role", "team", name="doc_scope_type"),
        nullable=False
    )
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("roles.id"), nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("teams.id"), nullable=True)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("processing", "ready", "failed", name="doc_ingestion_status"),
        default="processing"
    )
    chunk_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Admin-facing reason when status='failed' (set by the ingestion pipeline)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chunks: Mapped[List["DocumentChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    """
    Vector chunk for pgvector RAG. Scope columns are DENORMALIZED from the parent
    document for fast WHERE filtering inside the ANN query — avoids a JOIN during retrieval.
    """
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[List[float]] = mapped_column(Vector(1024), nullable=False)  # mxbai-embed-large-v1 (1024 dims)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # Denormalized for fast scope filtering in vector search
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    scope_type: Mapped[str] = mapped_column(Enum("org", "role", "team", name="doc_scope_type"), nullable=False)
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True)

    document: Mapped["Document"] = relationship(back_populates="chunks")