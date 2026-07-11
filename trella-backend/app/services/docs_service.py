import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.docs_model import Doc
from app.models.workspace_members_model import WorkspaceMember
from app.models.enums import MemberStatus
from app.models.users_model import User
from app.schemas.docs_schema import DocCreate, DocUpdate


class DocsService:
    def _assert_member(self, session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> WorkspaceMember:
        member = session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.status == MemberStatus.ACTIVE.value,
            )
        ).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a workspace member")
        return member

    def _assert_can_edit(self, session: Session, doc: Doc, user: User) -> None:
        """Creator or ADMIN/OWNER can edit."""
        if doc.created_by == user.id:
            return
        member = session.exec(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == doc.workspace_id,
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.status == MemberStatus.ACTIVE.value,
                WorkspaceMember.role.in_(["ADMIN", "OWNER"]),  # type: ignore[attr-defined]
            )
        ).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author, admins, or owners can edit this doc")

    def list_docs(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        user: User,
        include_archived: bool = False,
        source_type: str | None = None,
        collection_id: uuid.UUID | None = None,
    ) -> list[Doc]:
        self._assert_member(session, workspace_id, user.id)
        query = (
            select(Doc)
            .where(Doc.workspace_id == workspace_id)
            .order_by(Doc.position, Doc.created_at)
        )
        if not include_archived:
            query = query.where(Doc.is_archived == False)
        if source_type is not None:
            query = query.where(Doc.source_type == source_type)
        if collection_id is not None:
            query = query.where(Doc.collection_id == collection_id)
        return list(session.exec(query).all())

    def get_doc(self, session: Session, workspace_id: uuid.UUID, doc_id: uuid.UUID, user: User) -> Doc:
        self._assert_member(session, workspace_id, user.id)
        doc = session.get(Doc, doc_id)
        if not doc or doc.workspace_id != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found")
        return doc

    def create_doc(self, session: Session, workspace_id: uuid.UUID, data: DocCreate, user: User) -> Doc:
        self._assert_member(session, workspace_id, user.id)
        doc = Doc(
            workspace_id=workspace_id,
            created_by=user.id,
            **data.model_dump(exclude_unset=False),
        )
        session.add(doc)
        session.commit()
        session.refresh(doc)
        return doc

    def update_doc(self, session: Session, workspace_id: uuid.UUID, doc_id: uuid.UUID, data: DocUpdate, user: User) -> Doc:
        doc = self.get_doc(session, workspace_id, doc_id, user)
        self._assert_can_edit(session, doc, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(doc, field, value)
        session.add(doc)
        session.commit()
        session.refresh(doc)
        return doc

    def delete_doc(self, session: Session, workspace_id: uuid.UUID, doc_id: uuid.UUID, user: User) -> None:
        doc = self.get_doc(session, workspace_id, doc_id, user)
        self._assert_can_edit(session, doc, user)
        session.delete(doc)
        session.commit()
