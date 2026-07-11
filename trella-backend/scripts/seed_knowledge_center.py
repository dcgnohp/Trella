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
    {"name": "Product",          "color": "#0052CC", "icon": "📦"},
    {"name": "Technical Design", "color": "#6554C0", "icon": "🏗️"},
    {"name": "API",              "color": "#00B8D9", "icon": "🔌"},
    {"name": "Frontend",         "color": "#36B37E", "icon": "🎨"},
    {"name": "Backend",          "color": "#FF991F", "icon": "⚙️"},
    {"name": "DevOps",           "color": "#172B4D", "icon": "🚀"},
    {"name": "Business",         "color": "#DE350B", "icon": "💼"},
    {"name": "Meeting Notes",    "color": "#5E6C84", "icon": "📝"},
]

DOC_TEMPLATES = [
    # Product (12)
    {"title": "Product Roadmap Q3 2026",         "category": "Product",          "source_type": "MANUAL",        "pinned": True},
    {"title": "Feature Specification: Auth Flow", "category": "Product",         "source_type": "MANUAL",        "pinned": True},
    {"title": "User Research Findings",           "category": "Product",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Competitive Analysis",             "category": "Product",          "source_type": "MANUAL",        "pinned": False},
    {"title": "OKR Framework 2026",               "category": "Product",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Product Metrics Dashboard",        "category": "Product",          "source_type": "SPRINT_REPORT", "pinned": False},
    {"title": "Release Notes v2.1",               "category": "Product",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Beta Feedback Summary",            "category": "Product",          "source_type": "MEETING_NOTE",  "pinned": False},
    {"title": "Onboarding Flow Redesign",         "category": "Product",          "source_type": "MANUAL",        "pinned": True},
    {"title": "Payment Integration Spec",         "category": "Product",          "source_type": "RFC",           "pinned": False},
    {"title": "Mobile App Strategy",              "category": "Product",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Accessibility Audit Report",       "category": "Product",          "source_type": "MANUAL",        "pinned": False},
    # Technical Design (9)
    {"title": "System Architecture Overview",     "category": "Technical Design", "source_type": "ADR",           "pinned": True},
    {"title": "Database Schema Design",           "category": "Technical Design", "source_type": "MANUAL",        "pinned": False},
    {"title": "Microservices Migration Plan",     "category": "Technical Design", "source_type": "RFC",           "pinned": False},
    {"title": "Event Sourcing Pattern",           "category": "Technical Design", "source_type": "ADR",           "pinned": False},
    {"title": "CQRS Implementation Guide",        "category": "Technical Design", "source_type": "MANUAL",        "pinned": False},
    {"title": "Caching Strategy",                 "category": "Technical Design", "source_type": "ADR",           "pinned": False},
    {"title": "Auth Architecture Decision",       "category": "Technical Design", "source_type": "ADR",           "pinned": False},
    {"title": "Real-time Notifications Design",   "category": "Technical Design", "source_type": "RFC",           "pinned": False},
    {"title": "Multi-tenancy Architecture",       "category": "Technical Design", "source_type": "MANUAL",        "pinned": False},
    # API (5)
    {"title": "REST API Guidelines",              "category": "API",              "source_type": "MANUAL",        "pinned": False},
    {"title": "GraphQL Schema v2",                "category": "API",              "source_type": "MANUAL",        "pinned": False},
    {"title": "Webhook Integration Docs",         "category": "API",              "source_type": "MANUAL",        "pinned": False},
    {"title": "Rate Limiting Policy",             "category": "API",              "source_type": "ADR",           "pinned": False},
    {"title": "API Versioning Strategy",          "category": "API",              "source_type": "RFC",           "pinned": False},
    # Frontend (6)
    {"title": "Design System Components",         "category": "Frontend",         "source_type": "MANUAL",        "pinned": False},
    {"title": "State Management Guide",           "category": "Frontend",         "source_type": "MANUAL",        "pinned": False},
    {"title": "Performance Optimization Tips",    "category": "Frontend",         "source_type": "MANUAL",        "pinned": False},
    {"title": "Testing Strategy: React",          "category": "Frontend",         "source_type": "ADR",           "pinned": False},
    {"title": "Accessibility Guidelines",         "category": "Frontend",         "source_type": "MANUAL",        "pinned": False},
    {"title": "Routing Architecture",             "category": "Frontend",         "source_type": "MANUAL",        "pinned": False},
    # Backend (7)
    {"title": "FastAPI Best Practices",           "category": "Backend",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Database Migration Workflow",      "category": "Backend",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Background Job Processing",        "category": "Backend",          "source_type": "ADR",           "pinned": False},
    {"title": "Error Handling Standard",          "category": "Backend",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Logging & Observability",          "category": "Backend",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Security Checklist",               "category": "Backend",          "source_type": "MANUAL",        "pinned": False},
    {"title": "Service Layer Patterns",           "category": "Backend",          "source_type": "MANUAL",        "pinned": False},
    # DevOps (3)
    {"title": "CI/CD Pipeline Setup",             "category": "DevOps",           "source_type": "MANUAL",        "pinned": False},
    {"title": "Kubernetes Deployment Guide",      "category": "DevOps",           "source_type": "MANUAL",        "pinned": False},
    {"title": "Monitoring & Alerting Runbook",    "category": "DevOps",           "source_type": "MANUAL",        "pinned": False},
    # Business (4)
    {"title": "Q2 2026 Business Review",          "category": "Business",         "source_type": "MANUAL",        "pinned": False},
    {"title": "Partner Integration Agreement",    "category": "Business",         "source_type": "ATTACHMENT",    "pinned": False},
    {"title": "Hiring Plan 2026",                 "category": "Business",         "source_type": "MANUAL",        "pinned": False},
    {"title": "Investor Update - June 2026",      "category": "Business",         "source_type": "MANUAL",        "pinned": False},
    # Meeting Notes (2)
    {"title": "Sprint Planning - Week 28",        "category": "Meeting Notes",    "source_type": "MEETING_NOTE",  "pinned": False},
    {"title": "Architecture Review - July 2026",  "category": "Meeting Notes",    "source_type": "MEETING_NOTE",  "pinned": False},
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
        # Delete existing seed data
        session.exec(text(f"DELETE FROM knowledge_user_prefs WHERE workspace_id = '{workspace_id}'"))  # type: ignore
        session.exec(text(f"DELETE FROM docs WHERE workspace_id = '{workspace_id}'"))  # type: ignore
        session.exec(text(f"DELETE FROM knowledge_collections WHERE workspace_id = '{workspace_id}'"))  # type: ignore
        session.commit()

        now = datetime.now(timezone.utc)
        cat_ids: dict[str, str] = {}

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
            sql = text(f"""
                INSERT INTO docs (
                    id, workspace_id, title, content, source_type, category,
                    collection_id, created_by, position, is_archived, is_pinned_global,
                    created_at, updated_at
                ) VALUES (
                    '{did}', '{workspace_id}', '{title}', '{content}',
                    '{tmpl["source_type"]}', '{category}',
                    '{col_id}', '{user_id}', {i}, false, {str(tmpl["pinned"]).lower()},
                    '{created_at}', '{updated_at}'
                )
            """)
            session.exec(sql)  # type: ignore
            if tmpl["pinned"]:
                pinned_doc_ids.append(did)

        session.commit()

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
    parser.add_argument("--workspace-id", help="Workspace UUID (auto-discovers if omitted)")
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
