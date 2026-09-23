#!/usr/bin/env python3
"""Seed a rich showcase workspace for the onepiecezp@gmail.com account.

Creates a full SCRUM workspace ("ABG Engineering") with team members, custom
statuses, a workflow, one project, a board with columns, three sprints
(completed / active / planned), epics, stories/tasks/bugs across every column,
comments, docs, a plan, and activity logs — enough data to make every
dashboard page look populated for report screenshots.

Idempotent: re-running updates in place instead of duplicating.

Usage:
    cd trella-backend
    python scripts/seed_showcase_data.py
"""

import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine

OWNER_EMAIL = "onepiecezp@gmail.com"
WS_NAME = "ABG Engineering"
PROJECT_NAME = "Trella Platform"
PROJECT_KEY = "TRELLA"
BOARD_NAME = "Delivery Board"

# Existing users reused as teammates (must already exist in DB).
TEAM = [
    ("tuananh@example.com", "MEMBER"),
    ("ngoctram@example.com", "MEMBER"),
    ("haidang@example.com", "MEMBER"),
    ("dev1@example.com", "MEMBER"),
    ("dev2@example.com", "MEMBER"),
    ("pm@example.com", "MANAGER"),
]

STATUSES = [
    {"name": "To Do", "canonical": "TODO", "color": "#5E6C84"},
    {"name": "In Progress", "canonical": "IN_PROGRESS", "color": "#0052CC"},
    {"name": "In Review", "canonical": "PENDING", "color": "#FF991F"},
    {"name": "Done", "canonical": "DONE", "color": "#36B37E"},
]


def now():
    return datetime.now(timezone.utc)


def get_or_create(session, select_sql, params, insert_sql, insert_params):
    row = session.exec(text(select_sql), params=params).first()
    if row:
        return str(row[0]), False
    session.exec(text(insert_sql), params=insert_params)
    return insert_params["id"], True


def main():
    with Session(engine) as session:
        # --- Owner ---
        owner = session.exec(
            text("SELECT id, full_name FROM users WHERE email = :email"),
            params={"email": OWNER_EMAIL},
        ).first()
        if not owner:
            print(f"ERROR: owner {OWNER_EMAIL} not found. Aborting.")
            sys.exit(1)
        owner_id = str(owner[0])
        print(f"Owner: {owner[1]} ({owner_id})")

        # --- Team users (must exist) ---
        members = {OWNER_EMAIL: (owner_id, "OWNER")}
        for email, role in TEAM:
            u = session.exec(
                text("SELECT id FROM users WHERE email = :email"),
                params={"email": email},
            ).first()
            if u:
                members[email] = (str(u[0]), role)
            else:
                print(f"  WARN: teammate {email} missing, skipping")
        session.commit()

        seed_workspace(session, owner_id, members)


def seed_workspace(session, owner_id, members):
    # 1. Workspace (SCRUM)
    ws_id, _ = get_or_create(
        session,
        "SELECT id FROM workspaces WHERE name = :name",
        {"name": WS_NAME},
        """INSERT INTO workspaces (id, name, mode, created_at, updated_at)
           VALUES (:id, :name, 'SCRUM', :ts, :ts)""",
        {"id": str(uuid.uuid4()), "name": WS_NAME, "ts": now()},
    )
    session.commit()

    # 2. Workspace members
    for email, (uid, role) in members.items():
        exists = session.exec(
            text(
                "SELECT id FROM workspace_members WHERE workspace_id = :ws AND user_id = :uid"
            ),
            params={"ws": ws_id, "uid": uid},
        ).first()
        if not exists:
            session.exec(
                text(
                    """INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
                       VALUES (:id, :ws, :uid, :role, 'ACTIVE', :ts, :ts)"""
                ),
                params={
                    "id": str(uuid.uuid4()),
                    "ws": ws_id,
                    "uid": uid,
                    "role": role,
                    "ts": now(),
                },
            )
    session.commit()

    # 3. Custom statuses
    status_ids = {}
    for st in STATUSES:
        sid, _ = get_or_create(
            session,
            "SELECT id FROM custom_statuses WHERE workspace_id = :ws AND name = :name",
            {"ws": ws_id, "name": st["name"]},
            """INSERT INTO custom_statuses (id, workspace_id, name, color, canonical_status, created_at, updated_at)
               VALUES (:id, :ws, :name, :color, :canon, :ts, :ts)""",
            {
                "id": str(uuid.uuid4()),
                "ws": ws_id,
                "name": st["name"],
                "color": st["color"],
                "canon": st["canonical"],
                "ts": now(),
            },
        )
        status_ids[st["name"]] = sid
    session.commit()

    # 4. Workflow
    wf_id, _ = get_or_create(
        session,
        "SELECT id FROM workflows WHERE workspace_id = :ws AND name = :name",
        {"ws": ws_id, "name": "Standard Delivery Workflow"},
        """INSERT INTO workflows (id, workspace_id, name, description, is_active, created_at, updated_at)
           VALUES (:id, :ws, :name, :descr, true, :ts, :ts)""",
        {
            "id": str(uuid.uuid4()),
            "ws": ws_id,
            "name": "Standard Delivery Workflow",
            "descr": "Default software delivery workflow",
            "ts": now(),
        },
    )
    session.commit()

    seed_project(session, ws_id, owner_id, members, status_ids, wf_id)


def seed_project(session, ws_id, owner_id, members, status_ids, wf_id):
    # 5. Project
    proj_id, _ = get_or_create(
        session,
        "SELECT id FROM projects WHERE workspace_id = :ws AND key = :key",
        {"ws": ws_id, "key": PROJECT_KEY},
        """INSERT INTO projects (id, workspace_id, name, key, description, created_by, task_counter, workflow_id, created_at, updated_at)
           VALUES (:id, :ws, :name, :key, :descr, :owner, 0, :wf, :ts, :ts)""",
        {
            "id": str(uuid.uuid4()),
            "ws": ws_id,
            "name": PROJECT_NAME,
            "key": PROJECT_KEY,
            "descr": "AI-powered agile planning platform for engineering teams.",
            "owner": owner_id,
            "wf": wf_id,
            "ts": now(),
        },
    )
    session.commit()

    # 6. Project members
    for email, (uid, role) in members.items():
        prole = "PROJECT_ADMIN" if role in ("OWNER", "MANAGER") else "PROJECT_MEMBER"
        exists = session.exec(
            text(
                "SELECT id FROM project_members WHERE project_id = :p AND user_id = :uid"
            ),
            params={"p": proj_id, "uid": uid},
        ).first()
        if not exists:
            session.exec(
                text(
                    """INSERT INTO project_members (id, project_id, user_id, project_role, status, created_at, updated_at)
                       VALUES (:id, :p, :uid, :role, 'ACTIVE', :ts, :ts)"""
                ),
                params={
                    "id": str(uuid.uuid4()),
                    "p": proj_id,
                    "uid": uid,
                    "role": prole,
                    "ts": now(),
                },
            )
    session.commit()

    # 7. Board
    board_id, _ = get_or_create(
        session,
        "SELECT id FROM boards WHERE project_id = :p AND title = :title",
        {"p": proj_id, "title": BOARD_NAME},
        """INSERT INTO boards (id, project_id, title, created_at, updated_at)
           VALUES (:id, :p, :title, :ts, :ts)""",
        {"id": str(uuid.uuid4()), "p": proj_id, "title": BOARD_NAME, "ts": now()},
    )
    session.commit()

    # 8. Board members
    for email, (uid, role) in members.items():
        brole = "BOARD_ADMIN" if role in ("OWNER", "MANAGER") else "BOARD_MEMBER"
        exists = session.exec(
            text("SELECT id FROM board_members WHERE board_id = :b AND user_id = :uid"),
            params={"b": board_id, "uid": uid},
        ).first()
        if not exists:
            session.exec(
                text(
                    """INSERT INTO board_members (id, board_id, user_id, role, status, created_at, updated_at)
                       VALUES (:id, :b, :uid, :role, 'ACTIVE', :ts, :ts)"""
                ),
                params={
                    "id": str(uuid.uuid4()),
                    "b": board_id,
                    "uid": uid,
                    "role": brole,
                    "ts": now(),
                },
            )
    session.commit()

    # 9. Board columns
    column_ids = {}
    for idx, st in enumerate(STATUSES):
        cid, _ = get_or_create(
            session,
            "SELECT id FROM board_columns WHERE board_id = :b AND name = :name",
            {"b": board_id, "name": st["name"]},
            """INSERT INTO board_columns (id, board_id, name, status_key, position, created_at, updated_at)
               VALUES (:id, :b, :name, :sk, :pos, :ts, :ts)""",
            {
                "id": str(uuid.uuid4()),
                "b": board_id,
                "name": st["name"],
                "sk": st["canonical"],
                "pos": idx,
                "ts": now(),
            },
        )
        column_ids[st["name"]] = cid
    session.commit()

    ctx = {
        "ws_id": ws_id,
        "proj_id": proj_id,
        "board_id": board_id,
        "owner_id": owner_id,
        "members": members,
        "status_ids": status_ids,
        "column_ids": column_ids,
    }
    seed_sprints_and_tasks(session, ctx)


def seed_sprints_and_tasks(session, ctx):
    proj_id = ctx["proj_id"]
    board_id = ctx["board_id"]
    column_ids = ctx["column_ids"]
    status_ids = ctx["status_ids"]
    members = ctx["members"]
    today = now()

    # emails available as assignees
    emails = [e for e in members if e != OWNER_EMAIL] or [OWNER_EMAIL]

    def uid_of(email):
        return members[email][0]

    # 10. Sprints
    sprints = [
        {
            "name": "Sprint 22 — Foundations",
            "goal": "Ship auth, board core, and CI/CD pipeline.",
            "status": "COMPLETED",
            "start": today - timedelta(days=28),
            "end": today - timedelta(days=14),
        },
        {
            "name": "Sprint 23 — AI Suite",
            "goal": "Deliver AI chat, search, and sprint summaries.",
            "status": "ACTIVE",
            "start": today - timedelta(days=7),
            "end": today + timedelta(days=7),
        },
        {
            "name": "Sprint 24 — Integrations",
            "goal": "Two-way Jira sync and reporting dashboards.",
            "status": "PLANNED",
            "start": today + timedelta(days=8),
            "end": today + timedelta(days=22),
        },
    ]
    sprint_ids = {}
    for sp in sprints:
        sid, _ = get_or_create(
            session,
            "SELECT id FROM sprints WHERE project_id = :p AND name = :name",
            {"p": proj_id, "name": sp["name"]},
            """INSERT INTO sprints (id, project_id, name, goal, status, start_date, end_date, created_at, updated_at)
               VALUES (:id, :p, :name, :goal, :status, :start, :end, :ts, :ts)""",
            {
                "id": str(uuid.uuid4()),
                "p": proj_id,
                "name": sp["name"],
                "goal": sp["goal"],
                "status": sp["status"],
                "start": sp["start"].date().isoformat(),
                "end": sp["end"].date().isoformat(),
                "ts": now(),
            },
        )
        sprint_ids[sp["name"]] = sid
    session.commit()

    S1, S2, S3 = (
        "Sprint 22 — Foundations",
        "Sprint 23 — AI Suite",
        "Sprint 24 — Integrations",
    )

    # 11. Epics (type EPIC, no column semantics but need a column_id NOT NULL)
    todo_col = column_ids["To Do"]
    epics = [
        ("Authentication & Access", "Login, OAuth, RBAC and session management."),
        ("AI Suite", "Chat, semantic search, summaries and smart suggestions."),
        ("Jira Integration", "Bi-directional sync of tasks, epics and docs."),
    ]
    epic_ids = {}
    counter = 0
    for name, descr in epics:
        counter += 1
        eid, created = get_or_create(
            session,
            "SELECT id FROM tasks WHERE project_id = :p AND title = :title AND type = 'EPIC'",
            {"p": proj_id, "title": name},
            """INSERT INTO tasks (id, project_id, board_id, column_id, title, description, priority,
                   custom_status_id, position, type, issue_key, created_at, updated_at)
               VALUES (:id, :p, :b, :col, :title, :descr, 'HIGH', :cs, :pos, 'EPIC', :key, :ts, :ts)""",
            {
                "id": str(uuid.uuid4()),
                "p": proj_id,
                "b": board_id,
                "col": todo_col,
                "title": name,
                "descr": descr,
                "cs": status_ids["To Do"],
                "pos": counter,
                "key": f"{PROJECT_KEY}-{counter}",
                "ts": now(),
            },
        )
        epic_ids[name] = eid
    session.commit()

    # 12. Tasks / stories / bugs
    # (title, column, sprint, assignee_email, priority, type, story_point, epic)
    tasks = [
        # Sprint 22 — done
        ("Setup repository and CI/CD", "Done", S1, "dev1@example.com", "HIGH", "TASK", 5, "Authentication & Access"),
        ("Implement email/password login", "Done", S1, "dev2@example.com", "HIGHEST", "STORY", 8, "Authentication & Access"),
        ("OAuth Google sign-in", "Done", S1, "haidang@example.com", "HIGH", "STORY", 5, "Authentication & Access"),
        ("Design Kanban board core", "Done", S1, "ngoctram@example.com", "MEDIUM", "STORY", 8, "AI Suite"),
        ("RBAC middleware", "Done", S1, "tuananh@example.com", "HIGH", "TASK", 3, "Authentication & Access"),
        # Sprint 23 — active, mixed columns
        ("AI Chat assistant", "In Progress", S2, "dev1@example.com", "HIGHEST", "STORY", 13, "AI Suite"),
        ("Semantic search API", "In Progress", S2, "haidang@example.com", "HIGH", "STORY", 8, "AI Suite"),
        ("Sprint summary generator", "In Review", S2, "ngoctram@example.com", "MEDIUM", "STORY", 5, "AI Suite"),
        ("Fix login token refresh bug", "In Progress", S2, "dev2@example.com", "HIGHEST", "BUG", 3, "Authentication & Access"),
        ("Board drag-and-drop persistence", "In Review", S2, "tuananh@example.com", "MEDIUM", "TASK", 5, "AI Suite"),
        ("AI task description generator", "To Do", S2, "pm@example.com", "MEDIUM", "STORY", 5, "AI Suite"),
        ("Rate-limit AI endpoints", "To Do", S2, None, "LOW", "TASK", 2, "AI Suite"),
        # Sprint 24 — planned backlog
        ("Jira two-way sync engine", "To Do", S3, "dev1@example.com", "HIGH", "STORY", 13, "Jira Integration"),
        ("Map Jira statuses to canonical", "To Do", S3, "haidang@example.com", "MEDIUM", "TASK", 5, "Jira Integration"),
        ("Burndown & velocity reports", "To Do", S3, "ngoctram@example.com", "MEDIUM", "STORY", 8, "AI Suite"),
        ("Webhook retry on failure", "To Do", S3, None, "LOW", "BUG", 3, "Jira Integration"),
        ("Gantt timeline engine", "To Do", S3, "dev2@example.com", "HIGH", "STORY", 13, "AI Suite"),
        ("Release notes automation", "To Do", S3, None, "LOWEST", "TASK", 2, "AI Suite"),
    ]

    created_tasks = []
    for i, (title, col, sprint, assignee, prio, ttype, sp, epic) in enumerate(tasks):
        counter += 1
        issue_key = f"{PROJECT_KEY}-{counter}"
        existing = session.exec(
            text("SELECT id FROM tasks WHERE project_id = :p AND title = :title"),
            params={"p": proj_id, "title": title},
        ).first()
        if existing:
            created_tasks.append((str(existing[0]), title, assignee))
            counter -= 1  # don't consume key for pre-existing
            continue
        tid = str(uuid.uuid4())
        due = None
        if sprint == S2:
            due = today + timedelta(days=3)
        elif sprint == S3:
            due = today + timedelta(days=18)
        session.exec(
            text(
                """INSERT INTO tasks (id, project_id, board_id, column_id, title, description, priority,
                       assignee_id, custom_status_id, position, type, sprint_id, epic_id, story_point,
                       due_date, issue_key, created_at, updated_at)
                   VALUES (:id, :p, :b, :col, :title, :descr, :prio, :assignee, :cs, :pos, :type,
                       :sprint, :epic, :sp, :due, :key, :ts, :ts)"""
            ),
            params={
                "id": tid,
                "p": proj_id,
                "b": board_id,
                "col": column_ids[col],
                "title": title,
                "descr": f"{title}. Part of the {epic} epic.",
                "prio": prio,
                "assignee": uid_of(assignee) if assignee else None,
                "cs": status_ids[col],
                "pos": i,
                "type": ttype,
                "sprint": sprint_ids[sprint],
                "epic": epic_ids[epic],
                "sp": sp,
                "due": due,
                "key": issue_key,
                "ts": now(),
            },
        )
        created_tasks.append((tid, title, assignee))
    session.exec(
        text("UPDATE projects SET task_counter = :c WHERE id = :p"),
        params={"c": counter, "p": proj_id},
    )
    session.commit()

    seed_comments_docs_activity(session, ctx, created_tasks, sprint_ids, uid_of, emails)


def seed_comments_docs_activity(session, ctx, created_tasks, sprint_ids, uid_of, emails):
    ws_id = ctx["ws_id"]
    proj_id = ctx["proj_id"]
    board_id = ctx["board_id"]
    owner_id = ctx["owner_id"]

    # 13. Comments (a couple per assigned task)
    sample_comments = [
        "Picking this up now, will push a draft PR shortly.",
        "Blocked on the API contract — synced with backend team.",
        "Ready for review, added tests and updated docs.",
    ]
    for idx, (tid, title, assignee) in enumerate(created_tasks):
        if not assignee:
            continue
        exists = session.exec(
            text("SELECT id FROM comments WHERE task_id = :t LIMIT 1"),
            params={"t": tid},
        ).first()
        if exists:
            continue
        session.exec(
            text(
                """INSERT INTO comments (id, task_id, user_id, content, created_at, updated_at)
                   VALUES (:id, :t, :u, :c, :ts, :ts)"""
            ),
            params={
                "id": str(uuid.uuid4()),
                "t": tid,
                "u": uid_of(assignee),
                "c": sample_comments[idx % len(sample_comments)],
                "ts": now(),
            },
        )
    session.commit()

    # 14. Docs (workspace knowledge)
    docs = [
        ("Product Requirements — Trella", "# Trella PRD\n\nAI-powered agile planning platform.\n\n## Goals\n- Plan, track and ship software\n- AI at every step\n", "REQUIREMENTS"),
        ("Architecture Overview", "# Architecture\n\nRepository → Service → Router.\n\n- FastAPI backend\n- Next.js frontend\n- PostgreSQL + pgvector\n", "TECHNICAL"),
        ("Sprint 23 Planning Notes", "# Sprint 23 — AI Suite\n\nCommitted 34 story points across chat, search and summaries.\n", "GENERAL"),
        ("API Style Guide", "# API Style Guide\n\nConsistent REST conventions, error envelopes and pagination.\n", "TECHNICAL"),
    ]
    for pos, (title, content, category) in enumerate(docs):
        exists = session.exec(
            text("SELECT id FROM docs WHERE workspace_id = :ws AND title = :title"),
            params={"ws": ws_id, "title": title},
        ).first()
        if exists:
            continue
        session.exec(
            text(
                """INSERT INTO docs (id, workspace_id, title, content, created_by, position,
                       is_archived, source_type, category, is_pinned_global, created_at, updated_at)
                   VALUES (:id, :ws, :title, :content, :owner, :pos, false, 'MANUAL', :cat, false, :ts, :ts)"""
            ),
            params={
                "id": str(uuid.uuid4()),
                "ws": ws_id,
                "title": title,
                "content": content,
                "owner": owner_id,
                "pos": pos,
                "cat": category,
                "ts": now(),
            },
        )
    session.commit()

    # 15. Plan (+ link board)
    plan_id, created = get_or_create(
        session,
        "SELECT id FROM plans WHERE workspace_id = :ws AND name = :name",
        {"ws": ws_id, "name": "Q3 Delivery Plan"},
        """INSERT INTO plans (id, workspace_id, name, description, created_by, status, created_at, updated_at)
           VALUES (:id, :ws, :name, :descr, :owner, 'ACTIVE', :ts, :ts)""",
        {
            "id": str(uuid.uuid4()),
            "ws": ws_id,
            "name": "Q3 Delivery Plan",
            "descr": "Cross-team program plan for the Q3 release.",
            "owner": owner_id,
            "ts": now(),
        },
    )
    if created:
        session.exec(
            text(
                """INSERT INTO plan_boards (id, plan_id, board_id, created_at, updated_at)
                   VALUES (:id, :plan, :board, :ts, :ts)"""
            ),
            params={
                "id": str(uuid.uuid4()),
                "plan": plan_id,
                "board": board_id,
                "ts": now(),
            },
        )
    session.commit()

    # 16. Activity logs
    actions = ["TASK_CREATED", "TASK_STATUS_CHANGED", "SPRINT_STARTED", "COMMENT_CREATED", "TASK_ASSIGNED"]
    have = session.exec(
        text("SELECT count(*) FROM activity_logs WHERE workspace_id = :ws"),
        params={"ws": ws_id},
    ).first()
    if not have or have[0] == 0:
        for i, (tid, title, assignee) in enumerate(created_tasks[:8]):
            session.exec(
                text(
                    """INSERT INTO activity_logs (id, workspace_id, project_id, task_id, actor_id, action,
                           old_value, new_value, created_at, updated_at)
                       VALUES (:id, :ws, :p, :t, :actor, :action, NULL, :nv, :ts, :ts)"""
                ),
                params={
                    "id": str(uuid.uuid4()),
                    "ws": ws_id,
                    "p": proj_id,
                    "t": tid,
                    "actor": uid_of(assignee) if assignee else owner_id,
                    "action": actions[i % len(actions)],
                    "nv": '{"title": "' + title.replace('"', "") + '"}',
                    "ts": now(),
                },
            )
        session.commit()

    # 17. Notifications for owner
    have_n = session.exec(
        text("SELECT count(*) FROM notifications WHERE user_id = :u"),
        params={"u": owner_id},
    ).first()
    if not have_n or have_n[0] == 0:
        notifs = [
            ("TASK_ASSIGNED", "You were assigned a task", "AI Chat assistant was assigned to you."),
            ("COMMENT_MENTION", "You were mentioned", "Ngọc Trâm mentioned you in Semantic search API."),
            ("PROJECT_INVITATION", "Project update", "Sprint 23 — AI Suite has started."),
        ]
        for ntype, title, content in notifs:
            session.exec(
                text(
                    """INSERT INTO notifications (id, user_id, type, title, content, metadata, is_read, created_at, updated_at)
                       VALUES (:id, :u, :type, :title, :content, '{}', false, :ts, :ts)"""
                ),
                params={
                    "id": str(uuid.uuid4()),
                    "u": owner_id,
                    "type": ntype,
                    "title": title,
                    "content": content,
                    "ts": now(),
                },
            )
        session.commit()

    print("\nShowcase data seeded successfully!")
    print(f"  Workspace : {WS_NAME} ({ws_id})")
    print(f"  Project   : {PROJECT_NAME} ({proj_id})")
    print(f"  Board     : {BOARD_NAME} ({board_id})")
    print(f"  Tasks     : {len(created_tasks)} (+3 epics)")
    print(f"  Plan      : Q3 Delivery Plan ({plan_id})")


if __name__ == "__main__":
    main()
