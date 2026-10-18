import os
import urllib.parse
from typing import Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database URLs (from NeonDB)
    DATABASE_URL: str
    DATABASE_URL_POOLED: Optional[str] = None

    # Application settings
    APP_NAME: str = "Trellis API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Clerk — Auth
    # CLERK_SECRET_KEY  : Clerk Dashboard → API Keys → Secret Key (sk_live_... / sk_test_...)
    # CLERK_ISSUER      : Clerk Dashboard → API Keys → Frontend API URL
    #                     e.g. https://your-instance.clerk.accounts.dev
    # CLERK_AUTHORIZED_PARTIES: frontend origins allowed in the JWT `azp` claim.
    #                     Set as JSON in .env, e.g. '["https://app.trellis.dev"]'
    CLERK_SECRET_KEY: str = ""
    CLERK_ISSUER: str = ""
    CLERK_AUTHORIZED_PARTIES: list[str] = ["http://localhost:3000"]
    # Where the frontend runs. Clerk invite emails link to FRONTEND_URL/sign-up.
    FRONTEND_URL: str = "http://localhost:3000"
    # Shared secret between the Next.js server and this API (ticket 12 D62). The web app
    # sends it as X-Internal-Key and every /api/v1 route refuses calls without it, so a
    # public backend URL can't be used to skip the Arcjet limits. Empty = check off
    # (local development, tests). Required when ENVIRONMENT=production. Generate one with
    # `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
    INTERNAL_API_KEY: str = ""

    # Embeddings (ticket 12 D14): Gemini API, authenticated with GOOGLE_API_KEY below
    EMBEDDING_MODEL: str = "gemini-embedding-001"
    # "{model}" is substituted with EMBEDDING_MODEL
    EMBEDDING_API_URL: str = (
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"
    )
    EMBEDDING_DIM: int = 1024  # must match Vector(1024) on document_chunks.embedding

    # Chat LLM (ticket 12 D7). "provider:model" strings for LangChain's
    # init_chat_model, so switching provider is a .env change, not a code change.
    # GOOGLE_API_KEY is used for both chat and embeddings, and is passed explicitly
    # (Settings doesn't export to os.environ).
    GOOGLE_API_KEY: str = ""  # Google AI Studio → Get API key
    # Flash-Lite for both (D44): Flash's free tier allows only ~20 requests a day.
    CHAT_MODEL: str = "google_genai:gemini-flash-lite-latest"
    ROUTER_MODEL: str = "google_genai:gemini-flash-lite-latest"

    # Chat input check (ticket 12 D21): longer messages get 400 message_too_long
    CHAT_MAX_MESSAGE_CHARS: int = 4000

    # Document ingestion (Ticket 11) — only these hosts may be fetched (SSRF guard).
    # Entries starting with "." match any subdomain (".ufs.sh" → "abc.ufs.sh").
    # Set as JSON in .env, e.g. INGESTION_ALLOWED_HOSTS='["utfs.io", ".ufs.sh"]'
    INGESTION_ALLOWED_HOSTS: list[str] = ["utfs.io", ".ufs.sh"]
    INGESTION_MAX_FILE_BYTES: int = 25 * 1024 * 1024

    # LangSmith tracing of agent runs (optional, dev/demo data only: traces contain
    # prompts, document text and names). Off unless LANGSMITH_TRACING=true.
    # Key: smith.langchain.com → Settings → API Keys. Each developer uses their own.
    LANGSMITH_TRACING: bool = False
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "trellis-dev"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def _require_internal_key_in_production(self):
        # A forgotten variable must stop the app, not silently leave the API open (D62).
        if self.ENVIRONMENT.lower() == "production" and not self.INTERNAL_API_KEY:
            raise ValueError("INTERNAL_API_KEY must be set when ENVIRONMENT=production.")
        return self

    @field_validator("CLERK_ISSUER")
    @classmethod
    def _strip_issuer_slash(cls, value: str) -> str:
        # Clerk's `iss` claim has no trailing slash; a copied URL often does.
        return value.rstrip("/")

    def _to_asyncpg_url(self, raw_url: Optional[str]) -> str:
        if not raw_url:
            raise ValueError("DATABASE_URL or DATABASE_URL_POOLED must be set.")

        # Ensure asyncpg driver
        if raw_url.startswith("postgresql://"):
            raw_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)

        # Parse query string and remove/convert parameters unsupported by asyncpg
        parsed = urllib.parse.urlsplit(raw_url)
        query_params = urllib.parse.parse_qs(parsed.query)

        # asyncpg does not support channel_binding
        query_params.pop("channel_binding", None)

        # asyncpg uses 'ssl' instead of 'sslmode'
        if "sslmode" in query_params:
            ssl_val = query_params.pop("sslmode")[0]
            query_params["ssl"] = [ssl_val]

        # Reconstruct query string
        clean_query = urllib.parse.urlencode(query_params, doseq=True)
        return urllib.parse.urlunsplit((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            clean_query,
            parsed.fragment
        ))

    @property
    def async_database_url(self) -> str:
        """
        Converts standard Neon PostgreSQL URL to an asyncpg-compatible URL.
        Prefers DATABASE_URL_POOLED for runtime app connections.
        """
        raw_url = self.DATABASE_URL_POOLED or self.DATABASE_URL
        return self._to_asyncpg_url(raw_url)

    @property
    def async_migrations_url(self) -> str:
        """
        Direct (unpooled) URL with asyncpg sanitization for Alembic migrations.
        Neon's pooler runs PgBouncer in transaction mode, which breaks DDL
        transactions and Alembic's locking, so migrations never use it.
        """
        return self._to_asyncpg_url(self.DATABASE_URL)

    @property
    def sync_database_url(self) -> str:
        """
        Plain libpq connection string on the direct (unpooled) DATABASE_URL.
        Used by the chat memory pool (psycopg 3, main.py lifespan) and by sync tools.
        """
        raw_url = self.DATABASE_URL
        if raw_url.startswith("postgresql+asyncpg://"):
            raw_url = raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return raw_url


settings = Settings()

# LangChain reads tracing settings from os.environ, which Settings doesn't fill.
# Export them only when tracing is on, so it stays off by default.
if settings.LANGSMITH_TRACING and settings.LANGSMITH_API_KEY:
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.LANGSMITH_API_KEY
    os.environ["LANGSMITH_PROJECT"] = settings.LANGSMITH_PROJECT
