import re

_MENTION_RE = re.compile(r"@([\w][\w\s]{0,48}[\w]|[\w])")


def extract_mentions(content: str) -> list[str]:
    """Return unique mention names parsed from ``@Name`` tokens in ``content``."""
    names = _MENTION_RE.findall(content)
    seen: set[str] = set()
    result: list[str] = []
    for name in names:
        name = name.strip()
        if name and name not in seen:
            seen.add(name)
            result.append(name)
    return result
