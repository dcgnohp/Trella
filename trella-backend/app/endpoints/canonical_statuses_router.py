from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.enums import CanonicalStatus

router = APIRouter(tags=["canonical-statuses"])

# Explicit order so the response contract is stable regardless of enum-declaration order.
CANONICAL_STATUS_ORDER: list[CanonicalStatus] = [
    CanonicalStatus.TODO,
    CanonicalStatus.IN_PROGRESS,
    CanonicalStatus.PENDING,
    CanonicalStatus.DONE,
]
assert set(CANONICAL_STATUS_ORDER) == set(CanonicalStatus), (
    "CANONICAL_STATUS_ORDER must cover exactly the CanonicalStatus members"
)


@router.get(
    "/canonical-statuses",
    response_model=list[str],
    dependencies=[Depends(get_current_user)],
)
def list_canonical_statuses() -> list[str]:
    """Return the 4 canonical status values in fixed order."""
    return [status.value for status in CANONICAL_STATUS_ORDER]
