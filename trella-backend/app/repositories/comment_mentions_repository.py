import uuid

from sqlmodel import Session, select

from app.models.comment_mentions_model import CommentMention


class CommentMentionsRepository:
    def create_bulk(
        self, session: Session, mentions: list[CommentMention]
    ) -> list[CommentMention]:
        for mention in mentions:
            session.add(mention)
        session.flush()
        return mentions

    def delete_by_comment(self, session: Session, comment_id: uuid.UUID) -> None:
        statement = select(CommentMention).where(
            CommentMention.comment_id == comment_id
        )
        for mention in session.exec(statement).all():
            session.delete(mention)
        session.flush()

    def list_by_comment(
        self, session: Session, comment_id: uuid.UUID
    ) -> list[CommentMention]:
        statement = select(CommentMention).where(
            CommentMention.comment_id == comment_id
        )
        return list(session.exec(statement).all())
