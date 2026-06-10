#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/trella-backend"
FRONTEND_DIR="${REPO_ROOT}/trella-frontend"
OPENAPI_OUT="${FRONTEND_DIR}/openapi.json"

# 1. Export OpenAPI schema from FastAPI app (run from backend dir so app.main resolves).
cd "${BACKEND_DIR}"
python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > "${OPENAPI_OUT}"

# 2. Optional escape hatch: schema only, no codegen.
if [ -n "${SKIP_CODEGEN:-}" ]; then
  exit 0
fi

# 3. Run codegen inside trella-frontend.
cd "${FRONTEND_DIR}"
npm run generate-client
