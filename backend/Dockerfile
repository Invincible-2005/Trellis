# Trellis backend image. Build from the backend/ folder:  docker build -t trellis-backend .
FROM python:3.11-slim

# uv installs the packages listed in uv.lock (same tool and versions as CI).
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

WORKDIR /app

# Packages go in /app/.venv; putting it first on PATH makes `uvicorn` and `alembic` available.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# 1) Packages first, on their own layer: Docker reuses it until uv.lock changes,
#    so a code-only change rebuilds in seconds. --no-dev skips pytest and DeepEval.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) Then the app code and the migrations (so the image can run `alembic upgrade head`).
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# Never run as root inside the container.
RUN useradd --create-home --uid 1000 trellis
USER trellis

# Hosts such as Render tell the app which port to use through $PORT.
# One worker on purpose: the in-memory caches assume a single backend process.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
