import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.docs_model import Doc
from app.models.enums import MemberStatus
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.schemas.docs_schema import DocCreate, DocUpdate


class DocsService:
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
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the author, admins, or owners can edit this doc",
            )

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
        from app.models.boards_model import Board as DBBoard
        from app.models.sprints_model import Sprint as DBSprint
        from app.models.tasks_model import Task as DBTask
        from app.models.users_model import User as DBUser

        query = (
            select(
                Doc,
                DBUser.full_name,
                DBUser.email,
                DBTask.issue_key,
                DBBoard.title,
                DBSprint.name,
            )
            .join(DBUser, Doc.created_by == DBUser.id)
            .outerjoin(DBTask, Doc.task_id == DBTask.id)
            .outerjoin(DBBoard, Doc.board_id == DBBoard.id)
            .outerjoin(DBSprint, Doc.sprint_id == DBSprint.id)
            .where(Doc.workspace_id == workspace_id)
            .order_by(Doc.position, Doc.created_at)
        )
        if not include_archived:
            query = query.where(Doc.is_archived == False)  # noqa: E712
        if source_type is not None:
            query = query.where(Doc.source_type == source_type)
        if collection_id is not None:
            query = query.where(Doc.collection_id == collection_id)

        results = session.exec(query).all()
        docs = []
        for doc, full_name, email, issue_key, board_title, sprint_name in results:
            doc.author_name = full_name or email.split("@")[0]
            doc.author_email = email
            if doc.task_id and issue_key:
                doc.linked_entity_label = f"#{issue_key}"
                doc.linked_entity_type = "task"
            elif doc.sprint_id:
                doc.linked_entity_label = sprint_name or "Sprint 11"
                doc.linked_entity_type = "sprint"
            elif doc.board_id:
                doc.linked_entity_label = board_title or "Board"
                doc.linked_entity_type = "board"
            else:
                doc.linked_entity_label = "Project"
                doc.linked_entity_type = "project"
            docs.append(doc)
        return docs

    def get_doc(
        self, session: Session, workspace_id: uuid.UUID, doc_id: uuid.UUID, user: User
    ) -> Doc:
        self._assert_member(session, workspace_id, user.id)
        from app.models.boards_model import Board as DBBoard
        from app.models.sprints_model import Sprint as DBSprint
        from app.models.tasks_model import Task as DBTask
        from app.models.users_model import User as DBUser

        result = session.exec(
            select(
                Doc,
                DBUser.full_name,
                DBUser.email,
                DBTask.issue_key,
                DBBoard.title,
                DBSprint.name,
            )
            .join(DBUser, Doc.created_by == DBUser.id)
            .outerjoin(DBTask, Doc.task_id == DBTask.id)
            .outerjoin(DBBoard, Doc.board_id == DBBoard.id)
            .outerjoin(DBSprint, Doc.sprint_id == DBSprint.id)
            .where(Doc.id == doc_id, Doc.workspace_id == workspace_id)
        ).first()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found"
            )

        doc, full_name, email, issue_key, board_title, sprint_name = result
        doc.author_name = full_name or email.split("@")[0]
        doc.author_email = email
        if doc.task_id and issue_key:
            doc.linked_entity_label = f"#{issue_key}"
            doc.linked_entity_type = "task"
        elif doc.sprint_id:
            doc.linked_entity_label = sprint_name or "Sprint 11"
            doc.linked_entity_type = "sprint"
        elif doc.board_id:
            doc.linked_entity_label = board_title or "Board"
            doc.linked_entity_type = "board"
        else:
            doc.linked_entity_label = "Project"
            doc.linked_entity_type = "project"
        return doc

    def create_doc(
        self, session: Session, workspace_id: uuid.UUID, data: DocCreate, user: User
    ) -> Doc:
        self._assert_member(session, workspace_id, user.id)
        doc = Doc(
            workspace_id=workspace_id,
            created_by=user.id,
            **data.model_dump(exclude_unset=False),
        )
        session.add(doc)
        session.commit()
        session.refresh(doc)

        from app.models.boards_model import Board as DBBoard
        from app.models.sprints_model import Sprint as DBSprint
        from app.models.tasks_model import Task as DBTask

        issue_key = None
        if doc.task_id:
            task = session.get(DBTask, doc.task_id)
            if task:
                issue_key = task.issue_key

        board_title = None
        if doc.board_id:
            board = session.get(DBBoard, doc.board_id)
            if board:
                board_title = board.title

        sprint_name = None
        if doc.sprint_id:
            sprint = session.get(DBSprint, doc.sprint_id)
            if sprint:
                sprint_name = sprint.name

        doc.author_name = user.full_name or user.email.split("@")[0]
        doc.author_email = user.email
        if doc.task_id and issue_key:
            doc.linked_entity_label = f"#{issue_key}"
            doc.linked_entity_type = "task"
        elif doc.sprint_id:
            doc.linked_entity_label = sprint_name or "Sprint 11"
            doc.linked_entity_type = "sprint"
        elif doc.board_id:
            doc.linked_entity_label = board_title or "Board"
            doc.linked_entity_type = "board"
        else:
            doc.linked_entity_label = "Project"
            doc.linked_entity_type = "project"
        return doc

    def update_doc(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        doc_id: uuid.UUID,
        data: DocUpdate,
        user: User,
    ) -> Doc:
        doc = self.get_doc(session, workspace_id, doc_id, user)
        self._assert_can_edit(session, doc, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(doc, field, value)
        session.add(doc)
        session.commit()
        session.refresh(doc)
        return self.get_doc(session, workspace_id, doc_id, user)

    def delete_doc(
        self, session: Session, workspace_id: uuid.UUID, doc_id: uuid.UUID, user: User
    ) -> None:
        doc = self.get_doc(session, workspace_id, doc_id, user)
        self._assert_can_edit(session, doc, user)
        doc.is_archived = True
        session.commit()

    def hard_delete_trash(
        self, session: Session, workspace_id: uuid.UUID, user: User
    ) -> None:
        # Check if user has permission to manage workspace (optional, assuming they can delete)
        from sqlmodel import delete

        from app.models.docs_model import Doc

        statement = delete(Doc).where(
            Doc.workspace_id == workspace_id, Doc.is_archived
        )
        session.exec(statement)
        session.commit()
