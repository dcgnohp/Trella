#!/usr/bin/env python3
"""Seed script for a full test data environment (Workspace, Project, Board, Sprints, Tasks, etc.).

Usage:
    cd trella-backend
    python scripts/seed_full_data.py
"""

import argparse
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine


def main():
    parser = argparse.ArgumentParser(description="Seed full test data")
    parser.parse_args()

    with Session(engine) as session:
        # 1. Users
        mock_users = [
            {"email": "admin@example.com", "full_name": "Admin User"},
            {"email": "dev1@example.com", "full_name": "Dev One"},
            {"email": "dev2@example.com", "full_name": "Dev Two"},
            {"email": "pm@example.com", "full_name": "Product Manager"},
        ]
        user_ids = {}
        for mu in mock_users:
            res = session.exec(
                text(f"SELECT id FROM users WHERE email = '{mu['email']}'")
            ).first()
            if res:
                user_ids[mu["email"]] = str(res[0])
            else:
                uid = str(uuid.uuid4())
                session.exec(
                    text(f"""
                    INSERT INTO users (id, email, full_name, hashed_password, is_active, is_superuser, status, created_at, updated_at)
                    VALUES ('{uid}', '{mu["email"]}', '{mu["full_name"]}', 'mock_hash', true, false, 'ACTIVE', NOW(), NOW())
                """)
                )
                user_ids[mu["email"]] = uid

        session.commit()

        # 2. Workspace
        ws_name = "Acme Corp"
        ws_res = session.exec(
            text(f"SELECT id FROM workspaces WHERE name = '{ws_name}'")
        ).first()
        if ws_res:
            ws_id = str(ws_res[0])
        else:
            ws_id = str(uuid.uuid4())
            session.exec(
                text(f"""
                INSERT INTO workspaces (id, name, mode, created_at, updated_at)
                VALUES ('{ws_id}', '{ws_name}', 'SCRUM', NOW(), NOW())
            """)
            )

        session.commit()

        # 3. Workspace Members
        for email, uid in user_ids.items():
            role = "OWNER" if "admin" in email else "MEMBER"
            m_res = session.exec(
                text(
                    f"SELECT id FROM workspace_members WHERE workspace_id = '{ws_id}' AND user_id = '{uid}'"
                )
            ).first()
            if not m_res:
                mid = str(uuid.uuid4())
                session.exec(
                    text(f"""
                    INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
                    VALUES ('{mid}', '{ws_id}', '{uid}', '{role}', 'ACTIVE', NOW(), NOW())
                """)
                )

        session.commit()

        # 4. Custom Statuses
        statuses = [
            {"name": "To Do", "canonical": "TODO", "color": "#5E6C84"},
            {"name": "In Progress", "canonical": "IN_PROGRESS", "color": "#0052CC"},
            {"name": "In Review", "canonical": "PENDING", "color": "#FF991F"},
            {"name": "Done", "canonical": "DONE", "color": "#36B37E"},
        ]
        status_ids = {}
        for st in statuses:
            cs_res = session.exec(
                text(
                    f"SELECT id FROM custom_statuses WHERE workspace_id = '{ws_id}' AND name = '{st['name']}'"
                )
            ).first()
            if cs_res:
                status_ids[st["name"]] = str(cs_res[0])
            else:
                cs_id = str(uuid.uuid4())
                session.exec(
                    text(f"""
                    INSERT INTO custom_statuses (id, workspace_id, name, color, canonical_status, created_at, updated_at)
                    VALUES ('{cs_id}', '{ws_id}', '{st["name"]}', '{st["color"]}', '{st["canonical"]}', NOW(), NOW())
                """)
                )
                status_ids[st["name"]] = cs_id
        session.commit()

        # 5. Workflow & Transitions
        wf_name = "Standard Software Workflow"
        wf_res = session.exec(
            text(
                f"SELECT id FROM workflows WHERE workspace_id = '{ws_id}' AND name = '{wf_name}'"
            )
        ).first()
        if wf_res:
            wf_id = str(wf_res[0])
        else:
            wf_id = str(uuid.uuid4())
            session.exec(
                text(f"""
                INSERT INTO workflows (id, workspace_id, name, is_active, created_at, updated_at)
                VALUES ('{wf_id}', '{ws_id}', '{wf_name}', true, NOW(), NOW())
            """)
            )
            # Transitions
            transitions = [
                {"name": "Start Progress", "to": "In Progress"},
                {"name": "Request Review", "to": "In Review"},
                {"name": "Complete", "to": "Done"},
                {"name": "Reopen", "to": "To Do"},
            ]
            for tr in transitions:
                tr_id = str(uuid.uuid4())
                to_sid = status_ids[tr["to"]]
                session.exec(
                    text(f"""
                    INSERT INTO workflow_transitions (id, workflow_id, name, to_status_id, conditions, validators, actions, created_at, updated_at)
                    VALUES ('{tr_id}', '{wf_id}', '{tr["name"]}', '{to_sid}', '[]', '[]', '[]', NOW(), NOW())
                """)
                )
        session.commit()

        # 6. Project
        proj_name = "Frontend Revamp"
        proj_key = "FE"
        proj_res = session.exec(
            text(
                f"SELECT id FROM projects WHERE workspace_id = '{ws_id}' AND key = '{proj_key}'"
            )
        ).first()
        if proj_res:
            proj_id = str(proj_res[0])
        else:
            proj_id = str(uuid.uuid4())
            admin_id = user_ids["admin@example.com"]
            session.exec(
                text(f"""
                INSERT INTO projects (id, workspace_id, name, key, description, created_by, task_counter, workflow_id, created_at, updated_at)
                VALUES ('{proj_id}', '{ws_id}', '{proj_name}', '{proj_key}', 'Revamping the core frontend architecture', '{admin_id}', 0, '{wf_id}', NOW(), NOW())
            """)
            )
        session.commit()

        # 7. Project Members
        for email, uid in user_ids.items():
            role = "PROJECT_ADMIN" if "admin" in email else "PROJECT_MEMBER"
            m_res = session.exec(
                text(
                    f"SELECT id FROM project_members WHERE project_id = '{proj_id}' AND user_id = '{uid}'"
                )
            ).first()
            if not m_res:
                mid = str(uuid.uuid4())
                session.exec(
                    text(f"""
                    INSERT INTO project_members (id, project_id, user_id, project_role, status, created_at, updated_at)
                    VALUES ('{mid}', '{proj_id}', '{uid}', '{role}', 'ACTIVE', NOW(), NOW())
                """)
                )
        session.commit()

        # 8. Board
        board_name = "Sprint Board"
        board_res = session.exec(
            text(
                f"SELECT id FROM boards WHERE project_id = '{proj_id}' AND title = '{board_name}'"
            )
        ).first()
        if board_res:
            board_id = str(board_res[0])
        else:
            board_id = str(uuid.uuid4())
            session.exec(
                text(f"""
                INSERT INTO boards (id, project_id, title, created_at, updated_at)
                VALUES ('{board_id}', '{proj_id}', '{board_name}', NOW(), NOW())
            """)
            )
        session.commit()

        # 9. Board Columns (Lists)
        column_ids = {}
        for idx, st in enumerate(statuses):
            col_res = session.exec(
                text(
                    f"SELECT id FROM board_columns WHERE board_id = '{board_id}' AND name = '{st['name']}'"
                )
            ).first()
            if col_res:
                column_ids[st["name"]] = str(col_res[0])
            else:
                col_id = str(uuid.uuid4())
                session.exec(
                    text(f"""
                    INSERT INTO board_columns (id, board_id, name, status_key, position, created_at, updated_at)
                    VALUES ('{col_id}', '{board_id}', '{st["name"]}', '{st["canonical"]}', {idx}, NOW(), NOW())
                """)
                )
                column_ids[st["name"]] = col_id
        session.commit()

        # 10. Sprints
        sprints = [
            {
                "name": "Sprint 1 (Done)",
                "status": "COMPLETED",
                "start": (datetime.now() - timedelta(days=14)).date().isoformat(),
                "end": datetime.now().date().isoformat(),
            },
            {
                "name": "Sprint 2 (Active)",
                "status": "ACTIVE",
                "start": datetime.now().date().isoformat(),
                "end": (datetime.now() + timedelta(days=14)).date().isoformat(),
            },
            {
                "name": "Sprint 3 (Planned)",
                "status": "PLANNED",
                "start": (datetime.now() + timedelta(days=15)).date().isoformat(),
                "end": (datetime.now() + timedelta(days=29)).date().isoformat(),
            },
        ]
        sprint_ids = {}
        for sp in sprints:
            sp_res = session.exec(
                text(
                    f"SELECT id FROM sprints WHERE project_id = '{proj_id}' AND name = '{sp['name']}'"
                )
            ).first()
            if sp_res:
                sprint_ids[sp["name"]] = str(sp_res[0])
            else:
                sp_id = str(uuid.uuid4())
                session.exec(
                    text(f"""
                    INSERT INTO sprints (id, project_id, name, status, start_date, end_date, created_at, updated_at)
                    VALUES ('{sp_id}', '{proj_id}', '{sp["name"]}', '{sp["status"]}', '{sp["start"]}', '{sp["end"]}', NOW(), NOW())
                """)
                )
                sprint_ids[sp["name"]] = sp_id
        session.commit()

        # 11. Tasks / Cards
        tasks_to_create = [
            {
                "title": "Setup repository and CI/CD",
                "column": "Done",
                "sprint": "Sprint 1 (Done)",
                "assignee": "dev1@example.com",
                "priority": "HIGH",
            },
            {
                "title": "Implement login screen",
                "column": "Done",
                "sprint": "Sprint 1 (Done)",
                "assignee": "dev2@example.com",
                "priority": "HIGH",
            },
            {
                "title": "Design database schema",
                "column": "Done",
                "sprint": "Sprint 1 (Done)",
                "assignee": "pm@example.com",
                "priority": "MEDIUM",
            },
            {
                "title": "Build dashboard layout",
                "column": "In Review",
                "sprint": "Sprint 2 (Active)",
                "assignee": "dev1@example.com",
                "priority": "HIGH",
            },
            {
                "title": "Integrate payments API",
                "column": "In Progress",
                "sprint": "Sprint 2 (Active)",
                "assignee": "dev2@example.com",
                "priority": "HIGHEST",
            },
            {
                "title": "Fix notification bug",
                "column": "In Progress",
                "sprint": "Sprint 2 (Active)",
                "assignee": "dev1@example.com",
                "priority": "MEDIUM",
            },
            {
                "title": "Write unit tests for Auth",
                "column": "To Do",
                "sprint": "Sprint 2 (Active)",
                "assignee": "dev2@example.com",
                "priority": "LOW",
            },
            {
                "title": "Add dark mode",
                "column": "To Do",
                "sprint": "Sprint 3 (Planned)",
                "assignee": None,
                "priority": "LOW",
            },
            {
                "title": "User profile page",
                "column": "To Do",
                "sprint": "Sprint 3 (Planned)",
                "assignee": None,
                "priority": "MEDIUM",
            },
        ]

        task_counter = 0
        for idx, tk in enumerate(tasks_to_create):
            task_res = session.exec(
                text(
                    f"SELECT id FROM tasks WHERE project_id = '{proj_id}' AND title = '{tk['title']}'"
                )
            ).first()
            if not task_res:
                tid = str(uuid.uuid4())
                col_id = column_ids[tk["column"]]
                s_id = sprint_ids[tk["sprint"]]
                cs_id = status_ids[tk["column"]]
                a_id = f"'{user_ids[tk['assignee']]}'" if tk["assignee"] else "NULL"
                task_counter += 1
                issue_key = f"{proj_key}-{task_counter}"

                session.exec(
                    text(f"""
                    INSERT INTO tasks (
                        id, project_id, board_id, column_id, title, description, priority, 
                        assignee_id, custom_status_id, position, type, sprint_id, issue_key, created_at, updated_at
                    ) VALUES (
                        '{tid}', '{proj_id}', '{board_id}', '{col_id}', '{tk["title"]}', 'Detailed description for {tk["title"]}', '{tk["priority"]}',
                        {a_id}, '{cs_id}', {idx}, 'TASK', '{s_id}', '{issue_key}', NOW(), NOW()
                    )
                """)
                )

                # 12. Comments
                if tk["assignee"]:
                    cid = str(uuid.uuid4())
                    author = user_ids[tk["assignee"]]
                    session.exec(
                        text(f"""
                        INSERT INTO comments (id, task_id, user_id, content, created_at, updated_at)
                        VALUES ('{cid}', '{tid}', '{author}', 'Looking into this task now.', NOW(), NOW())
                    """)
                    )

        if task_counter > 0:
            session.exec(
                text(
                    f"UPDATE projects SET task_counter = {task_counter} WHERE id = '{proj_id}'"
                )
            )
            session.commit()

        print("Full test data seeded successfully!")
        print(f"Workspace: {ws_name} ({ws_id})")
        print(f"Project: {proj_name} ({proj_id})")
        print(f"Board: {board_name} ({board_id})")


if __name__ == "__main__":
    main()
