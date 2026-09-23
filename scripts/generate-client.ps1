#!/usr/bin/env pwsh
#
# Regenerate the trella-frontend API client from the FastAPI OpenAPI schema.
#
# Native PowerShell equivalent of scripts/generate-client.sh for Windows hosts
# where bash / WSL is unavailable. Fetches the OpenAPI document from a *running*
# backend over HTTP, saves it to trella-frontend/openapi.json, then runs the
# openapi-ts codegen to (re)generate the TypeScript client into
# trella-frontend/lib/client/.
#
# Requirements (16.1, 16.2): the backend must be running, e.g.
#   cd trella-backend; uv run uvicorn app.main:app --reload
#
# Configuration (env vars):
#   $env:NEXT_PUBLIC_API_URL  Base URL of the running backend (same var the
#                             frontend client uses). Default: http://localhost:8000
#   $env:API_BASE_URL         Legacy alias; used only when NEXT_PUBLIC_API_URL is unset.
#   $env:SKIP_CODEGEN         When set, only fetch the schema and skip codegen.

# Note: we deliberately do NOT use `$ErrorActionPreference = "Stop"` globally so
# that native-command stderr does not abort the script; we check failures and
# $LASTEXITCODE explicitly instead.

$RepoRoot    = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendDir = Join-Path $RepoRoot "trella-frontend"
$OpenApiOut  = Join-Path $FrontendDir "openapi.json"

# Base URL of the running backend. Prefer $env:NEXT_PUBLIC_API_URL (matches the
# frontend client), fall back to the legacy $env:API_BASE_URL, then default to
# localhost. Strip trailing slash.
$ApiBaseUrl = "http://localhost:8000"
if ($env:API_BASE_URL) { $ApiBaseUrl = $env:API_BASE_URL }
if ($env:NEXT_PUBLIC_API_URL) { $ApiBaseUrl = $env:NEXT_PUBLIC_API_URL }
$OpenApiUrl = ($ApiBaseUrl.TrimEnd('/')) + "/api/v1/openapi.json"

# 1. Fetch the OpenAPI schema from the running backend.
Write-Host "Fetching OpenAPI schema from $OpenApiUrl"
try {
  Invoke-WebRequest -Uri $OpenApiUrl -OutFile $OpenApiOut -UseBasicParsing -ErrorAction Stop
}
catch {
  Write-Error "Failed to fetch OpenAPI schema from $OpenApiUrl. Is the backend running? Try: cd trella-backend; uv run uvicorn app.main:app --reload"
  exit 1
}
Write-Host "Saved schema to $OpenApiOut"

# 2. Optional escape hatch: schema only, no codegen.
if ($env:SKIP_CODEGEN) {
  Write-Host "SKIP_CODEGEN set; skipping codegen."
  exit 0
}

# 3. Run codegen inside trella-frontend (outputs to lib/client/, see openapi-ts.config.ts).
Push-Location $FrontendDir
try {
  npm run generate-client
  $exit = $LASTEXITCODE
  if ($exit -ne 0) {
    Write-Error "npm run generate-client failed (exit $exit)"
    exit $exit
  }
}
finally {
  Pop-Location
}

exit 0
