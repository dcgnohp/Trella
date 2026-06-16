#!/usr/bin/env bash
#
# Regenerate the trella-frontend API client from the FastAPI OpenAPI schema.
#
# Fetches the OpenAPI document from a *running* backend over HTTP, saves it to
# trella-frontend/openapi.json, then runs the openapi-ts codegen to (re)generate
# the TypeScript client into trella-frontend/lib/client/.
#
# Requirements (16.1, 16.2): the backend must be running, e.g.
#   cd trella-backend && uv run uvicorn app.main:app --reload
#
# Configuration (env vars):
#   NEXT_PUBLIC_API_URL  Base URL of the running backend (same var the frontend
#                        client uses, see lib/client-config.ts). Default: http://localhost:8000
#   API_BASE_URL         Legacy alias for the base URL; used only when
#                        NEXT_PUBLIC_API_URL is unset (backward compatible).
#   SKIP_CODEGEN         When set (any non-empty value), only fetch the schema and skip codegen.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/trella-frontend"
OPENAPI_OUT="${FRONTEND_DIR}/openapi.json"

# Base URL of the running backend. Prefer NEXT_PUBLIC_API_URL (matches the
# frontend client), fall back to the legacy API_BASE_URL, then default to
# localhost. Strip any trailing slash.
API_BASE_URL="${NEXT_PUBLIC_API_URL:-${API_BASE_URL:-http://localhost:8000}}"
OPENAPI_URL="${API_BASE_URL%/}/api/v1/openapi.json"

# 1. Fetch the OpenAPI schema from the running backend.
echo "Fetching OpenAPI schema from ${OPENAPI_URL}"
if ! curl -fsSL "${OPENAPI_URL}" -o "${OPENAPI_OUT}"; then
  echo "Error: failed to fetch OpenAPI schema from ${OPENAPI_URL}" >&2
  echo "Is the backend running? Try: cd trella-backend && uv run uvicorn app.main:app --reload" >&2
  exit 1
fi
echo "Saved schema to ${OPENAPI_OUT}"

# 2. Optional escape hatch: schema only, no codegen.
if [ -n "${SKIP_CODEGEN:-}" ]; then
  echo "SKIP_CODEGEN set; skipping codegen."
  exit 0
fi

# 3. Run codegen inside trella-frontend (outputs to lib/client/, see openapi-ts.config.ts).
cd "${FRONTEND_DIR}"
npm run generate-client
