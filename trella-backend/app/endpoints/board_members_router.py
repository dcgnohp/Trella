import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.models.board_members_model import BoardMember
from app.models.users_model import User
from app.schemas.board_members_schema import (
    BoardMemberAdd,
    BoardMemberPublic,
    BoardMemberRoleUpdate,
)
from app.schemas.shared import DELETED_USER_PLACEHOLDER
from app.services.board_members_service import BoardMembersService

router = APIRouter(prefix="/boards/{board_id}/members", tags=["board-members"])

_service = BoardMembersService()


def _to_public(session: SessionDep, member: BoardMember) -> BoardMemberPublic:
    user = session.get(User, member.user_id)
    if user is None:
        return BoardMemberPublic(
            id=member.id,
            user_id=member.user_id,
            email="",
            full_name=DELETED_USER_PLACEHOLDER,
            avatar_url=None,
            role=member.role,
            status=member.status,
            invited_by=member.invited_by,
        )
    return BoardMemberPublic(
        id=member.id,
        user_id=member.user_id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=None,
        role=member.role,
        status=member.status,
        invited_by=member.invited_by,
    )


@router.post("", response_model=BoardMemberPublic, status_code=status.HTTP_201_CREATED)
def add_member(
    session: SessionDep,
    board_id: uuid.UUID,
    data: BoardMemberAdd,
    current_user: CurrentUser,
) -> BoardMemberPublic:
    member = _service.add_member(
        session, board_id, data.user_id, data.role, current_user
    )
    return _to_public(session, member)


@router.get("", response_model=list[BoardMemberPublic])
def list_members(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> list[BoardMemberPublic]:
    members = _service.list_members(session, board_id, current_user)
    return [_to_public(session, m) for m in members]


@router.patch("/{user_id}/role", response_model=BoardMemberPublic)
def change_role(
    session: SessionDep,
    board_id: uuid.UUID,
    user_id: uuid.UUID,
    data: BoardMemberRoleUpdate,
    current_user: CurrentUser,
) -> BoardMemberPublic:
    member = _service.change_role(session, board_id, user_id, data.role, current_user)
    return _to_public(session, member)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    session: SessionDep,
    board_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser,
) -> None:
    _service.remove_member(session, board_id, user_id, current_user)


@router.post("/me/accept", response_model=BoardMemberPublic)
def accept_invitation(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> BoardMemberPublic:
    member = _service.accept_invitation(session, board_id, current_user)
    return _to_public(session, member)


@router.post("/me/decline", status_code=status.HTTP_200_OK)
def decline_invitation(
    session: SessionDep,
    board_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict[str, bool]:
    _service.decline_invitation(session, board_id, current_user)
    return {"success": True}
