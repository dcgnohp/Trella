"""Samples for prompt evaluation."""

BREAKDOWN_SAMPLES = [
    {
        "title": "Implement OAuth2 login",
        "description": "Users should be able to log in with Google and GitHub.",
        "labels": ["auth", "backend"],
        "priority": "high",
        "sprint": "Sprint 1",
    },
    {
        "title": "Fix alignment on homepage",
        "description": "The hero section is slightly off center on mobile.",
        "labels": ["frontend", "bug"],
        "priority": "low",
        "sprint": "Sprint 2",
    },
]

STORY_POINT_SAMPLES = [
    {
        "title": "Migrate database to PostgreSQL",
        "description": "Move all data from SQLite to PostgreSQL. Update SQLAlchemy models if needed.",
        "labels": ["backend", "database"],
        "priority": "critical",
        "sprint_goal": "Scale the backend",
        "velocity": "30",
        "history": [{"title": "Add redis cache", "story_point": 5}],
    },
]

DOC_SUMMARY_SAMPLES = [
    {
        "title": "Design Spec: Notification Service",
        "content": (
            "The notification service delivers in-app, email, and push messages. "
            "It exposes a single publish endpoint and fans out to per-channel "
            "workers via a queue. Delivery is at-least-once; consumers must be "
            "idempotent. Rate limiting is per-user, sliding window. Open question: "
            "do we need per-tenant quotas before launch, or is a global cap enough?"
        ),
    },
    {
        "title": "Meeting Notes: Sprint 4 Planning",
        "content": (
            "Attendees: Ana, Ben, Chika. We agreed to cut the CSV export from this "
            "sprint and prioritize the search bug that blocks two customers. Ben "
            "will own the search fix and pair with Ana on tests. Decision: freeze "
            "the schema until the migration lands. Action item: Chika to draft the "
            "migration plan by Thursday and share it in the channel."
        ),
    },
]
