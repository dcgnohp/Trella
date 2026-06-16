"""Tests asserting `scripts/generate-client.sh` opens with the required
`#!/usr/bin/env bash` shebang and enables fail-fast somewhere near the top
of the script.

Originally written for the `trella-frontend-api-codegen` spec (task 3.4 /
Requirement 4.6) when the script's contract was:

    line 1: #!/usr/bin/env bash
    line 2: set -e

That contract was tightened by the `backend-modular-refactor` spec
(Requirement 17.4, task 20.1) to fetch the OpenAPI schema from a *running*
backend over HTTP rather than importing `app.main` in-process. The rewrite
also introduced a multi-line header comment block describing how to
configure the script (`NEXT_PUBLIC_API_URL`, `SKIP_CODEGEN`) and switched
the fail-fast directive to the stricter `set -euo pipefail`, which now
appears further down rather than on line 2.

To keep tracing the original "fail-fast on the first failing subcommand"
intent without coupling to the exact line number, we now:

* still pin line 1 to `#!/usr/bin/env bash` exactly, and
* accept *either* `set -e` or `set -euo pipefail` appearing somewhere in
  the script's first 50 lines.

Both forms satisfy Requirement 4.6 (orig spec) and Requirement 17.4
(refactor spec).
"""

from __future__ import annotations

from pathlib import Path

# Repo root is two levels above this file: tests/scripts/<this>.py -> tests -> trella-backend -> repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "generate-client.sh"

# How many lines from the top we'll scan for the fail-fast directive. The
# real script keeps its header comment block + `set -...` line well within
# the first 30 lines; 50 leaves headroom for future doc additions without
# silently allowing the directive to drift to the bottom of the file.
_HEADER_SCAN_LINES = 50


def _read_lines(path: Path) -> list[str]:
    """Return the file's lines without trailing CR/LF, rejecting a UTF-8 BOM."""
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise AssertionError(
            f"{path} starts with a UTF-8 BOM; shell scripts must start with "
            "the shebang byte-for-byte."
        )
    text = raw.decode("utf-8")
    return [line.rstrip("\r") for line in text.split("\n")]


def test_generate_client_script_exists() -> None:
    assert SCRIPT_PATH.is_file(), f"Expected script at {SCRIPT_PATH}"


def test_generate_client_script_first_line_is_bash_shebang() -> None:
    lines = _read_lines(SCRIPT_PATH)
    assert lines, f"{SCRIPT_PATH} is empty"
    assert lines[0] == "#!/usr/bin/env bash", (
        f"Expected first line to be '#!/usr/bin/env bash', got {lines[0]!r}"
    )


def test_generate_client_script_second_line_enables_set_e() -> None:
    """Permissive check: a fail-fast directive must appear near the top.

    Accepts either the original `set -e` (orig spec, Req 4.6) or the
    stricter `set -euo pipefail` introduced in the refactor (Req 17.4).
    The directive must live within the script's first
    ``_HEADER_SCAN_LINES`` lines so it actually triggers fail-fast for the
    schema fetch and codegen invocation that follow.
    """
    lines = _read_lines(SCRIPT_PATH)
    head = lines[:_HEADER_SCAN_LINES]
    accepted = {"set -e", "set -eu", "set -eo pipefail", "set -euo pipefail"}
    found = next(
        (line for line in head if line.strip() in accepted),
        None,
    )
    assert found is not None, (
        f"Expected one of {sorted(accepted)!r} to appear within the first "
        f"{_HEADER_SCAN_LINES} lines of {SCRIPT_PATH}, but none was found.\n"
        f"First {_HEADER_SCAN_LINES} lines:\n"
        + "\n".join(f"  {i + 1:>2}: {line}" for i, line in enumerate(head))
    )
