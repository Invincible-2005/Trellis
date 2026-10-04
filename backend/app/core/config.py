import urllib.parse
from typing import Optional
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
    CLERK_SECRET_KEY: str = ""
    CLERK_ISSUER: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

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
        Uses pooled URL (or direct fallback) with asyncpg sanitization for Alembic migrations.
        """
        raw_url = self.DATABASE_URL_POOLED or self.DATABASE_URL
        return self._to_asyncpg_url(raw_url)

    @property
    def sync_database_url(self) -> str:
        """
        Returns a sync connection string using psycopg2 for Alembic migrations if running sync.
        Always uses the direct (unpooled) DATABASE_URL.
        """
        raw_url = self.DATABASE_URL
        if raw_url.startswith("postgresql+asyncpg://"):
            raw_url = raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return raw_url


settings = Settings()
