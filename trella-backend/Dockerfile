FROM python:3.10

ENV PYTHONUNBUFFERED=1

# Install uv
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#installing-uv
COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/

# Pre-install MCP stdio servers referenced in mcp.json so `uvx` doesn't need
# to fetch them from the network on every fresh container start (Phase 10.1).
RUN uv tool install mcp-server-fetch

# Compile bytecode
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#compiling-bytecode
ENV UV_COMPILE_BYTECODE=1

# uv Cache
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#caching
ENV UV_LINK_MODE=copy

WORKDIR /app/

# Place executables in the environment at the front of the path
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#using-the-environment
ENV PATH="/app/.venv/bin:$PATH"

# Install dependencies
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers
COPY uv.lock pyproject.toml /app/
RUN uv sync --frozen --no-install-workspace --package app

COPY ./scripts /app/backend/scripts

COPY ./pyproject.toml ./alembic.ini /app/backend/

COPY ./mcp.json /app/backend/mcp.json

COPY ./app /app/backend/app

# Sync the project
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers
RUN uv sync --frozen --package app

WORKDIR /app/backend/

# workers=1: the MCP stdio integration (AI_MCP_ENABLED) spawns a persistent
# subprocess per worker process at startup. With multiple uvicorn worker
# processes, uvicorn's Multiprocess supervisor healthchecks each worker over a
# multiprocessing Pipe with a short timeout; a worker that's also spawning and
# awaiting its own MCP child subprocess can miss that healthcheck window, so
# the supervisor kills it and restarts it in an infinite crash loop (visible as
# repeating "Started server process" / "Child process died" + BrokenPipeError
# from the orphaned MCP subprocess). The app is async/I/O-bound, so a single
# worker still serves concurrent requests fine; this trades away CPU-bound
# parallelism and process-level fault isolation for a stable MCP integration.
CMD python -m app.backend_pre_start && python -m app.pre_migrate && python -m alembic upgrade heads && python -m app.initial_data && fastapi run --workers 1 --port ${PORT:-8000} app/main.py
