"""Example test asserting `scripts/generate-client.sh` declares the required
shebang and `set -e` directive on its first two lines.

Implements task 3.4 of the `trella-frontend-api-codegen` spec and validates
Requirement 4.6:

  THE Generate_Client_Script SHALL có shebang `#!/usr/bin/env bash` và bật
  `set -e` để fail-fast trên mọi lệnh con bị lỗi.
"""

from __future__ import annotations

from pathlib import Path

# Repo root is two levels above this file: tests/scripts/<this>.py -> tests -> trella-backend -> repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "generate-client.sh"


def _read_first_two_lines(path: Path) -> tuple[str, str]:
    # Read as bytes so we can detect any stray BOM or CRLF, then strip a
    # single trailing newline (\r\n or \n) per line without normalizing
    # other whitespace inside the line.
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise AssertionError(
            f"{path} starts with a UTF-8 BOM; shell scripts must start with the shebang byte-for-byte."
        )
    text = raw.decode("utf-8")
    lines = text.split("\n")
    if len(lines) < 2:
        raise AssertionError(
            f"{path} has fewer than 2 lines; cannot assert shebang and `set -e`."
        )
    # Strip a possible trailing CR from CRLF line endings.
    line1 = lines[0].rstrip("\r")
    line2 = lines[1].rstrip("\r")
    return line1, line2


def test_generate_client_script_exists() -> None:
    assert SCRIPT_PATH.is_file(), f"Expected script at {SCRIPT_PATH}"


def test_generate_client_script_first_line_is_bash_shebang() -> None:
    line1, _ = _read_first_two_lines(SCRIPT_PATH)
    assert line1 == "#!/usr/bin/env bash", (
        f"Expected first line to be '#!/usr/bin/env bash', got {line1!r}"
    )


def test_generate_client_script_second_line_enables_set_e() -> None:
    _, line2 = _read_first_two_lines(SCRIPT_PATH)
    assert line2 == "set -e", (
        f"Expected second line to be 'set -e', got {line2!r}"
    )
