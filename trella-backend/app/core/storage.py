from __future__ import annotations

import hashlib
import hmac
import re
import time
import uuid
from pathlib import Path
from typing import BinaryIO, Protocol, runtime_checkable
from urllib.parse import urlencode

from app.core.config import settings

MAX_SIGNED_URL_TTL_SECONDS = 600

DEFAULT_SIGNED_URL_TTL_SECONDS = 600

LOCAL_FILES_ROUTE = f"{settings.API_V1_STR}/_files"

_UNSAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def _clamp_ttl(ttl_seconds: int) -> int:
    """Clamp TTL to [1, 600] seconds."""
    if ttl_seconds <= 0:
        return 1
    return min(ttl_seconds, MAX_SIGNED_URL_TTL_SECONDS)


def sanitize_file_name(file_name: str) -> str:
    """Return a filesystem- and URL-safe filename, guarding against path traversal."""
    base = Path(file_name.replace("\\", "/")).name
    sanitized = _UNSAFE_FILENAME_RE.sub("_", base).strip("._")
    return sanitized or "file"


def build_storage_key(task_id: uuid.UUID | str, file_name: str) -> str:
    """Build a storage key of the form ``tasks/{task_id}/{uuid4}/{safe_name}``."""
    safe_name = sanitize_file_name(file_name)
    return f"tasks/{task_id}/{uuid.uuid4()}/{safe_name}"


@runtime_checkable
class StorageService(Protocol):
    """Provider-agnostic storage interface for task attachments."""

    def save(self, *, key: str, fileobj: BinaryIO, content_type: str) -> None:
        """Persist ``fileobj`` bytes at ``key`` with the given ``content_type``."""
        ...

    def signed_url(self, *, key: str, ttl_seconds: int = 600) -> str:
        """Return a signed URL for ``key`` valid for ``ttl_seconds`` (≤ 600s)."""
        ...

    def delete(self, *, key: str) -> None:
        """Delete the stored object at ``key`` (no-op if it does not exist)."""
        ...


class LocalStorageService:
    """Development storage backend persisting files on the local filesystem."""

    def __init__(self, storage_dir: str | Path | None = None) -> None:
        base = (
            Path(storage_dir) if storage_dir is not None else Path(settings.STORAGE_DIR)
        )
        if not base.is_absolute():
            base = Path(__file__).resolve().parents[2] / base
        self._base_dir = base

    @property
    def base_dir(self) -> Path:
        """Root directory under which attachment files are stored."""
        return self._base_dir

    def _resolve_path(self, key: str) -> Path:
        """Resolve ``key`` to an absolute path confined to ``base_dir``, guarding against path traversal."""
        target = (self._base_dir / key).resolve()
        base = self._base_dir.resolve()
        if base != target and base not in target.parents:
            raise ValueError("Resolved storage path escapes the storage directory")
        return target

    def save(self, *, key: str, fileobj: BinaryIO, content_type: str) -> None:
        """Write ``fileobj`` to ``base_dir/key``, creating parent dirs."""
        path = self._resolve_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as out:
            while True:
                chunk = fileobj.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)

    @staticmethod
    def _sign(key: str, expires_at: int) -> str:
        """Compute the HMAC-SHA256 token binding ``key`` to ``expires_at``."""
        message = f"{key}:{expires_at}".encode()
        return hmac.new(
            settings.SECRET_KEY.encode(), message, hashlib.sha256
        ).hexdigest()

    def signed_url(self, *, key: str, ttl_seconds: int = 600) -> str:
        """Return an internal signed URL valid for ``ttl_seconds`` (≤ 600s)."""
        ttl = _clamp_ttl(ttl_seconds)
        expires_at = int(time.time()) + ttl
        token = self._sign(key, expires_at)
        query = urlencode({"expires": expires_at, "token": token})
        return f"{LOCAL_FILES_ROUTE}/{key}?{query}"

    def verify_token(self, *, key: str, expires_at: int, token: str) -> bool:
        """Return True only when the token matches and has not expired."""
        if expires_at < int(time.time()):
            return False
        expected = self._sign(key, expires_at)
        return hmac.compare_digest(expected, token)

    def delete(self, *, key: str) -> None:
        """Delete the file at ``base_dir/key`` (no-op if absent)."""
        path = self._resolve_path(key)
        path.unlink(missing_ok=True)


class S3StorageService:
    """Production storage backend backed by S3-compatible object storage."""

    def __init__(
        self,
        bucket: str | None = None,
        region: str | None = None,
        endpoint_url: str | None = None,
    ) -> None:
        self._bucket = bucket or settings.S3_BUCKET
        if not self._bucket:
            raise ValueError("S3_BUCKET must be configured when STORAGE_BACKEND=s3")
        self._region = region or settings.S3_REGION
        self._endpoint_url = endpoint_url or settings.S3_ENDPOINT_URL
        try:
            import boto3  # type: ignore[import-not-found]  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - exercised only without boto3
            raise RuntimeError(
                "boto3 is required for S3StorageService (STORAGE_BACKEND=s3); "
                "install boto3 to use the S3 storage backend"
            ) from exc
        self._client = boto3.client(
            "s3",
            region_name=self._region,
            endpoint_url=self._endpoint_url,
        )

    def save(self, *, key: str, fileobj: BinaryIO, content_type: str) -> None:
        """Upload ``fileobj`` to ``s3://{bucket}/{key}``."""
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=fileobj,
            ContentType=content_type,
        )

    def signed_url(self, *, key: str, ttl_seconds: int = 600) -> str:
        """Return a presigned GET URL valid for ``min(ttl_seconds, 600)``."""
        url: str = self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=_clamp_ttl(ttl_seconds),
        )
        return url

    def delete(self, *, key: str) -> None:
        """Delete the object at ``s3://{bucket}/{key}``."""
        self._client.delete_object(Bucket=self._bucket, Key=key)


def get_storage_service() -> StorageService:
    """Return the configured ``StorageService`` per ``settings.STORAGE_BACKEND``."""
    backend = settings.STORAGE_BACKEND
    if backend == "s3":
        return S3StorageService()
    return LocalStorageService()
