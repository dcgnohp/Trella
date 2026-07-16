"""Simple file-based prompt manager.

Loads a ``<name>.md`` prompt from this directory and substitutes ``{{var}}``
placeholders. No frontmatter, no versioning (deferred to Phase 6). Prompts live
on disk only — business logic never embeds prompt text
(``.ai/AI_ARCHITECTURE.md`` §5).
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


class PromptManager:
    def __init__(self, prompts_dir: Path | None = None) -> None:
        self._dir = prompts_dir or _PROMPTS_DIR
        self._cache: dict[str, str] = {}

    def _load(self, name: str) -> str:
        if not _NAME_PATTERN.fullmatch(name):
            raise InvalidPrompt(f"Invalid prompt name: {name!r}")
        if name not in self._cache:
            try:
                self._cache[name] = (self._dir / f"{name}.md").read_text(
                    encoding="utf-8"
                )
            except FileNotFoundError:
                raise InvalidPrompt(f"Prompt not found: {name!r}")
        return self._cache[name]

    def render(self, name: str, variables: dict[str, str] | None = None) -> str:
        """Load prompt ``name`` and substitute every ``{{var}}``.

        Raises :class:`InvalidPrompt` if the file is missing or any referenced
        variable is not supplied.
        """
        template = self._load(name)
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

    def render_system_prompt(self, context: ConversationContext) -> str:
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
        return self.render("chat", {"context": block})
