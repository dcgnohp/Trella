import secrets
import warnings
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Read .env from the trella-backend/ directory (this file's project root).
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # Maximum number of boards an organization can create on the free tier.
    MAX_FREE_BOARDS: int = 10

    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_DIR: str = "var/attachments"
    S3_BUCKET: str | None = None
    S3_REGION: str | None = None
    # Optional custom endpoint for S3-compatible providers (e.g. MinIO).
    S3_ENDPOINT_URL: str | None = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    # --- AI Platform (Phase 0) ---
    # Provider is kept as an enum-like Literal so future providers (gemini,
    # ollama, ...) can be added without changing the config surface.
    AI_PROVIDER: Literal["openai", "gemini"] = "openai"
    # Optional secondary provider for resilience. When set and different from
    # AI_PROVIDER, get_provider wraps both in a health-aware FailoverProvider.
    AI_FALLBACK_PROVIDER: Literal["openai", "gemini"] | None = None
    # Optional so the app still boots without a key; the AI health endpoint
    # reports "unhealthy" until the selected provider's key is set.
    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    # Default/mini model names. For AI_PROVIDER="gemini", set these to Gemini
    # model ids in .env (e.g. AI_DEFAULT_MODEL=gemini-2.0-flash).
    # Explicit AI middleware profile override. When None, the profile is
    # resolved from ENVIRONMENT (see app.ai.config.profiles.resolve_profile).
    AI_PROFILE: str | None = None
    AI_DEFAULT_MODEL: str = "gpt-4.1"
    AI_MINI_MODEL: str = "gpt-4.1-mini"
    AI_REQUEST_TIMEOUT: float = 30.0
    # Prompt-size cap applied in AIBaseService AFTER the model is resolved
    # (never in ContextBuilder). Char-based approximation: ~4 chars/token.
    # Default cap for any model without a specific override below.
    AI_MAX_PROMPT_CHARS: int = 60000
    # Optional per-model overrides. Parsed from env as JSON, e.g.
    # AI_MODEL_MAX_PROMPT_CHARS='{"gpt-4.1": 400000, "gpt-4.1-mini": 60000}'.
    AI_MODEL_MAX_PROMPT_CHARS: dict[str, int] = {}
    # $ per 1K tokens, per model: {"model": {"input": 0.005, "output": 0.015}}.
    # Default empty so an unknown model yields cost=None (no crash); ops fills
    # it via env JSON, e.g. AI_MODEL_PRICING='{"gpt-4.1": {"input": 0.005,
    # "output": 0.015}}'.
    AI_MODEL_PRICING: dict[str, dict[str, float]] = {}

    # --- AI Data Access & Reasoning Engine (Phase 7) ---
    # Master switch for the reasoning loop + data-access tools. Default OFF so
    # local/test envs keep the payload-only chat behavior (Phase 1-6 tests stay
    # green); dev/prod opt in via .env.
    AI_TOOLS_ENABLED: bool = False
    # Hard cap on tool executions per chat turn (bounds the reasoning loop /
    # cost). Timeout (seconds) applied per individual tool run.
    AI_MAX_TOOL_CALLS: int = 5
    AI_TOOL_TIMEOUT: float = 10.0
    # Conversation-scoped tool-result memory TTL (seconds); 5 min default.
    AI_SESSION_MEMORY_TTL: float = 300.0

    # --- AI Agent Workflow / Write Agent (Phase 8) ---
    # Master switch for write tools + approval/execution. Default OFF so
    # local/test envs keep read-only behavior (Phase 1-7 tests stay green).
    AI_AGENT_WRITE_ENABLED: bool = False
    # Tool Budget: the Reasoning Engine terminates gracefully when ANY limit is
    # hit. max_cost=0.0 disables the cost cap (unknown pricing -> no cap).
    AI_AGENT_MAX_TOOL_CALLS: int = 8
    AI_AGENT_MAX_ITERATIONS: int = 6
    AI_AGENT_MAX_LATENCY_S: float = 60.0
    AI_AGENT_MAX_COST: float = 0.0
    # Ephemeral ActionPlan TTL (seconds) — proposals expire if not approved.
    AI_ACTION_PLAN_TTL: float = 600.0

    # --- AI Knowledge Intelligence 2.0 / Semantic Search (Phase 9) ---
    # Master switch for embeddings + semantic document search. Default OFF so
    # Phase 1-8 behavior/tests are unchanged; enable only after a backfill.
    AI_SEMANTIC_SEARCH_ENABLED: bool = False
    # Embedding is provider-agnostic and selected ENTIRELY from config — never
    # hardcoded to a vendor. AI_EMBEDDING_PROVIDER is independent of AI_PROVIDER
    # (chat) so embeddings can use a different vendor. Both stay None until an
    # operator opts in; startup validation requires them when semantic is ON.
    AI_EMBEDDING_PROVIDER: Literal["openai", "gemini"] | None = None
    AI_EMBEDDING_MODEL: str | None = None
    # Vector dimension is provider/model METADATA, not a vendor-specific
    # constant baked into logic. It sets the width of the ``doc_embeddings``
    # vector column and is checked at startup against BOTH the provider's actual
    # embedding size AND the live DB column (fail-fast on any mismatch). The
    # migration is an immutable snapshot at this default; changing models to a
    # different dimension needs a new migration + this override to match.
    AI_EMBEDDING_DIM: int = 768
    # Chunking (char-based, consistent with AI_MAX_PROMPT_CHARS' ~4 chars/token
    # approximation): size of each chunk and overlap between consecutive chunks.
    AI_EMBEDDING_CHUNK_SIZE: int = 1000
    AI_EMBEDDING_CHUNK_OVERLAP: int = 100
    # Default number of nearest chunks returned by semantic_search_documents.
    AI_SEMANTIC_SEARCH_TOP_K: int = 5

    # --- Enterprise AI / MCP Integration (Phase 10.1) ---
    # Master switch for consuming external MCP servers as READ-ONLY tools.
    # Default OFF so behavior is unchanged; servers come ONLY from the allow-list
    # config file (never hardcoded), and only when this flag is on.
    AI_MCP_ENABLED: bool = False
    # Path to the MCP allow-list config file (mcp.json-style). None → no servers.
    AI_MCP_CONFIG_PATH: str | None = None
    # Outer per-call timeout (seconds) for an MCP tool invocation; a server's own
    # ``timeout`` may be smaller (the smaller wins).
    AI_MCP_TOOL_TIMEOUT_S: float = 15.0

    # --- AI Project Manager (Phase 10.2) ---
    # Master switch for the deterministic project-analytics tools (sprint /
    # workload / risk) that let the AI Chat behave like a project manager.
    # Default OFF so Phase 1-10.1 behavior/tests are unchanged. The analytics
    # are AI-free reads; recommendations/reports emerge from the chat's own
    # reasoning over these tools (Phase 7 invariant preserved).
    AI_PM_ENABLED: bool = False

    # --- Workflow Automation (Phase 10.4) ---
    # Master switch for event-driven AI proposals (e.g. Sprint completed → AI
    # drafts a sprint-summary document proposal → admin approves → execute).
    # Default OFF so behavior/tests are unchanged. NOTHING is ever executed
    # automatically: proposals go through the Phase 8 propose→approve→execute
    # path (Human-in-the-loop preserved). Gated on Phase 8 + Phase 9 COMPLETED.
    AI_WORKFLOW_ENABLED: bool = False

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: str | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    EMAIL_TEST_USER: EmailStr = "test@example.com"
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        return self


settings = Settings()  # type: ignore
