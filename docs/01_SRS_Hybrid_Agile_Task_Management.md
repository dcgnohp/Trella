# Software Requirement Specification (SRS)
# Hybrid Agile Task Management Platform with Trello-Jira Migration and Synchronization

## 1. Introduction

### 1.1 Purpose

This document defines the software requirements for a Hybrid Agile Task Management Platform. The system combines Trello-like simplicity with Jira-like Agile capabilities and supports data migration/synchronization between Trello and Jira.

The main goal is to help small teams start with a simple Kanban workflow and later scale to Agile/Scrum workflows without losing data when migrating to Jira.

### 1.2 Scope

The system includes:

- User authentication
- Workspace management
- Project management
- Kanban board management
- Task management
- Comment and activity history
- Agile/Scrum features
- Sprint and backlog management
- Epic and story point management
- Workflow customization
- Reporting and analytics
- Realtime collaboration
- Trello import
- Jira export
- Trello-Jira synchronization

### 1.3 Target Users

- Small software teams
- Startup teams
- Student project teams
- Project managers
- Developers
- Team leaders
- Teams currently using Trello and planning to migrate to Jira

### 1.4 Product Vision

Start simple. Scale professionally. Migrate safely.

The platform allows a team to begin with a lightweight Kanban board and gradually adopt more advanced Agile/Scrum features such as backlog, sprint, epic, story point, workflow rules, reporting, and Jira synchronization.

---

## 2. Overall Description

### 2.1 Product Perspective

This platform acts as both:

1. A standalone task management system.
2. A migration/sync bridge between Trello and Jira.

### 2.2 Product Functions

The system provides:

- Workspace and team collaboration
- Kanban board
- Drag-and-drop task movement
- Task details, comments, labels, priority, due date
- Sprint planning
- Backlog management
- Epic management
- Story point tracking
- Workflow customization
- Realtime board updates
- Trello board import
- Jira project export
- Trello-Jira mapping
- Migration report
- Sync conflict detection

### 2.3 User Classes

#### System Admin
- Manage system configuration
- Monitor integration logs
- Manage users if required

#### Workspace Owner
- Create workspace
- Manage members
- Manage workspace settings
- Connect Trello/Jira accounts

#### Project Manager
- Create project
- Configure board
- Configure workflow
- Plan sprint
- View reports
- Run migration

#### Developer / Member
- View assigned tasks
- Update task status
- Comment on tasks
- Participate in sprint

#### Viewer
- Read-only project access
- View boards and reports

---

## 3. User Stories

### 3.1 Authentication

US-001: As a user, I want to register an account so that I can use the platform.

US-002: As a user, I want to log in so that I can access my workspaces.

US-003: As a user, I want to view my profile so that I can confirm my account information.

US-004: As a user, I want to refresh my access token so that I can stay logged in securely.

### 3.2 Workspace

US-005: As a workspace owner, I want to create a workspace so that my team can collaborate.

US-006: As a workspace owner, I want to invite members so that they can join my workspace.

US-007: As a workspace owner, I want to assign roles so that each member has proper permissions.

US-008: As a member, I want to see workspaces I belong to so that I can access my projects.

### 3.3 Project

US-009: As a project manager, I want to create a project inside a workspace.

US-010: As a project manager, I want to update project information.

US-011: As a project member, I want to view project details.

US-012: As a workspace owner, I want to delete a project if it is no longer needed.

### 3.4 Board and Kanban

US-013: As a project manager, I want to create a board for a project.

US-014: As a project manager, I want default columns to be created automatically.

US-015: As a user, I want to drag tasks between columns.

US-016: As a user, I want board updates to appear in realtime.

US-017: As a project manager, I want to customize board columns.

### 3.5 Task

US-018: As a user, I want to create a task.

US-019: As a user, I want to update task title and description.

US-020: As a user, I want to assign a task to a member.

US-021: As a user, I want to set task priority.

US-022: As a user, I want to set task due date.

US-023: As a user, I want to create subtasks.

US-024: As a user, I want to add labels to a task.

US-025: As a user, I want to delete a task if permitted.

### 3.6 Comment and Activity

US-026: As a user, I want to comment on a task.

US-027: As a user, I want to view task activity history.

US-028: As a user, I want to see who changed task status.

US-029: As a user, I want to receive notifications when mentioned.

### 3.7 Agile/Scrum

US-030: As a project manager, I want to create a backlog.

US-031: As a project manager, I want to create a sprint.

US-032: As a project manager, I want to add tasks to sprint.

US-033: As a project manager, I want to start and complete sprint.

US-034: As a project manager, I want to create epics.

US-035: As a user, I want to assign tasks to epics.

US-036: As a project manager, I want to estimate tasks using story points.

### 3.8 Workflow

US-037: As a project manager, I want to define custom workflow statuses.

US-038: As a project manager, I want to define allowed transitions.

US-039: As a user, I want the system to validate status transition.

US-040: As a project manager, I want to restrict transitions by role.

### 3.9 Reports

US-041: As a project manager, I want to view project summary.

US-042: As a project manager, I want to view sprint progress.

US-043: As a project manager, I want to view burndown chart.

US-044: As a project manager, I want to view team workload.

US-045: As a project manager, I want to view overdue tasks.

### 3.10 Trello Integration

US-046: As a workspace owner, I want to connect my Trello account.

US-047: As a user, I want to fetch Trello boards.

US-048: As a user, I want to preview Trello board data before importing.

US-049: As a user, I want to import Trello cards into the platform.

US-050: As a user, I want Trello labels, checklists, comments, and due dates to be preserved.

### 3.11 Jira Integration

US-051: As a workspace owner, I want to connect my Jira account.

US-052: As a project manager, I want to select a Jira project.

US-053: As a project manager, I want to export internal tasks to Jira issues.

US-054: As a project manager, I want to map internal statuses to Jira statuses.

US-055: As a project manager, I want to see migration results.

### 3.12 Synchronization

US-056: As a project manager, I want Trello updates to sync to Jira.

US-057: As a project manager, I want Jira updates to sync to Trello.

US-058: As a project manager, I want conflicts to be detected.

US-059: As a project manager, I want to choose conflict resolution strategy.

US-060: As a project manager, I want sync logs to debug failed syncs.

---

## 4. Use Cases

### UC-001 Register Account

Actor: User

Precondition: User does not have an account.

Main Flow:
1. User enters email, password, and full name.
2. System validates input.
3. System hashes password.
4. System creates user.
5. System returns success response.

Postcondition: User account is created.

### UC-002 Create Workspace

Actor: Workspace Owner

Precondition: User is logged in.

Main Flow:
1. User clicks create workspace.
2. User enters workspace name and description.
3. System creates workspace.
4. System assigns user as OWNER.

Postcondition: Workspace exists.

### UC-003 Create Project

Actor: Project Manager

Precondition: User has proper workspace permission.

Main Flow:
1. User opens workspace.
2. User creates project.
3. System creates project key.
4. System creates default board and columns.

Postcondition: Project and board are ready.

### UC-004 Create and Move Task

Actor: Member

Precondition: Project exists.

Main Flow:
1. User creates task in Todo column.
2. User drags task to In Progress.
3. System validates move.
4. System updates task column and position.
5. System creates activity log.
6. System broadcasts realtime event.

Postcondition: Task position is updated.

### UC-005 Start Sprint

Actor: Project Manager

Precondition: Sprint exists and contains tasks.

Main Flow:
1. Manager opens sprint page.
2. Manager clicks Start Sprint.
3. System validates no other active sprint.
4. System changes sprint status to ACTIVE.
5. System logs activity.

Postcondition: Sprint is active.

### UC-006 Trello Import

Actor: Workspace Owner / Project Manager

Precondition: Trello account connected.

Main Flow:
1. User selects Trello board.
2. System fetches board lists, cards, labels, members, checklists, comments.
3. System displays migration preview.
4. User confirms import.
5. System creates internal project, board, columns, tasks.
6. System creates sync mappings.
7. System generates import report.

Postcondition: Trello data is available inside platform.

### UC-007 Trello to Jira Migration

Actor: Project Manager

Precondition: Trello and Jira accounts are connected.

Main Flow:
1. User selects Trello board.
2. User selects Jira project.
3. User maps Trello lists to Jira statuses.
4. System validates mapping.
5. User starts migration.
6. System creates Jira issues from Trello cards.
7. System creates mapping records.
8. System returns migration report.

Postcondition: Trello data is migrated to Jira.

### UC-008 Bidirectional Sync

Actor: System

Precondition: Sync mapping exists.

Main Flow:
1. Trello or Jira sends webhook.
2. System receives event.
3. System checks sync mapping.
4. System checks whether event is duplicated.
5. System updates target platform.
6. System stores sync log.

Postcondition: Source and target data are synchronized.

---

## 5. Functional Requirements

### 5.1 Authentication

FR-001: System shall allow user registration.

FR-002: System shall allow user login.

FR-003: System shall generate JWT access token.

FR-004: System shall validate authenticated requests.

FR-005: System shall store hashed passwords only.

### 5.2 Workspace

FR-006: System shall allow creating workspace.

FR-007: System shall allow updating workspace.

FR-008: System shall allow inviting members.

FR-009: System shall allow removing members.

FR-010: System shall support member roles.

### 5.3 Project

FR-011: System shall allow creating projects.

FR-012: System shall generate unique project key.

FR-013: System shall allow listing projects by workspace.

FR-014: System shall allow updating projects.

FR-015: System shall allow deleting projects.

### 5.4 Board

FR-016: System shall create default Kanban columns.

FR-017: System shall allow custom columns.

FR-018: System shall allow reordering columns.

FR-019: System shall allow listing tasks by board.

FR-020: System shall support drag-and-drop task movement.

### 5.5 Task

FR-021: System shall allow creating tasks.

FR-022: System shall allow updating tasks.

FR-023: System shall allow deleting tasks.

FR-024: System shall allow assigning tasks.

FR-025: System shall support task priority.

FR-026: System shall support task due date.

FR-027: System shall support story points.

FR-028: System shall support subtasks.

FR-029: System shall support labels.

### 5.6 Comment

FR-030: System shall allow adding comments.

FR-031: System shall allow editing comments.

FR-032: System shall allow deleting comments.

FR-033: System shall list comments by task.

### 5.7 Activity Log

FR-034: System shall log task creation.

FR-035: System shall log task update.

FR-036: System shall log task movement.

FR-037: System shall log assignment change.

FR-038: System shall log sprint changes.

### 5.8 Agile

FR-039: System shall support backlog.

FR-040: System shall support sprint creation.

FR-041: System shall support sprint start.

FR-042: System shall support sprint completion.

FR-043: System shall support epic creation.

FR-044: System shall support task-epic relationship.

FR-045: System shall calculate epic progress.

### 5.9 Workflow

FR-046: System shall support workflow status.

FR-047: System shall support transition rules.

FR-048: System shall validate status transition.

FR-049: System shall restrict transitions by role.

### 5.10 Report

FR-050: System shall provide project summary.

FR-051: System shall provide sprint report.

FR-052: System shall provide burndown data.

FR-053: System shall provide workload data.

FR-054: System shall provide overdue tasks.

### 5.11 Realtime

FR-055: System shall provide WebSocket connection per project.

FR-056: System shall broadcast task changes.

FR-057: System shall broadcast comment changes.

FR-058: System shall broadcast notification events.

### 5.12 Trello Integration

FR-059: System shall allow connecting Trello account.

FR-060: System shall fetch Trello boards.

FR-061: System shall fetch Trello lists.

FR-062: System shall fetch Trello cards.

FR-063: System shall fetch Trello labels.

FR-064: System shall fetch Trello checklists.

FR-065: System shall fetch Trello comments.

FR-066: System shall import Trello board into internal project.

### 5.13 Jira Integration

FR-067: System shall allow connecting Jira account.

FR-068: System shall fetch Jira projects.

FR-069: System shall fetch Jira issue types.

FR-070: System shall fetch Jira statuses.

FR-071: System shall create Jira issues.

FR-072: System shall create Jira comments.

FR-073: System shall update Jira issues.

### 5.14 Migration and Sync

FR-074: System shall store mapping between Trello cards, internal tasks, and Jira issues.

FR-075: System shall support Trello to internal import.

FR-076: System shall support internal to Jira export.

FR-077: System shall support Trello to Jira migration.

FR-078: System shall generate migration report.

FR-079: System shall support conflict detection.

FR-080: System shall support retry for failed sync jobs.

---

## 6. Non-functional Requirements

### 6.1 Security

NFR-001: Passwords must be hashed using a secure hashing algorithm.

NFR-002: API endpoints must require authentication unless public.

NFR-003: Role-based authorization must be enforced.

NFR-004: External OAuth/API tokens must be encrypted at rest.

NFR-005: Webhook signatures should be verified where supported.

### 6.2 Performance

NFR-006: Board loading should complete within 2 seconds for normal projects.

NFR-007: Task movement should respond within 500ms excluding external sync.

NFR-008: WebSocket broadcast should be near realtime.

NFR-009: Migration should be processed asynchronously for large boards.

### 6.3 Scalability

NFR-010: System should support multiple workspaces.

NFR-011: System should support projects with thousands of tasks.

NFR-012: Background jobs should process integration sync independently.

### 6.4 Reliability

NFR-013: Failed sync jobs should be retried.

NFR-014: Migration should be resumable or at least report partial failure.

NFR-015: Duplicate webhook events must not create duplicate tasks.

### 6.5 Usability

NFR-016: Small teams should be able to use the system without enabling Agile features.

NFR-017: Migration preview must be understandable.

NFR-018: Errors should be displayed clearly.

### 6.6 Maintainability

NFR-019: Backend should follow modular monolith structure.

NFR-020: Each module should have router, service, repository, schema, and model.

NFR-021: API documentation should be available via OpenAPI.

### 6.7 Compatibility

NFR-022: Frontend should work on modern browsers.

NFR-023: System should support Docker-based local deployment.

---

## 7. Acceptance Criteria

AC-001: User can register and login.

AC-002: User can create workspace and project.

AC-003: User can create Kanban board with columns.

AC-004: User can create and move tasks.

AC-005: System records task activity logs.

AC-006: User can create sprint and assign tasks to sprint.

AC-007: User can create epic and link tasks.

AC-008: User can view reports.

AC-009: User can connect Trello and import board.

AC-010: User can connect Jira and export tasks.

AC-011: System can map Trello cards to Jira issues.

AC-012: System can show migration report.

AC-013: System can handle duplicate sync events safely.

AC-014: Realtime board updates work across two browser tabs.

---

## 8. Out of Scope for MVP

- Mobile application
- Payment system
- Full enterprise Jira permission clone
- Advanced AI sprint planning
- Full file attachment storage
- Slack integration
- Microsoft Teams integration
- GitHub integration

---

## 9. MVP Definition

The MVP is complete when the system supports:

1. Auth
2. Workspace
3. Project
4. Kanban board
5. Task drag-and-drop
6. Comments
7. Activity logs
8. Sprint
9. Epic
10. Report summary
11. Trello import
12. Jira export
13. Basic Trello-Jira mapping
