"""Simple file-based prompt manager.

Loads a ``<name>.md`` prompt from this directory and substitutes ``{{var}}``
placeholders. Prompts live on disk only — business logic never embeds prompt
text (``.ai/AI_ARCHITECTURE.md`` §5).

Versioning (Phase 6, P6-B8) is immutable and additive: a versioned copy lives
alongside the plain file as ``<name>.<version>.md`` (e.g. ``chat.v2.md``). When
a ``version`` is requested and that file exists it is used; otherwise the plain
``<name>.md`` is the backward-compatible fallback. Versioned files are only ever
ADDED, never overwritten, so a published prompt is frozen for reproducibility.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

from app.ai.utils.errors import InvalidPrompt

if TYPE_CHECKING:
    from app.ai.schemas.chat_schema import ConversationContext

_PROMPTS_DIR = Path(__file__).parent
_VAR_PATTERN = re.compile(r"{{\s*(\w+)\s*}}")
# Prompt names are code-controlled identifiers; reject anything that could
# escape the prompts directory (path traversal) at this trust boundary.
_NAME_PATTERN = re.compile(r"[A-Za-z0-9_-]+")
# Versions are simple ``v<digits>`` tokens (v1, v2, ...). Validated at the same
# trust boundary as names so a version can never contribute path traversal.
_VERSION_PATTERN = re.compile(r"v[0-9]+")


class PromptManager:
    def __init__(self, prompts_dir: Path | None = None) -> None:
        self._dir = prompts_dir or _PROMPTS_DIR
        self._cache: dict[str, str] = {}

    def resolve_prompt_file(self, name: str, version: str | None) -> str:
        """Resolve ``name``/``version`` to an on-disk prompt file stem.

        Immutable, backward-compatible resolution:

        * if ``version`` is given and ``<name>.<version>.md`` exists → that stem;
        * else if ``<name>.md`` exists → the plain stem (fallback);
        * else raise :class:`InvalidPrompt`.

        Both ``name`` and ``version`` are validated against path traversal
        before they are used to build a path.
        """
        if not _NAME_PATTERN.fullmatch(name):
            raise InvalidPrompt(f"Invalid prompt name: {name!r}")
        if version is not None:
            if not _VERSION_PATTERN.fullmatch(version):
                raise InvalidPrompt(f"Invalid prompt version: {version!r}")
            versioned = f"{name}.{version}"
            if (self._dir / f"{versioned}.md").is_file():
                return versioned
        if (self._dir / f"{name}.md").is_file():
            return name
        raise InvalidPrompt(f"Prompt not found: {name!r} (version={version!r})")

    def _load(self, name: str, version: str | None = None) -> str:
        stem = self.resolve_prompt_file(name, version)
        if stem not in self._cache:
            # resolve_prompt_file already confirmed the file exists.
            self._cache[stem] = (self._dir / f"{stem}.md").read_text(encoding="utf-8")
        return self._cache[stem]

    def render(
        self,
        name: str,
        variables: dict[str, str] | None = None,
        version: str | None = None,
    ) -> str:
        """Load prompt ``name`` and substitute every ``{{var}}``.

        When ``version`` is given, the matching immutable ``<name>.<version>.md``
        is used if present, else the plain ``<name>.md`` (backward compatible).
        Raises :class:`InvalidPrompt` if the file is missing or any referenced
        variable is not supplied.
        """
        template = self._load(name, version)
        values = variables or {}
        missing: list[str] = []

        def _sub(match: re.Match[str]) -> str:
            key = match.group(1)
            if key not in values:
                missing.append(key)
                return ""
            return values[key]

        rendered = _VAR_PATTERN.sub(_sub, template)
        if missing:
            raise InvalidPrompt(
                f"Missing prompt variables for {name!r}: {sorted(set(missing))}"
            )
        return rendered

    def render_system_prompt(
        self, context: ConversationContext, version: str | None = None
    ) -> str:
        """Render the ``chat`` system prompt from a structured context.

        The ``ConversationContext`` sections stay structured until this final
        render step: only the present (non-``None``) sections are composed into
        a labelled block that fills the prompt's ``{{context}}`` slot.
        """
        sections = (
            ("Workspace", context.workspace),
            ("Project", context.project),
            ("Sprint", context.sprint),
            ("Task", context.task),
            ("Knowledge", context.knowledge),
        )
        blocks = [
            f"{label}:\n{value}" for label, value in sections if value is not None
        ]
        block = "\n\n".join(blocks) if blocks else "No additional context provided."
        return self.render("chat", {"context": block}, version=version)
