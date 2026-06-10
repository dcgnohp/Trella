#!/usr/bin/env pwsh
# Regenerate the trella-frontend API client from the FastAPI OpenAPI schema.
#
# Native PowerShell equivalent of scripts/generate-client.sh for Windows hosts
# where bash / WSL is unavailable. Set $env:SKIP_CODEGEN = "1" to export the
# schema only and skip the codegen step.

# Note: we deliberately do NOT use `$ErrorActionPreference = "Stop"` here
# because PowerShell treats native-command stderr (e.g. pydantic warnings
# from `uv run python`) as terminating errors under Stop mode, even when
# the underlying process exits 0. We check $LASTEXITCODE manually instead.

$RepoRoot     = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir   = Join-Path $RepoRoot "trella-backend"
$FrontendDir  = Join-Path $RepoRoot "trella-frontend"
$OpenApiOut   = Join-Path $FrontendDir "openapi.json"

# 1. Export OpenAPI schema. uv run handles the venv; pydantic-settings reads
#    trella-backend/.env via the absolute path configured in app/core/config.py.
Push-Location $BackendDir
try {
  # Redirect stderr to a temp file so pydantic warnings do not pollute stdout
  # (we only want the JSON schema), and surface them only on failure.
  $errFile = New-TemporaryFile
  $schema  = uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" 2>$errFile
  $exit    = $LASTEXITCODE
  if ($exit -ne 0) {
    Get-Content $errFile | Write-Host
    Remove-Item $errFile -ErrorAction SilentlyContinue
    Write-Error "Schema export failed (exit $exit)"
    exit $exit
  }
  Remove-Item $errFile -ErrorAction SilentlyContinue
  if (-not $schema) {
    Write-Error "Schema export produced no JSON output."
    exit 1
  }
  # Use .NET WriteAllText to avoid PowerShell's UTF-16 BOM default.
  [System.IO.File]::WriteAllText($OpenApiOut, $schema, (New-Object System.Text.UTF8Encoding $false))
}
finally {
  Pop-Location
}

# 2. Optional escape hatch: schema only.
if ($env:SKIP_CODEGEN) { exit 0 }

# 3. Run codegen.
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
