import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.enums import MemberStatus
from app.models.knowledge_collections_model import KnowledgeCollection
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.schemas.knowledge_collections_schema import (
    KnowledgeCollectionCreate,
    KnowledgeCollectionUpdate,
)


class KnowledgeCollectionsService:
    def _assert_member(
        self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember:
        member = session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.status == MemberStatus.ACTIVE.value,
            )
        ).first()
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not a workspace member"
            )
        return member

    def _assert_can_edit(
        self, session: Session, collection: KnowledgeCollection, user: User
    ) -> None:
        """Creator or ADMIN/OWNER can edit."""
        if collection.created_by == user.id:
            return
        member = session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == collection.workspace_id,
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.status == MemberStatus.ACTIVE.value,
                WorkspaceMember.role.in_(["ADMIN", "OWNER"]),  # type: ignore[attr-defined]
            )
        ).first()
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the author, admins, or owners can edit this collection",
            )

    def list_collections(
        self, session: Session, workspace_id: uuid.UUID, user: User
    ) -> list[KnowledgeCollection]:
        self._assert_member(session, workspace_id, user.id)
        return list(
            session.exec(
                select(KnowledgeCollection)
                .where(KnowledgeCollection.workspace_id == workspace_id)
                .order_by(KnowledgeCollection.position, KnowledgeCollection.created_at)
            ).all()
        )

    def create_collection(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        data: KnowledgeCollectionCreate,
        user: User,
    ) -> KnowledgeCollection:
        self._assert_member(session, workspace_id, user.id)
        collection = KnowledgeCollection(
            workspace_id=workspace_id,
            created_by=user.id,
            **data.model_dump(exclude_unset=False),
        )
        session.add(collection)
        session.commit()
        session.refresh(collection)
        return collection

    def _get_collection(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        collection_id: uuid.UUID,
        user: User,
    ) -> KnowledgeCollection:
        self._assert_member(session, workspace_id, user.id)
        collection = session.get(KnowledgeCollection, collection_id)
        if not collection or collection.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
            )
        return collection

    def update_collection(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        collection_id: uuid.UUID,
        data: KnowledgeCollectionUpdate,
        user: User,
    ) -> KnowledgeCollection:
        collection = self._get_collection(session, workspace_id, collection_id, user)
        self._assert_can_edit(session, collection, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(collection, field, value)
        session.add(collection)
        session.commit()
        session.refresh(collection)
        return collection

    def delete_collection(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        collection_id: uuid.UUID,
        user: User,
    ) -> None:
        collection = self._get_collection(session, workspace_id, collection_id, user)
        self._assert_can_edit(session, collection, user)
        session.delete(collection)
        session.commit()
