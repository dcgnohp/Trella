#!/usr/bin/env python3
"""Seed script for Knowledge Center test data.

Usage:
    cd trella-backend
    python scripts/seed_knowledge_center.py
    python scripts/seed_knowledge_center.py --workspace-id <uuid> --user-id <uuid>
"""

import argparse
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine

CATEGORIES = [
    {"name": "Product", "color": "#0052CC", "icon": "📦"},
    {"name": "Technical Design", "color": "#6554C0", "icon": "🏗️"},
    {"name": "API", "color": "#00B8D9", "icon": "🔌"},
    {"name": "Frontend", "color": "#36B37E", "icon": "🎨"},
    {"name": "Backend", "color": "#FF991F", "icon": "⚙️"},
    {"name": "DevOps", "color": "#172B4D", "icon": "🚀"},
    {"name": "Business", "color": "#DE350B", "icon": "💼"},
    {"name": "Meeting Notes", "color": "#5E6C84", "icon": "📝"},
]

DOC_TEMPLATES = [
    {
        "title": "Product Vision & Strategy",
        "category": "Product",
        "source_type": "MANUAL",
        "pinned": True,
        "author": "Tuấn Anh",
        "task_key": None,
        "link_type": "project",
    },
    {
        "title": "System Architecture",
        "category": "Technical Design",
        "source_type": "ADR",
        "pinned": True,
        "author": "Tuấn Anh",
        "task_key": None,
        "link_type": "project",
    },
    {
        "title": "API Specification",
        "category": "API",
        "source_type": "RFC",
        "pinned": True,
        "author": "Tuấn Anh",
        "task_key": None,
        "link_type": "project",
    },
    {
        "title": "Sprint Planning - Sprint 12",
        "category": "Meeting Notes",
        "source_type": "MEETING_NOTE",
        "pinned": True,
        "author": "Tuấn Anh",
        "task_key": None,
        "link_type": "project",
    },
    {
        "title": "Database Schema Design",
        "category": "Technical Design",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Tuấn Anh",
        "task_key": None,
        "link_type": "project",
    },
    {
        "title": "User Authentication Flow",
        "category": "Backend",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Ngọc Trâm",
        "task_key": "AUTH-15",
        "link_type": "task",
    },
    {
        "title": "API Authentication",
        "category": "API",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Tuấn Anh",
        "task_key": "AUTH-15",
        "link_type": "task",
    },
    {
        "title": "File Upload Service Design",
        "category": "Backend",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Ngọc Trâm",
        "task_key": "FILE-23",
        "link_type": "task",
    },
    {
        "title": "Sprint Review 11",
        "category": "Meeting Notes",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Hải Đăng",
        "task_key": None,
        "link_type": "sprint",
    },
    {
        "title": "UI Components Library",
        "category": "Frontend",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Tuấn Anh",
        "task_key": "UI-34",
        "link_type": "task",
    },
    {
        "title": "Deployment Guide",
        "category": "DevOps",
        "source_type": "MANUAL",
        "pinned": False,
        "author": "Hải Đăng",
        "task_key": None,
        "link_type": "project",
    },
]

SAMPLE_CONTENT = """<h2>Overview</h2>
<p>This document covers the key decisions and guidelines for the team. Please keep it updated as requirements evolve.</p>
<h2>Background</h2>
<p>This was created to centralize knowledge and avoid repeated questions on Slack. Reference this document before asking the team.</p>
<h2>Key Points</h2>
<ul>
<li>Always follow the Repository to Service to Router pattern</li>
<li>Use camelCase for all API responses</li>
<li>Write migrations with explicit down_revision and depends_on</li>
</ul>
<h2>Next Steps</h2>
<p>Review quarterly and update based on team feedback.</p>"""


def get_first_workspace_and_user(session: Session):
    ws_row = session.exec(text("SELECT id FROM workspaces LIMIT 1")).first()  # type: ignore
    if not ws_row:
        raise RuntimeError("No workspace found. Create a workspace first.")
    u_row = session.exec(text("SELECT id FROM users LIMIT 1")).first()  # type: ignore
    if not u_row:
        raise RuntimeError("No user found. Create a user first.")
    return str(ws_row[0]), str(u_row[0])


def seed(workspace_id: str, user_id: str):
    with Session(engine) as session:
        # 1. Ensure mock users exist and are active workspace members
        mock_users = [
            {"email": "tuananh@example.com", "full_name": "Tuấn Anh"},
            {"email": "ngoctram@example.com", "full_name": "Ngọc Trâm"},
            {"email": "haidang@example.com", "full_name": "Hải Đăng"},
        ]

        user_map = {"default": user_id}

        for mu in mock_users:
            res = session.exec(
                text(f"SELECT id, full_name FROM users WHERE email = '{mu['email']}'")
            ).first()
            if res:
                uid = str(res[0])
                # Ensure full_name is correct
                if not res[1]:
                    session.exec(
                        text(
                            f"UPDATE users SET full_name = '{mu['full_name']}' WHERE id = '{uid}'"
                        )
                    )
            else:
                uid = str(uuid.uuid4())
                sql = text(f"""
                    INSERT INTO users (id, email, full_name, hashed_password, is_active, is_superuser, status, created_at, updated_at)
                    VALUES ('{uid}', '{mu["email"]}', '{mu["full_name"]}', 'mock_hash', true, false, 'ACTIVE', NOW(), NOW())
                """)
                session.exec(sql)

            # Ensure workspace member exists and is ACTIVE
            m_res = session.exec(
                text(
                    f"SELECT id FROM workspace_members WHERE workspace_id = '{workspace_id}' AND user_id = '{uid}'"
                )
            ).first()
            if not m_res:
                mid = str(uuid.uuid4())
                sql = text(f"""
                    INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
                    VALUES ('{mid}', '{workspace_id}', '{uid}', 'MEMBER', 'ACTIVE', NOW(), NOW())
                """)
                session.exec(sql)
            else:
                # Ensure ACTIVE status
                session.exec(
                    text(
                        f"UPDATE workspace_members SET status = 'ACTIVE' WHERE workspace_id = '{workspace_id}' AND user_id = '{uid}'"
                    )
                )

            user_map[mu["full_name"]] = uid

        session.commit()

        # 2. Delete existing seed data
        session.exec(
            text(
                f"DELETE FROM knowledge_user_prefs WHERE workspace_id = '{workspace_id}'"
            )
        )  # type: ignore
        session.exec(text(f"DELETE FROM docs WHERE workspace_id = '{workspace_id}'"))  # type: ignore
        session.exec(
            text(
                f"DELETE FROM knowledge_collections WHERE workspace_id = '{workspace_id}'"
            )
        )  # type: ignore
        session.commit()

        # Get first project, board, and column belonging to this workspace
        project_row = session.exec(
            text(
                f"SELECT id FROM projects WHERE workspace_id = '{workspace_id}' LIMIT 1"
            )
        ).first()
        board_row = None
        column_row = None
        bid = None
        if project_row:
            pid = str(project_row[0])
            board_res = session.exec(
                text(f"SELECT id FROM boards WHERE project_id = '{pid}' LIMIT 1")
            ).first()
            if board_res:
                bid = str(board_res[0])
                board_row = board_res
                col_res = session.exec(
                    text(
                        f"SELECT id FROM board_columns WHERE board_id = '{bid}' LIMIT 1"
                    )
                ).first()
                if col_res:
                    column_row = col_res

        # Ensure Sprint 11 exists
        sprint_id = None
        if project_row:
            pid = str(project_row[0])
            s_res = session.exec(
                text(
                    f"SELECT id FROM sprints WHERE name = 'Sprint 11' AND project_id = '{pid}'"
                )
            ).first()
            if s_res:
                sprint_id = str(s_res[0])
            else:
                sprint_id = str(uuid.uuid4())
                sql = text(f"""
                    INSERT INTO sprints (id, project_id, name, status, created_at, updated_at)
                    VALUES ('{sprint_id}', '{pid}', 'Sprint 11', 'ACTIVE', NOW(), NOW())
                """)
                session.exec(sql)
                session.commit()

        # Ensure mock tasks exist
        task_ids = {}
        if project_row and board_row and column_row:
            pid = str(project_row[0])
            cid = str(column_row[0])

            mock_tasks = [
                {"key": "AUTH-15", "title": "User Authentication Flow"},
                {"key": "FILE-23", "title": "File Upload Service Design"},
                {"key": "UI-34", "title": "UI Components Library"},
            ]
            for mt in mock_tasks:
                res = session.exec(
                    text(
                        f"SELECT id FROM tasks WHERE issue_key = '{mt['key']}' AND project_id = '{pid}'"
                    )
                ).first()
                if res:
                    task_ids[mt["key"]] = str(res[0])
                else:
                    tid = str(uuid.uuid4())
                    sql = text(f"""
                        INSERT INTO tasks (id, project_id, board_id, column_id, title, position, issue_key, created_at, updated_at)
                        VALUES ('{tid}', '{pid}', '{bid}', '{cid}', '{mt["title"]}', 0, '{mt["key"]}', NOW(), NOW())
                    """)
                    session.exec(sql)
                    task_ids[mt["key"]] = tid
            session.commit()

        now = datetime.now(timezone.utc)
        cat_ids: dict[str, str] = {}

        # 3. Create categories
        for i, cat in enumerate(CATEGORIES):
            cid = str(uuid.uuid4())
            cat_ids[cat["name"]] = cid
            name = cat["name"].replace("'", "''")
            sql = text(f"""
                INSERT INTO knowledge_collections (id, workspace_id, name, icon, color, created_by, position, created_at, updated_at)
                VALUES ('{cid}', '{workspace_id}', '{name}', '{cat["icon"]}', '{cat["color"]}', '{user_id}', {i}, NOW(), NOW())
            """)
            session.exec(sql)  # type: ignore

        session.commit()

        # 4. Create docs
        pinned_doc_ids: list[str] = []
        for i, tmpl in enumerate(DOC_TEMPLATES):
            did = str(uuid.uuid4())
            col_id = cat_ids[tmpl["category"]]
            days_ago = i % 30
            updated_at = (now - timedelta(days=days_ago)).isoformat()
            created_at = (now - timedelta(days=days_ago + 10)).isoformat()
            title = tmpl["title"].replace("'", "''")
            content = SAMPLE_CONTENT.replace("'", "''")
            category = tmpl["category"].replace("'", "''")

            author_id = user_map.get(tmpl["author"], user_id)
            doc_task_id = task_ids.get(tmpl["task_key"]) if tmpl["task_key"] else None
            doc_sprint_id = sprint_id if tmpl["link_type"] == "sprint" else None
            doc_board_id = bid if tmpl["link_type"] == "board" else None

            # Format insert statement safely
            task_val = f"'{doc_task_id}'" if doc_task_id else "NULL"
            sprint_val = f"'{doc_sprint_id}'" if doc_sprint_id else "NULL"
            board_val = f"'{doc_board_id}'" if doc_board_id else "NULL"

            sql = text(f"""
                INSERT INTO docs (
                    id, workspace_id, title, content, source_type, category,
                    collection_id, created_by, position, is_archived, is_pinned_global,
                    task_id, sprint_id, board_id, created_at, updated_at
                ) VALUES (
                    '{did}', '{workspace_id}', '{title}', '{content}',
                    '{tmpl["source_type"]}', '{category}',
                    '{col_id}', '{author_id}', {i}, false, {str(tmpl["pinned"]).lower()},
                    {task_val}, {sprint_val}, {board_val}, '{created_at}', '{updated_at}'
                )
            """)
            session.exec(sql)  # type: ignore
            if tmpl["pinned"]:
                pinned_doc_ids.append(did)

        session.commit()

        # 5. Pin first 4 docs in user preferences
        for did in pinned_doc_ids[:4]:
            pid = str(uuid.uuid4())
            sql = text(f"""
                INSERT INTO knowledge_user_prefs (
                    id, workspace_id, user_id, doc_id, is_pinned, is_favorite, created_at, updated_at
                ) VALUES ('{pid}', '{workspace_id}', '{user_id}', '{did}', true, true, NOW(), NOW())
            """)
            session.exec(sql)  # type: ignore

        session.commit()

    print(f"Seeded {len(CATEGORIES)} collections and {len(DOC_TEMPLATES)} docs")
    print(f"  Workspace: {workspace_id}")
    print(f"  User:      {user_id}")
    print(f"  Pinned:    {len(pinned_doc_ids)}")


def main():
    parser = argparse.ArgumentParser(description="Seed Knowledge Center data")
    parser.add_argument(
        "--workspace-id", help="Workspace UUID (auto-discovers if omitted)"
    )
    parser.add_argument("--user-id", help="User UUID (auto-discovers if omitted)")
    args = parser.parse_args()

    if not args.workspace_id or not args.user_id:
        with Session(engine) as s:
            ws_id, u_id = get_first_workspace_and_user(s)
        workspace_id = args.workspace_id or ws_id
        user_id = args.user_id or u_id
        print(f"Auto-discovered workspace={workspace_id}, user={user_id}")
    else:
        workspace_id = args.workspace_id
        user_id = args.user_id

    seed(workspace_id, user_id)


if __name__ == "__main__":
    main()
