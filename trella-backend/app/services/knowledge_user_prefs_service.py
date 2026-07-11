import uuid
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlmodel import Session, select
from app.models.enums import MemberStatus
from app.models.knowledge_user_prefs_model import KnowledgeUserPref
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.schemas.knowledge_user_prefs_schema import KnowledgeUserPrefUpsert


class KnowledgeUserPrefsService:
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

    def list_prefs(self, session: Session, workspace_id: uuid.UUID, user: User) -> list[KnowledgeUserPref]:
        self._assert_member(session, workspace_id, user.id)
        return list(session.exec(
            select(KnowledgeUserPref).where(
                KnowledgeUserPref.workspace_id == workspace_id,
                KnowledgeUserPref.user_id == user.id,
            )
        ).all())

    def upsert_pref(self, session: Session, workspace_id: uuid.UUID, data: KnowledgeUserPrefUpsert, user: User) -> KnowledgeUserPref:
        self._assert_member(session, workspace_id, user.id)
        pref = session.exec(
            select(KnowledgeUserPref).where(
                KnowledgeUserPref.workspace_id == workspace_id,
                KnowledgeUserPref.user_id == user.id,
                KnowledgeUserPref.doc_id == data.doc_id,
            )
        ).first()
        if not pref:
            pref = KnowledgeUserPref(
                workspace_id=workspace_id,
                user_id=user.id,
                doc_id=data.doc_id,
            )
        pref.is_pinned = data.is_pinned
        pref.is_favorite = data.is_favorite
        session.add(pref)
        session.commit()
        session.refresh(pref)
        return pref

    def mark_viewed(self, session: Session, workspace_id: uuid.UUID, doc_id: uuid.UUID, user: User) -> KnowledgeUserPref:
        self._assert_member(session, workspace_id, user.id)
        pref = session.exec(
            select(KnowledgeUserPref).where(
                KnowledgeUserPref.workspace_id == workspace_id,
                KnowledgeUserPref.user_id == user.id,
                KnowledgeUserPref.doc_id == doc_id,
            )
        ).first()
        if not pref:
            pref = KnowledgeUserPref(workspace_id=workspace_id, user_id=user.id, doc_id=doc_id)
        pref.last_viewed_at = datetime.now(timezone.utc)
        session.add(pref)
        session.commit()
        session.refresh(pref)
        return pref
