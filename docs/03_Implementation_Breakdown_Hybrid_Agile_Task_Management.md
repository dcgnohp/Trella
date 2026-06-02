# Implementation Breakdown
# Hybrid Agile Task Management Platform with Trello-Jira Migration and Synchronization

## 1. Development Strategy

Use modular monolith architecture.

Each backend module should contain:

```text
models.py
schemas.py
repository.py
service.py
router.py
```

Implementation order:

1. Auth
2. Workspace
3. Project
4. Board
5. Task
6. Comment
7. Activity
8. Agile
9. Workflow
10. Notification
11. Report
12. Integration
13. Migration
14. Sync

---

# 2. Backend Models

## 2.1 User Model

Fields:
- id
- email
- password_hash
- full_name
- avatar_url
- is_active
- created_at
- updated_at

Functions:
- create_user()
- get_user_by_email()
- get_user_by_id()
- update_user_profile()

Repository:
- UserRepository.create()
- UserRepository.get_by_email()
- UserRepository.get_by_id()
- UserRepository.update()

Service:
- AuthService.register()
- AuthService.login()
- AuthService.get_current_user()

Router:
- POST /auth/register
- POST /auth/login
- GET /auth/me

---

## 2.2 Workspace Model

Fields:
- id
- name
- description
- owner_id
- created_at
- updated_at

Repository:
- WorkspaceRepository.create()
- WorkspaceRepository.get_by_id()
- WorkspaceRepository.list_by_user()
- WorkspaceRepository.update()
- WorkspaceRepository.delete()

Service:
- WorkspaceService.create_workspace()
- WorkspaceService.get_my_workspaces()
- WorkspaceService.update_workspace()
- WorkspaceService.delete_workspace()

Router:
- POST /workspaces
- GET /workspaces
- GET /workspaces/{workspace_id}
- PATCH /workspaces/{workspace_id}
- DELETE /workspaces/{workspace_id}

---

## 2.3 WorkspaceMember Model

Fields:
- id
- workspace_id
- user_id
- role
- created_at

Repository:
- WorkspaceMemberRepository.add_member()
- WorkspaceMemberRepository.remove_member()
- WorkspaceMemberRepository.get_member()
- WorkspaceMemberRepository.list_members()
- WorkspaceMemberRepository.update_role()

Service:
- WorkspaceMemberService.invite_member()
- WorkspaceMemberService.remove_member()
- WorkspaceMemberService.change_role()
- WorkspaceMemberService.check_permission()

Router:
- POST /workspaces/{workspace_id}/members
- GET /workspaces/{workspace_id}/members
- PATCH /workspaces/{workspace_id}/members/{user_id}/role
- DELETE /workspaces/{workspace_id}/members/{user_id}

---

## 2.4 Project Model

Fields:
- id
- workspace_id
- name
- key
- description
- created_by
- created_at
- updated_at

Repository:
- ProjectRepository.create()
- ProjectRepository.get_by_id()
- ProjectRepository.list_by_workspace()
- ProjectRepository.update()
- ProjectRepository.delete()

Service:
- ProjectService.create_project()
- ProjectService.generate_project_key()
- ProjectService.list_projects()
- ProjectService.update_project()
- ProjectService.delete_project()

Router:
- POST /workspaces/{workspace_id}/projects
- GET /workspaces/{workspace_id}/projects
- GET /projects/{project_id}
- PATCH /projects/{project_id}
- DELETE /projects/{project_id}

---

## 2.5 Board Model

Fields:
- id
- project_id
- name
- type
- created_at
- updated_at

Repository:
- BoardRepository.create()
- BoardRepository.get_by_id()
- BoardRepository.get_by_project()
- BoardRepository.update()
- BoardRepository.delete()

Service:
- BoardService.create_board()
- BoardService.create_default_board()
- BoardService.get_board_detail()

Router:
- POST /projects/{project_id}/boards
- GET /boards/{board_id}

---

## 2.6 BoardColumn Model

Fields:
- id
- board_id
- name
- status_key
- position
- is_done_column
- created_at
- updated_at

Repository:
- BoardColumnRepository.create()
- BoardColumnRepository.list_by_board()
- BoardColumnRepository.update()
- BoardColumnRepository.delete()
- BoardColumnRepository.reorder()

Service:
- BoardColumnService.create_column()
- BoardColumnService.update_column()
- BoardColumnService.delete_column()
- BoardColumnService.reorder_columns()

Router:
- POST /boards/{board_id}/columns
- PATCH /boards/{board_id}/columns/{column_id}
- DELETE /boards/{board_id}/columns/{column_id}
- PATCH /boards/{board_id}/columns/reorder

---

## 2.7 Task Model

Fields:
- id
- project_id
- board_id
- column_id
- sprint_id
- epic_id
- parent_task_id
- task_key
- title
- description
- type
- priority
- status
- assignee_id
- reporter_id
- story_point
- due_date
- position
- created_at
- updated_at
- completed_at

Repository:
- TaskRepository.create()
- TaskRepository.get_by_id()
- TaskRepository.list_by_board()
- TaskRepository.list_by_project()
- TaskRepository.list_by_sprint()
- TaskRepository.list_backlog()
- TaskRepository.update()
- TaskRepository.delete()
- TaskRepository.move()
- TaskRepository.update_position()

Service:
- TaskService.create_task()
- TaskService.update_task()
- TaskService.delete_task()
- TaskService.move_task()
- TaskService.assign_task()
- TaskService.update_priority()
- TaskService.update_due_date()
- TaskService.update_story_point()
- TaskService.create_subtask()
- TaskService.generate_task_key()

Router:
- POST /projects/{project_id}/tasks
- GET /tasks/{task_id}
- GET /boards/{board_id}/tasks
- GET /projects/{project_id}/tasks
- PATCH /tasks/{task_id}
- DELETE /tasks/{task_id}
- PATCH /tasks/{task_id}/move
- PATCH /tasks/{task_id}/assign
- PATCH /tasks/{task_id}/priority
- PATCH /tasks/{task_id}/due-date
- PATCH /tasks/{task_id}/story-point
- POST /tasks/{task_id}/subtasks

---

## 2.8 Comment Model

Fields:
- id
- task_id
- user_id
- content
- created_at
- updated_at

Repository:
- CommentRepository.create()
- CommentRepository.list_by_task()
- CommentRepository.update()
- CommentRepository.delete()

Service:
- CommentService.create_comment()
- CommentService.list_comments()
- CommentService.update_comment()
- CommentService.delete_comment()

Router:
- POST /tasks/{task_id}/comments
- GET /tasks/{task_id}/comments
- PATCH /comments/{comment_id}
- DELETE /comments/{comment_id}

---

## 2.9 Label Model

Fields:
- id
- project_id
- name
- color
- created_at

Repository:
- LabelRepository.create()
- LabelRepository.list_by_project()
- LabelRepository.assign_to_task()
- LabelRepository.remove_from_task()

Service:
- LabelService.create_label()
- LabelService.assign_label()
- LabelService.remove_label()

Router:
- POST /projects/{project_id}/labels
- GET /projects/{project_id}/labels
- POST /tasks/{task_id}/labels/{label_id}
- DELETE /tasks/{task_id}/labels/{label_id}

---

## 2.10 ActivityLog Model

Fields:
- id
- workspace_id
- project_id
- task_id
- actor_id
- action
- old_value
- new_value
- created_at

Repository:
- ActivityRepository.create()
- ActivityRepository.list_by_task()
- ActivityRepository.list_by_project()

Service:
- ActivityService.log()
- ActivityService.get_task_activities()
- ActivityService.get_project_activities()

Router:
- GET /tasks/{task_id}/activities
- GET /projects/{project_id}/activities

---

## 2.11 Sprint Model

Fields:
- id
- project_id
- name
- goal
- status
- start_date
- end_date
- created_at
- updated_at

Repository:
- SprintRepository.create()
- SprintRepository.get_by_id()
- SprintRepository.list_by_project()
- SprintRepository.update()
- SprintRepository.delete()
- SprintRepository.get_active_sprint()

Service:
- SprintService.create_sprint()
- SprintService.start_sprint()
- SprintService.complete_sprint()
- SprintService.add_task_to_sprint()
- SprintService.remove_task_from_sprint()

Router:
- POST /projects/{project_id}/sprints
- GET /projects/{project_id}/sprints
- GET /sprints/{sprint_id}
- PATCH /sprints/{sprint_id}
- DELETE /sprints/{sprint_id}
- POST /sprints/{sprint_id}/start
- POST /sprints/{sprint_id}/complete
- POST /sprints/{sprint_id}/tasks/{task_id}
- DELETE /sprints/{sprint_id}/tasks/{task_id}

---

## 2.12 Epic

Implementation:
- Use Task model with type = EPIC.

Service:
- EpicService.create_epic()
- EpicService.list_epics()
- EpicService.add_task_to_epic()
- EpicService.remove_task_from_epic()
- EpicService.calculate_progress()

Router:
- POST /projects/{project_id}/epics
- GET /projects/{project_id}/epics
- POST /epics/{epic_id}/tasks/{task_id}
- DELETE /epics/{epic_id}/tasks/{task_id}
- GET /epics/{epic_id}/progress

---

## 2.13 WorkflowTransition Model

Fields:
- id
- project_id
- from_status
- to_status
- role_required
- created_at

Repository:
- WorkflowRepository.create_transition()
- WorkflowRepository.list_transitions()
- WorkflowRepository.delete_transition()
- WorkflowRepository.find_transition()

Service:
- WorkflowService.create_transition()
- WorkflowService.validate_transition()
- WorkflowService.apply_transition()

Router:
- POST /projects/{project_id}/workflow/transitions
- GET /projects/{project_id}/workflow/transitions
- DELETE /workflow/transitions/{transition_id}
- POST /tasks/{task_id}/transition

---

## 2.14 Notification Model

Fields:
- id
- user_id
- type
- title
- content
- is_read
- metadata
- created_at

Repository:
- NotificationRepository.create()
- NotificationRepository.list_by_user()
- NotificationRepository.mark_read()
- NotificationRepository.mark_all_read()

Service:
- NotificationService.create_notification()
- NotificationService.list_my_notifications()
- NotificationService.mark_read()
- NotificationService.broadcast_notification()

Router:
- GET /notifications
- PATCH /notifications/{notification_id}/read
- PATCH /notifications/read-all

---

## 2.15 ExternalIntegration Model

Fields:
- id
- workspace_id
- provider
- account_id
- account_name
- access_token_encrypted
- refresh_token_encrypted
- metadata
- created_at
- updated_at

Repository:
- IntegrationRepository.create()
- IntegrationRepository.get_by_provider()
- IntegrationRepository.update_token()
- IntegrationRepository.delete()

Service:
- TrelloIntegrationService.connect()
- TrelloIntegrationService.fetch_boards()
- TrelloIntegrationService.fetch_board_detail()
- JiraIntegrationService.connect()
- JiraIntegrationService.fetch_projects()
- JiraIntegrationService.fetch_statuses()
- JiraIntegrationService.create_issue()

Router:
- POST /integrations/trello/connect
- GET /integrations/trello/boards
- GET /integrations/trello/boards/{board_id}
- POST /integrations/jira/connect
- GET /integrations/jira/projects
- GET /integrations/jira/projects/{project_id}/statuses

---

## 2.16 SyncProject Model

Fields:
- id
- workspace_id
- internal_project_id
- trello_board_id
- jira_project_id
- jira_project_key
- sync_mode
- created_at
- updated_at

Service:
- SyncProjectService.create_mapping()
- SyncProjectService.get_mapping()
- SyncProjectService.update_sync_mode()

---

## 2.17 SyncTask Model

Fields:
- id
- sync_project_id
- internal_task_id
- trello_card_id
- jira_issue_id
- jira_issue_key
- last_synced_at
- last_source
- created_at
- updated_at

Service:
- SyncTaskService.create_mapping()
- SyncTaskService.find_by_trello_card()
- SyncTaskService.find_by_jira_issue()
- SyncTaskService.update_mapping()

---

# 3. Migration Services

## 3.1 TrelloImportService

Functions:
- preview_board_import()
- import_board()
- import_lists()
- import_cards()
- import_labels()
- import_checklists()
- import_comments()
- create_sync_mappings()
- generate_import_report()

Pseudo flow:
```text
fetch Trello board
fetch lists
fetch cards
create internal project
create board
create columns
create labels
create tasks
create subtasks from checklists
create comments
create sync mapping
return report
```

## 3.2 JiraExportService

Functions:
- preview_jira_export()
- export_project()
- create_jira_epics()
- create_jira_issues()
- create_jira_subtasks()
- create_jira_comments()
- create_sync_mappings()
- generate_export_report()

## 3.3 TrelloToJiraMigrationService

Functions:
- preview_migration()
- validate_status_mapping()
- migrate_board_to_jira()
- migrate_card_to_issue()
- migrate_checklist_to_subtask()
- migrate_comments()
- generate_migration_report()

---

# 4. Sync Engine

## 4.1 SyncEngineService

Functions:
- handle_trello_webhook()
- handle_jira_webhook()
- sync_trello_to_jira()
- sync_jira_to_trello()
- detect_conflict()
- resolve_conflict()
- create_sync_log()
- retry_failed_sync()

## 4.2 Idempotency

Use Redis key:
```text
sync:event:{provider}:{event_id}
```

If key exists:
- skip processing

If key does not exist:
- process
- set key with TTL

## 4.3 Infinite Loop Prevention

When system updates Jira from Trello:
- Save last_source = TRELLO
- Store correlation_id
- If Jira webhook returns same correlation_id, skip

---

# 5. Frontend Pages

## Auth
- /login
- /register

## Workspace
- /workspaces
- /workspaces/:id
- /workspaces/:id/members
- /workspaces/:id/integrations

## Project
- /projects/:id/board
- /projects/:id/backlog
- /projects/:id/sprints
- /projects/:id/epics
- /projects/:id/reports
- /projects/:id/settings
- /projects/:id/workflow

## Migration
- /workspaces/:id/migrations/trello-import
- /workspaces/:id/migrations/jira-export
- /workspaces/:id/migrations/trello-to-jira
- /workspaces/:id/migrations/:migration_id/result

---

# 6. Frontend Components

## Kanban
- KanbanBoard
- KanbanColumn
- TaskCard
- TaskDetailModal
- CreateTaskModal

## Agile
- BacklogList
- SprintCard
- SprintBoard
- EpicList
- EpicProgress

## Report
- ProjectSummaryCards
- BurndownChart
- VelocityChart
- WorkloadChart
- OverdueTaskTable

## Integration
- TrelloConnectCard
- JiraConnectCard
- TrelloBoardSelector
- JiraProjectSelector
- StatusMappingTable
- MigrationPreview
- MigrationProgress
- MigrationResult

---

# 7. API Implementation Checklist

## Auth
- [ ] POST /auth/register
- [ ] POST /auth/login
- [ ] GET /auth/me
- [ ] POST /auth/refresh

## Workspace
- [ ] POST /workspaces
- [ ] GET /workspaces
- [ ] GET /workspaces/{workspace_id}
- [ ] PATCH /workspaces/{workspace_id}
- [ ] DELETE /workspaces/{workspace_id}
- [ ] POST /workspaces/{workspace_id}/members
- [ ] GET /workspaces/{workspace_id}/members
- [ ] PATCH /workspaces/{workspace_id}/members/{user_id}/role
- [ ] DELETE /workspaces/{workspace_id}/members/{user_id}

## Project
- [ ] POST /workspaces/{workspace_id}/projects
- [ ] GET /workspaces/{workspace_id}/projects
- [ ] GET /projects/{project_id}
- [ ] PATCH /projects/{project_id}
- [ ] DELETE /projects/{project_id}

## Board
- [ ] POST /projects/{project_id}/boards
- [ ] GET /boards/{board_id}
- [ ] POST /boards/{board_id}/columns
- [ ] PATCH /boards/{board_id}/columns/{column_id}
- [ ] DELETE /boards/{board_id}/columns/{column_id}
- [ ] PATCH /boards/{board_id}/columns/reorder

## Task
- [ ] POST /projects/{project_id}/tasks
- [ ] GET /tasks/{task_id}
- [ ] GET /boards/{board_id}/tasks
- [ ] GET /projects/{project_id}/tasks
- [ ] PATCH /tasks/{task_id}
- [ ] DELETE /tasks/{task_id}
- [ ] PATCH /tasks/{task_id}/move
- [ ] PATCH /tasks/{task_id}/assign
- [ ] PATCH /tasks/{task_id}/priority
- [ ] PATCH /tasks/{task_id}/due-date
- [ ] PATCH /tasks/{task_id}/story-point
- [ ] POST /tasks/{task_id}/subtasks

## Comment
- [ ] POST /tasks/{task_id}/comments
- [ ] GET /tasks/{task_id}/comments
- [ ] PATCH /comments/{comment_id}
- [ ] DELETE /comments/{comment_id}

## Agile
- [ ] POST /projects/{project_id}/sprints
- [ ] GET /projects/{project_id}/sprints
- [ ] POST /sprints/{sprint_id}/start
- [ ] POST /sprints/{sprint_id}/complete
- [ ] POST /sprints/{sprint_id}/tasks/{task_id}
- [ ] DELETE /sprints/{sprint_id}/tasks/{task_id}
- [ ] POST /projects/{project_id}/epics
- [ ] GET /projects/{project_id}/epics
- [ ] GET /epics/{epic_id}/progress

## Integration and Migration
- [ ] POST /integrations/trello/connect
- [ ] GET /integrations/trello/boards
- [ ] POST /integrations/jira/connect
- [ ] GET /integrations/jira/projects
- [ ] POST /migrations/trello/import/preview
- [ ] POST /migrations/trello/import
- [ ] POST /migrations/jira/export/preview
- [ ] POST /migrations/jira/export
- [ ] POST /migrations/trello-to-jira/preview
- [ ] POST /migrations/trello-to-jira/start
- [ ] GET /migrations/{migration_id}/result

---

# 8. AI Coding Prompts

## Prompt 1: Backend Project Setup

```text
You are a senior Python backend engineer.

Create a FastAPI modular monolith project for a Hybrid Agile Task Management Platform.

Tech stack:
- FastAPI
- PostgreSQL
- SQLAlchemy 2.0
- Alembic
- Pydantic v2
- JWT authentication
- Redis

Create the following structure:
app/main.py
app/core/config.py
app/core/database.py
app/core/security.py
app/common/enums.py
app/common/exceptions.py
app/modules/auth
app/modules/workspace
app/modules/project
app/modules/board
app/modules/task

Use async SQLAlchemy.
Add Docker Compose for backend, postgres, and redis.
```

## Prompt 2: Auth Module

```text
Implement the Auth module.

Requirements:
- User model with id, email, password_hash, full_name, avatar_url, is_active, created_at, updated_at
- Register endpoint
- Login endpoint
- GET /auth/me
- JWT access token
- Password hashing
- Auth dependency get_current_user

Architecture:
- models.py
- schemas.py
- repository.py
- service.py
- router.py

Return clean FastAPI code.
```

## Prompt 3: Workspace Module

```text
Implement Workspace and WorkspaceMember modules.

Requirements:
- Workspace CRUD
- Workspace members
- Roles: OWNER, ADMIN, MANAGER, MEMBER, VIEWER
- Invite member by email
- Change role
- Remove member
- Permission helper

Endpoints:
POST /workspaces
GET /workspaces
GET /workspaces/{workspace_id}
PATCH /workspaces/{workspace_id}
DELETE /workspaces/{workspace_id}
POST /workspaces/{workspace_id}/members
GET /workspaces/{workspace_id}/members
PATCH /workspaces/{workspace_id}/members/{user_id}/role
DELETE /workspaces/{workspace_id}/members/{user_id}
```

## Prompt 4: Project, Board, Column

```text
Implement Project, Board, and BoardColumn modules.

Requirements:
- Create project inside workspace
- Generate project key
- Create default board automatically
- Default columns: Todo, In Progress, Review, Done
- Column CRUD
- Column reorder

Use repository/service/router structure.
Add permission checks.
```

## Prompt 5: Task Module

```text
Implement Task module.

Requirements:
- Task model
- Create task
- Update task
- Delete task
- Move task between columns
- Reorder task position
- Assign task
- Set priority
- Set due date
- Set story point
- Create subtask
- Generate task key like GDP-1, GDP-2

When task changes:
- create activity log
- broadcast websocket event if available
```

## Prompt 6: Comment, Label, Activity

```text
Implement Comment, Label, and ActivityLog modules.

Requirements:
- Add/edit/delete comments
- List comments by task
- Create labels
- Assign labels to tasks
- Remove labels from tasks
- Log activities for task changes
- Get task activity timeline
```

## Prompt 7: Agile Module

```text
Implement Agile module with Sprint and Epic.

Requirements:
- Create sprint
- List sprints
- Start sprint
- Complete sprint
- Add task to sprint
- Remove task from sprint
- Backlog endpoint
- Epic implemented as Task with type EPIC
- Add task to epic
- Epic progress calculation
```

## Prompt 8: Workflow Module

```text
Implement Workflow module.

Requirements:
- Create transition
- List transitions
- Delete transition
- Validate task status transition
- Apply transition
- Restrict transition by role
- Log activity
```

## Prompt 9: WebSocket and Notification

```text
Implement realtime module.

Requirements:
- WebSocket endpoint /ws/projects/{project_id}
- Project-based connection manager
- Broadcast task.created
- Broadcast task.updated
- Broadcast task.moved
- Broadcast comment.created
- Notification model and API
- Realtime notification event
```

## Prompt 10: Reports

```text
Implement Report module.

Requirements:
- Project summary
- Sprint report
- Burndown chart data
- Velocity chart data
- Workload by member
- Overdue tasks

Return JSON optimized for frontend charts.
```

## Prompt 11: Trello Integration

```text
Implement Trello Integration module.

Requirements:
- Store Trello integration token encrypted
- Fetch Trello boards
- Fetch board lists
- Fetch cards
- Fetch labels
- Fetch checklists
- Fetch comments

Create service methods:
connect_trello()
get_boards()
get_board_detail()
get_card_detail()
```

## Prompt 12: Jira Integration

```text
Implement Jira Integration module.

Requirements:
- Store Jira site URL, email, API token encrypted
- Fetch Jira projects
- Fetch Jira statuses
- Fetch Jira issue types
- Create Jira issue
- Update Jira issue
- Create Jira comment

Create service methods:
connect_jira()
get_projects()
get_project_statuses()
create_issue()
update_issue()
create_comment()
```

## Prompt 13: Trello Import

```text
Implement Trello import migration.

Flow:
1. User selects Trello board
2. Preview board data
3. Import board as internal project
4. Trello lists become board columns
5. Trello cards become tasks
6. Trello labels become labels
7. Trello checklists become subtasks
8. Trello comments become comments
9. Create sync mappings

Endpoints:
POST /migrations/trello/import/preview
POST /migrations/trello/import
GET /migrations/{migration_id}/result
```

## Prompt 14: Jira Export

```text
Implement Jira export migration.

Flow:
1. User selects internal project
2. User selects Jira project
3. User maps internal statuses to Jira statuses
4. System creates Jira issues from internal tasks
5. System creates Jira subtasks
6. System creates Jira comments
7. System creates sync mappings
8. System generates migration report
```

## Prompt 15: Sync Engine

```text
Implement Trello-Jira Sync Engine.

Requirements:
- Handle Trello webhook
- Handle Jira webhook
- Find sync mapping
- Update target platform
- Prevent duplicate events using Redis idempotency key
- Prevent infinite sync loop using correlation_id and last_source
- Log sync result
- Retry failed sync jobs

Support sync modes:
- IMPORT_ONLY
- ONE_WAY_TRELLO_TO_JIRA
- ONE_WAY_JIRA_TO_TRELLO
- BIDIRECTIONAL
```

---

# 9. 6-Week Implementation Plan

## Week 1
- Backend setup
- Auth
- Workspace
- Member role
- Frontend auth pages
- Workspace UI

## Week 2
- Project
- Board
- Column
- Task CRUD
- Drag-and-drop Kanban

## Week 3
- Comment
- Label
- Activity log
- Task detail modal
- Filtering/search

## Week 4
- Backlog
- Sprint
- Epic
- Story point
- Sprint board

## Week 5
- Workflow
- WebSocket
- Notification
- Report basics

## Week 6
- Trello integration
- Jira integration
- Trello import
- Jira export
- Basic sync mapping
- Demo polishing

---

# 10. Final Demo Script

1. Register and login
2. Create workspace
3. Invite member
4. Create project
5. Open Kanban board
6. Create tasks
7. Drag task across columns
8. Add comments and labels
9. Create sprint
10. Create epic
11. Add task to sprint
12. View reports
13. Connect Trello
14. Import Trello board
15. Connect Jira
16. Export tasks to Jira
17. Show sync mapping table
18. Show realtime board update in two browser tabs
