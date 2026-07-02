"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import TaskIcon from "@atlaskit/icon/core/task";
import BugIcon from "@atlaskit/icon/core/bug";
import StoryIcon from "@atlaskit/icon/core/story";
import SubtasksIcon from "@atlaskit/icon/core/subtasks";
import ChevronDownIcon from "@atlaskit/icon/core/chevron-down";
import CrossIcon from "@atlaskit/icon/core/cross";
import AddIcon from "@atlaskit/icon/core/add";
import ShowMoreHorizontalIcon from "@atlaskit/icon/core/show-more-horizontal";
import PersonAvatarIcon from "@atlaskit/icon/core/person-avatar";
import EditIcon from "@atlaskit/icon/core/edit";
import InformationCircleIcon from "@atlaskit/icon/core/information-circle";
import ArrowLeftIcon from "@atlaskit/icon/core/arrow-left";

import type { TaskPublic, ProjectMemberPublic, ColumnPublic, SprintPublic } from "@/lib/client";
import { TasksService, CustomStatusesService, ColumnsService, VelocityConfigService, SprintsService } from "@/lib/client";
import CreatableSelect from "@atlaskit/select/creatable-select";
import { useTaskRealtime } from "@/lib/realtime/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";

import { CommentsTab } from "../modals/task-detail-modal/comments-tab";
import { AttachmentsTab } from "../modals/task-detail-modal/attachments-tab";
import { ActivityTab } from "../modals/task-detail-modal/activity-tab";
import { DescriptionEditor } from "./description-editor";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface TaskDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  task: TaskPublic | null;
  actorNames?: Record<string, string>;
  workspaceId?: string;
  projectMembers?: ProjectMemberPublic[];
  columns?: ColumnPublic[];
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#FF5630",
  HIGH: "#FF991F",
  MEDIUM: "#0052CC",
  LOW: "#97A0AF",
};

const CANONICAL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#FFAB001A", text: "#FFAB00" },
  TODO: { bg: "#DFE1E6", text: "#172B4D" },
  IN_PROGRESS: { bg: "#0052CC1A", text: "#0052CC" },
  DONE: { bg: "#36B37E1A", text: "#36B37E" },
};

const WORK_TYPES = ["TASK", "BUG", "STORY", "SUBTASK"] as const;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const TABS = ["Comments", "Attachments", "Activity"] as const;

function getStatusStyle(cs: TaskPublic["customStatus"]): { bg: string; text: string } {
  if (!cs) return { bg: "#DFE1E6", text: "#172B4D" };
  const canonical = cs.canonicalStatus ?? "";
  if (CANONICAL_STATUS_COLORS[canonical]) return CANONICAL_STATUS_COLORS[canonical];
  const color = cs.color ?? "#DFE1E6";
  return { bg: color + "1A", text: color };
}

function getTypeIcon(type: string | null | undefined) {
  switch (type) {
    case "BUG": return <BugIcon label="Bug" size="small" />;
    case "STORY": return <StoryIcon label="Story" size="small" />;
    case "SUBTASK": return <SubtasksIcon label="Subtask" size="small" />;
    default: return <TaskIcon label="Task" size="small" />;
  }
}

function getTypeColor(type: string | null | undefined): string {
  switch (type) {
    case "BUG": return "#FF5630";
    case "STORY": return "#64BA3B";
    case "SUBTASK": return "#7A869A";
    default: return "#0052CC";
  }
}

// ---------------------------------------------------------------------------
// IconButton helper
// ---------------------------------------------------------------------------

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28,
        height: 28,
        border: "1px solid #DFE1E6",
        borderRadius: 4,
        background: hov ? "rgba(9,30,66,0.06)" : "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#5E6C84",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// TooltipInfo
// ---------------------------------------------------------------------------

function TooltipInfo({ text }: { text: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ cursor: "default", color: "#97A0AF", display: "inline-flex", alignItems: "center", marginLeft: 3 }}
      >
        <InformationCircleIcon label="" size="small" />
      </span>
      {show && (
        <span style={{
          position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)",
          marginLeft: 6, zIndex: 500, background: "#172B4D", color: "#FFFFFF",
          fontSize: 11, padding: "5px 8px", borderRadius: 4,
          width: 200, lineHeight: 1.4, pointerEvents: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DetailRow
// ---------------------------------------------------------------------------

function DetailRow({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, paddingBottom: 10 }}>
      <span style={{ fontSize: 12, color: "#5E6C84", paddingTop: 2, display: "flex", alignItems: "center" }}>
        {label}
        {tooltip && <TooltipInfo text={tooltip} />}
      </span>
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusDropdown
// ---------------------------------------------------------------------------

interface StatusDropdownProps {
  task: TaskPublic;
  workspaceId?: string;
  onClose: () => void;
  columns?: ColumnPublic[];
  onTaskUpdated?: (t: TaskPublic) => void;
}

function StatusDropdown({ task, workspaceId, onClose, columns = [], onTaskUpdated }: StatusDropdownProps) {
  const qc = useQueryClient();

  const { data: statuses = [] } = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId ?? ""),
    queryFn: () =>
      CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({
        workspaceId: workspaceId!,
      }),
    enabled: !!workspaceId,
  });

  // Filter to only statuses tied to board columns
  const columnStatusKeys = new Set(columns.map((c) => c.statusKey.toUpperCase()));
  const filteredStatuses = columnStatusKeys.size > 0
    ? statuses.filter((s) => s.canonicalStatus && columnStatusKeys.has(s.canonicalStatus.toUpperCase()))
    : statuses;

  const mutation = useMutation({
    mutationFn: (customStatusId: string) =>
      TasksService.Tasks_tasksUpdateTask({
        taskId: task.id,
        requestBody: { customStatusId },
      }),
    onSuccess: (data) => {
      onTaskUpdated?.(data);
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.boardColumns(task.boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.board(task.boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      toast.success("Status updated");
      onClose();
    },
    onError: () => toast.error("Failed to update status"),
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 4,
        zIndex: 400,
        backgroundColor: "#FFFFFF",
        border: "1px solid #DFE1E6",
        borderRadius: 6,
        boxShadow: "0 4px 24px rgba(9,30,66,0.18)",
        minWidth: 200,
        overflow: "hidden",
      }}
    >
      {filteredStatuses.map((s) => {
        const style = getStatusStyle(s);
        return (
          <button
            key={s.id}
            onClick={() => mutation.mutate(s.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "7px 12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              color: "#172B4D",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: style.text,
                flexShrink: 0,
              }}
            />
            {s.name}
          </button>
        );
      })}
      <div style={{ height: 1, backgroundColor: "#DFE1E6", margin: "4px 0" }} />
      {(["Create status", "Edit status", "View workflow"] as const).map((label) => (
        <button
          key={label}
          onClick={() => { toast.info("Coming soon"); onClose(); }}
          style={{
            display: "flex",
            width: "100%",
            padding: "7px 12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#5E6C84",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeftPanel
// ---------------------------------------------------------------------------

interface LeftPanelProps {
  task: TaskPublic;
  open: boolean;
  actorNames?: Record<string, string>;
  onSubtaskClick?: (sub: TaskPublic) => void;
  onTaskUpdated?: (t: TaskPublic) => void;
}

function LeftPanel({ task, open, actorNames, onSubtaskClick, onTaskUpdated }: LeftPanelProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = React.useState(0);

  // Title inline edit
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleVal, setTitleVal] = React.useState(task.title);
  React.useEffect(() => { setTitleVal(task.title); }, [task.title]);

  // Description — handled by DescriptionEditor component

  // Work type dropdown
  const [typeDropOpen, setTypeDropOpen] = React.useState(false);
  const typeDropRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!typeDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (typeDropRef.current && !typeDropRef.current.contains(e.target as Node)) {
        setTypeDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeDropOpen]);

  const patchMutation = useMutation({
    mutationFn: (patch: { title?: string; description?: string | null; type?: string; storyPoint?: number | null }) =>
      TasksService.Tasks_tasksUpdateTask({ taskId: task.id, requestBody: patch }),
    onSuccess: (data) => {
      onTaskUpdated?.(data);
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      toast.success("Updated");
    },
    onError: () => toast.error("Failed"),
  });

  function commitTitle() {
    setEditingTitle(false);
    const trimmed = titleVal.trim();
    if (trimmed && trimmed !== task.title) patchMutation.mutate({ title: trimmed });
  }

  const typeColor = getTypeColor(task.type);

  return (
    <div style={{ flex: "1 1 60%", overflowY: "auto", padding: "24px 28px", borderRight: "1px solid #DFE1E6" }}>
      {/* Title */}
      {editingTitle ? (
        <textarea
          autoFocus
          value={titleVal}
          onChange={(e) => setTitleVal(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitTitle(); } if (e.key === "Escape") { setTitleVal(task.title); setEditingTitle(false); } }}
          rows={2}
          style={{
            width: "100%",
            fontSize: 22,
            fontWeight: 600,
            color: "#172B4D",
            border: "1px solid #0052CC",
            borderRadius: 4,
            padding: "4px 8px",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.4,
            boxSizing: "border-box",
          }}
        />
      ) : (
        <h2
          onClick={() => setEditingTitle(true)}
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#172B4D",
            margin: "0 0 8px",
            lineHeight: 1.4,
            cursor: "text",
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.border = "1px solid #DFE1E6")}
          onMouseLeave={(e) => (e.currentTarget.style.border = "1px solid transparent")}
        >
          {task.title}
        </h2>
      )}

      {/* Work type row */}
      <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }} ref={typeDropRef}>
        <button
          onClick={() => setTypeDropOpen((p) => !p)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "1px solid #DFE1E6",
            borderRadius: 4,
            cursor: "pointer",
            padding: "3px 8px",
            fontSize: 12,
            color: typeColor,
          }}
        >
          <span style={{ color: typeColor }}>{getTypeIcon(task.type)}</span>
          {task.type ?? "TASK"}
          <span style={{ color: "#5E6C84" }}><ChevronDownIcon label="" size="small" /></span>
        </button>
        {typeDropOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              zIndex: 400,
              backgroundColor: "#FFFFFF",
              border: "1px solid #DFE1E6",
              borderRadius: 6,
              boxShadow: "0 4px 24px rgba(9,30,66,0.18)",
              minWidth: 140,
              overflow: "hidden",
            }}
          >
            {WORK_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => {
                  patchMutation.mutate({ type: t });
                  setTypeDropOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 12px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: getTypeColor(t),
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {getTypeIcon(t)}
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <IconBtn title="Add subtask"><AddIcon label="Add subtask" size="small" /></IconBtn>
        <IconBtn title="More actions" onClick={() => toast.info("Coming soon")}>
          <ShowMoreHorizontalIcon label="More" size="small" />
        </IconBtn>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 24 }}>
        <DescriptionEditor
          value={task.description}
          onSave={(html) => patchMutation.mutate({ description: html })}
          disabled={patchMutation.isPending}
        />
      </div>

      {/* Subtasks */}
      <div style={{ marginBottom: 24 }}>
        <SubtasksSection task={task} open={open} onSubtaskClick={onSubtaskClick} />
      </div>

      {/* Linked work items */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#172B4D" }}>Linked work items</p>
        <button
          onClick={() => toast.info("Coming soon")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#5E6C84", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#172B4D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#5E6C84")}
        >
          <AddIcon label="" size="small" />
          Add linked work item
        </button>
      </div>

      {/* Activity tabs */}
      <div>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#172B4D" }}>Activity</p>
        <div style={{ display: "flex", borderBottom: "1px solid #DFE1E6", marginBottom: 16, gap: 4 }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 12px",
                fontSize: 13,
                color: activeTab === i ? "#0052CC" : "#5E6C84",
                fontWeight: activeTab === i ? 600 : 400,
                borderBottom: activeTab === i ? "2px solid #0052CC" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeTab === 0 && <CommentsTab taskId={task.id} projectId={task.projectId} />}
        {activeTab === 1 && <AttachmentsTab taskId={task.id} />}
        {activeTab === 2 && <ActivityTab taskId={task.id} active={activeTab === 2} actorNames={actorNames} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RightPanel
// ---------------------------------------------------------------------------

interface RightPanelProps {
  task: TaskPublic;
  projectMembers?: ProjectMemberPublic[];
  workspaceId?: string;
  onTaskUpdated?: (t: TaskPublic) => void;
}

function RightPanel({ task, projectMembers = [], workspaceId, onTaskUpdated }: RightPanelProps) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Velocity config query
  const { data: velocityConfig } = useQuery({
    queryKey: ['velocity-config', workspaceId],
    queryFn: () => VelocityConfigService.VelocityConfig_velocityConfigGetVelocityConfig({ workspaceId: workspaceId! }),
    enabled: !!workspaceId,
  });
  const hoursPerPoint = velocityConfig?.hoursPerPoint ?? 4.0;

  // Sprint query — fetch name + list for dropdown
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', task.projectId],
    queryFn: () => SprintsService.Sprints_sprintsListSprints({ projectId: task.projectId }),
    enabled: !!task.projectId,
  });
  const currentSprint = sprints.find((s) => s.id === task.sprintId) ?? null;
  const [sprintDrop, setSprintDrop] = React.useState(false);
  const sprintRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!sprintDrop) return;
    const handler = (e: MouseEvent) => {
      if (sprintRef.current && !sprintRef.current.contains(e.target as Node)) setSprintDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sprintDrop]);

  // Assignee dropdown
  const [assigneeDrop, setAssigneeDrop] = React.useState(false);
  const assigneeRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!assigneeDrop) return;
    const handler = (e: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) setAssigneeDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assigneeDrop]);

  // Priority dropdown
  const [priDrop, setPriDrop] = React.useState(false);
  const priRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!priDrop) return;
    const handler = (e: MouseEvent) => {
      if (priRef.current && !priRef.current.contains(e.target as Node)) setPriDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [priDrop]);

  // Story points — Fibonacci only (validated)
  const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
  const fibOptions = FIBONACCI.map((n) => ({ label: String(n), value: n }));

  // Due date inline edit
  const [editingDueDate, setEditingDueDate] = React.useState(false);

  const patchMutation = useMutation({
    mutationFn: (patch: { priority?: string; storyPoint?: number | null; dueDate?: string | null; sprintId?: string | null }) =>
      TasksService.Tasks_tasksUpdateTask({ taskId: task.id, requestBody: patch }),
    onSuccess: (data) => {
      onTaskUpdated?.(data);
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      toast.success("Updated");
    },
    onError: () => toast.error("Failed"),
  });

  const setAssigneeMutation = useMutation({
    mutationFn: (assigneeId: string) =>
      TasksService.Tasks_tasksSetAssignee({ taskId: task.id, requestBody: { assigneeId } }),
    onSuccess: (data) => {
      onTaskUpdated?.(data);
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      qc.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      toast.success("Assignee updated");
      setAssigneeDrop(false);
    },
    onError: () => toast.error("Failed"),
  });

  const unsetAssigneeMutation = useMutation({
    mutationFn: () => TasksService.Tasks_tasksUnsetAssignee({ taskId: task.id }),
    onSuccess: (data) => {
      onTaskUpdated?.(data);
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      toast.success("Assignee removed");
      setAssigneeDrop(false);
    },
    onError: () => toast.error("Failed"),
  });

  const assignee = task.assigneeId
    ? (projectMembers.find((m) => m.userId === task.assigneeId) ?? null)
    : null;
  const assigneeName = assignee?.fullName ?? assignee?.email ?? "Unassigned";
  const priColor = PRIORITY_COLORS[task.priority ?? ""] ?? "#97A0AF";

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const reporterName = user?.fullName ?? user?.email ?? "You";
  const reporterInitials = initials(reporterName);

  return (
    <div style={{ flex: "0 0 280px", overflowY: "auto", padding: 20, backgroundColor: "#F4F5F7" }}>
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#7A869A", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Details
      </p>

      {/* Assignee */}
      <DetailRow label="Assignee" tooltip="Team member responsible for completing this task">
        <div style={{ position: "relative" }} ref={assigneeRef}>
          <div
            onClick={() => setAssigneeDrop((p) => !p)}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            {task.assigneeId && assignee ? (
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#0052CC,#6554C0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white", flexShrink: 0 }}>
                {initials(assigneeName)}
              </div>
            ) : (
              <div style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "#DFE1E6", display: "flex", alignItems: "center", justifyContent: "center", color: "#7A869A", flexShrink: 0 }}>
                <PersonAvatarIcon label="" size="small" />
              </div>
            )}
            <span style={{ fontSize: 13, color: "#172B4D" }}>{assigneeName}</span>
          </div>
          {!task.assigneeId && (
            <button
              onClick={() => user && setAssigneeMutation.mutate(user.id)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: "#0052CC", marginTop: 4, display: "block" }}
            >
              Assign to me
            </button>
          )}
          {assigneeDrop && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 400, backgroundColor: "#FFFFFF", border: "1px solid #DFE1E6", borderRadius: 6, boxShadow: "0 4px 24px rgba(9,30,66,0.18)", minWidth: 200, overflow: "hidden" }}>
              {projectMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAssigneeMutation.mutate(m.userId)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#172B4D", textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg,#0052CC,#6554C0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "white", flexShrink: 0 }}>
                    {initials(m.fullName ?? m.email)}
                  </div>
                  {m.fullName ?? m.email}
                </button>
              ))}
              {task.assigneeId && (
                <>
                  <div style={{ height: 1, backgroundColor: "#DFE1E6", margin: "4px 0" }} />
                  <button
                    onClick={() => unsetAssigneeMutation.mutate()}
                    style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#FF5630", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    Remove assignee
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </DetailRow>

      {/* Priority */}
      <DetailRow label="Priority" tooltip="Urgency level affecting task ordering">
        <div style={{ position: "relative" }} ref={priRef}>
          <span
            onClick={() => setPriDrop((p) => !p)}
            style={{ fontSize: 12, fontWeight: 600, color: priColor, backgroundColor: priColor + "1A", padding: "2px 8px", borderRadius: 3, cursor: "pointer", display: "inline-block" }}
          >
            {task.priority ?? "None"}
          </span>
          {priDrop && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 400, backgroundColor: "#FFFFFF", border: "1px solid #DFE1E6", borderRadius: 6, boxShadow: "0 4px 24px rgba(9,30,66,0.18)", minWidth: 140, overflow: "hidden" }}>
              {PRIORITIES.map((p) => {
                const pc = PRIORITY_COLORS[p];
                return (
                  <button
                    key={p}
                    onClick={() => { patchMutation.mutate({ priority: p }); setPriDrop(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#172B4D", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: pc, flexShrink: 0 }} />
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DetailRow>

      <DetailRow label="Parent" tooltip="Parent task this subtask belongs to">
        <span style={{ fontSize: 13, color: "#97A0AF" }}>{task.parentId ? task.parentId.slice(0, 8) : "None"}</span>
      </DetailRow>

      <DetailRow label="Due date" tooltip="Target completion date, auto-calculated from story points">
        {editingDueDate ? (
          <input
            type="date"
            autoFocus
            defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onBlur={e => { patchMutation.mutate({ dueDate: e.target.value || null }); setEditingDueDate(false); }}
            onKeyDown={e => { if (e.key === "Escape") setEditingDueDate(false); }}
            style={{ fontSize: 13, border: "1px solid #0052CC", borderRadius: 4, padding: "2px 6px", outline: "none" }}
          />
        ) : (
          <span onClick={() => setEditingDueDate(true)} style={{ fontSize: 13, color: task.dueDate ? "#172B4D" : "#97A0AF", cursor: "pointer" }}>
            {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None"}
          </span>
        )}
      </DetailRow>

      <DetailRow label="Labels" tooltip="Tags for categorizing this task"><span style={{ fontSize: 13, color: "#97A0AF" }}>None</span></DetailRow>
      <DetailRow label="Team" tooltip="Team responsible for this task"><span style={{ fontSize: 13, color: "#97A0AF" }}>None</span></DetailRow>
      <DetailRow label="Start date" tooltip="Date this task was created and work can begin">
        <span style={{ fontSize: 13, color: "#172B4D" }}>
          {new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </DetailRow>
      <DetailRow label="Sprint" tooltip="Sprint this task is assigned to">
        <div style={{ position: "relative" }} ref={sprintRef}>
          <span
            onClick={() => setSprintDrop((p) => !p)}
            style={{ fontSize: 13, color: currentSprint ? "#172B4D" : "#97A0AF", cursor: "pointer" }}
          >
            {currentSprint ? currentSprint.name : "None"}
          </span>
          {sprintDrop && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 400, backgroundColor: "#FFFFFF", border: "1px solid #DFE1E6", borderRadius: 6, boxShadow: "0 4px 24px rgba(9,30,66,0.18)", minWidth: 180, overflow: "hidden" }}>
              <button
                onClick={() => { patchMutation.mutate({ sprintId: null }); setSprintDrop(false); }}
                style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#97A0AF", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                None
              </button>
              {sprints.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { patchMutation.mutate({ sprintId: s.id }); setSprintDrop(false); }}
                  style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#172B4D", textAlign: "left", fontWeight: s.id === task.sprintId ? 700 : 400 }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </DetailRow>

      <DetailRow label="Story points" tooltip="Effort estimate — only Fibonacci values allowed (1,2,3,5,8,13,21)">
        <CreatableSelect<{ label: string; value: number }, false>
          isClearable
          placeholder="None"
          options={fibOptions}
          value={task.storyPoint != null ? { label: String(task.storyPoint), value: task.storyPoint } : null}
          isValidNewOption={(input) => {
            const n = parseInt(input, 10);
            return FIBONACCI.includes(n);
          }}
          getNewOptionData={(input) => ({ label: input, value: parseInt(input, 10) })}
          onChange={(opt) => {
            const n = opt ? opt.value : null;
            if (n !== task.storyPoint) patchMutation.mutate({ storyPoint: n });
          }}
          styles={{
            control: (base) => ({ ...base, minHeight: 28, fontSize: 13, border: "1px solid #DFE1E6", boxShadow: "none", cursor: "pointer" }),
            valueContainer: (base) => ({ ...base, padding: "0 6px" }),
            indicatorsContainer: (base) => ({ ...base, height: 28 }),
            menu: (base) => ({ ...base, fontSize: 13, zIndex: 500 }),
          }}
        />
        {task.storyPoint != null && (
          <span style={{ fontSize: 11, color: "#5E6C84", marginTop: 4, display: "block" }}>
            {(task.storyPoint * hoursPerPoint / 8) < 1
              ? `${(task.storyPoint * hoursPerPoint).toFixed(1)}h`
              : `${(task.storyPoint * hoursPerPoint / 8).toFixed(1)} days`}
          </span>
        )}
      </DetailRow>

      <DetailRow label="Reporter" tooltip="Person who created this task">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#0052CC,#6554C0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>
            {reporterInitials}
          </div>
          <span style={{ fontSize: 13, color: "#172B4D" }}>{reporterName}</span>
        </div>
      </DetailRow>

      <div style={{ borderTop: "1px solid #DFE1E6", paddingTop: 12, marginTop: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#97A0AF" }}>
          Created {new Date(task.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubtasksSection
// ---------------------------------------------------------------------------

interface SubtasksSectionProps {
  task: TaskPublic;
  open: boolean;
  onSubtaskClick?: (sub: TaskPublic) => void;
}

function SubtasksSection({ task, open, onSubtaskClick }: SubtasksSectionProps) {
  const qc = useQueryClient();
  const [addingSubtask, setAddingSubtask] = React.useState(false);
  const [subtaskTitle, setSubtaskTitle] = React.useState("");

  const { data: subtasks = [] } = useQuery({
    queryKey: ["task-subtasks", task.id],
    queryFn: () => TasksService.Tasks_tasksListSubtasks({ taskId: task.id }),
    enabled: open && !!task.id,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      ColumnsService.Columns_columnsCreateTask({
        boardId: task.boardId,
        columnId: task.columnId,
        requestBody: { title, type: "SUBTASK", parentId: task.id },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      qc.invalidateQueries({ queryKey: ["task-subtasks", task.id] });
      setSubtaskTitle("");
      setAddingSubtask(false);
      toast.success("Subtask created");
    },
    onError: () => toast.error("Failed to create subtask"),
  });

  const done = subtasks.filter(
    (s) => s.customStatus?.canonicalStatus === "DONE"
  ).length;
  const total = subtasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function handleSubtaskSubmit() {
    const trimmed = subtaskTitle.trim();
    if (trimmed) createMutation.mutate(trimmed);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#172B4D" }}>Subtasks</span>
        {total > 0 && (
          <span style={{ fontSize: 12, color: "#5E6C84" }}>{pct}% Done</span>
        )}
      </div>
      {total > 0 && (
        <div style={{ height: 4, backgroundColor: "#DFE1E6", borderRadius: 2, marginBottom: 10 }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              backgroundColor: "#36B37E",
              borderRadius: 2,
              transition: "width 0.3s",
            }}
          />
        </div>
      )}
      {subtasks.length > 0 && (
        <div style={{ border: "1px solid #DFE1E6", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 100px",
              padding: "4px 10px",
              backgroundColor: "#F4F5F7",
              borderBottom: "1px solid #DFE1E6",
            }}
          >
            {["Work", "Priority", "Assignee", "Status"].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "#5E6C84", textTransform: "uppercase" }}>
                {h}
              </span>
            ))}
          </div>
          {subtasks.map((sub) => {
            const priColor = PRIORITY_COLORS[sub.priority ?? ""] ?? "#97A0AF";
            const stStyle = getStatusStyle(sub.customStatus);
            return (
              <div
                key={sub.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px 100px",
                  padding: "6px 10px",
                  borderBottom: "1px solid #F4F5F7",
                  alignItems: "center",
                  cursor: onSubtaskClick ? "pointer" : "default",
                }}
                onClick={() => onSubtaskClick?.(sub)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F8F9FA")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ color: getTypeColor(sub.type), flexShrink: 0 }}>
                    <SubtasksIcon label="" size="small" />
                  </span>
                  <span style={{ fontSize: 13, color: "#172B4D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sub.title}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: priColor,
                    backgroundColor: priColor + "1A",
                    padding: "2px 6px",
                    borderRadius: 3,
                    display: "inline-block",
                  }}
                >
                  {sub.priority ?? "—"}
                </span>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      backgroundColor: "#DFE1E6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#7A869A",
                    }}
                  >
                    <PersonAvatarIcon label="" size="small" />
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: stStyle.text,
                    backgroundColor: stStyle.bg,
                    padding: "2px 6px",
                    borderRadius: 3,
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 90,
                  }}
                >
                  {sub.customStatus?.name ?? "No status"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {addingSubtask ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            autoFocus
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubtaskSubmit();
              if (e.key === "Escape") { setAddingSubtask(false); setSubtaskTitle(""); }
            }}
            placeholder="Subtask title"
            style={{
              flex: 1,
              padding: "5px 8px",
              fontSize: 13,
              border: "1px solid #0052CC",
              borderRadius: 4,
              outline: "none",
              color: "#172B4D",
            }}
          />
          <button
            onClick={handleSubtaskSubmit}
            disabled={createMutation.isPending}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              backgroundColor: "#0052CC",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Add
          </button>
          <button
            onClick={() => { setAddingSubtask(false); setSubtaskTitle(""); }}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              backgroundColor: "transparent",
              color: "#5E6C84",
              border: "1px solid #DFE1E6",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingSubtask(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#5E6C84",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#172B4D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#5E6C84")}
        >
          <AddIcon label="" size="small" />
          Add subtask
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskDetailDrawer — root export
// ---------------------------------------------------------------------------

export function TaskDetailDrawer({
  open,
  onClose,
  task,
  actorNames,
  workspaceId,
  projectMembers = [],
  columns = [],
}: TaskDetailDrawerProps) {
  const [statusDropOpen, setStatusDropOpen] = React.useState(false);
  const statusDropRef = React.useRef<HTMLDivElement>(null);

  // Fetch parent task for the subtask banner
  const { data: parentTask } = useQuery({
    queryKey: ['task', task?.parentId],
    queryFn: () => TasksService.Tasks_tasksGetTask({ taskId: task!.parentId! }),
    enabled: open && !!task?.parentId,
  });

  // Navigation stack for drilling into subtasks
  const [taskStack, setTaskStack] = React.useState<TaskPublic[]>([]);
  // Reset stack on task ID change (new task opened)
  React.useEffect(() => { if (task) setTaskStack([task]); }, [task?.id]);
  // Sync root task only when the incoming prop is actually newer (by updatedAt).
  // This prevents a stale boardTasks refetch from overwriting a just-patched task.
  React.useEffect(() => {
    if (!task) return;
    setTaskStack(prev => {
      if (prev.length === 0) return [task];
      const current = prev[0];
      // Only overwrite if the incoming task is newer or same (no onTaskUpdated was called yet)
      const incomingNewer = new Date(task.updatedAt) >= new Date(current.updatedAt);
      if (!incomingNewer) return prev;
      return [task, ...prev.slice(1)];
    });
  }, [task]);
  const displayTask = taskStack[taskStack.length - 1] ?? task;

  useTaskRealtime({
    taskId: open ? (task?.id ?? null) : null,
    projectId: open ? (task?.projectId ?? null) : null,
  });

  // Close status dropdown on outside click
  React.useEffect(() => {
    if (!statusDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusDropRef.current && !statusDropRef.current.contains(e.target as Node)) {
        setStatusDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusDropOpen]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const statusStyle = getStatusStyle(displayTask?.customStatus);
  const priColor = PRIORITY_COLORS[displayTask?.priority ?? ""] ?? "#97A0AF";
  const taskType = displayTask?.type ?? "TASK";
  const taskId = (displayTask as (TaskPublic & { issueKey?: string }) | null)?.issueKey ?? displayTask?.id?.slice(0, 8) ?? "";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        backgroundColor: "rgba(9,30,66,0.54)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 48,
        paddingBottom: 48,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "90vw",
          maxWidth: 1100,
          minWidth: 680,
          backgroundColor: "#FFFFFF",
          borderRadius: 8,
          boxShadow: "0 8px 64px rgba(9,30,66,0.25)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 96px)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: "1px solid #DFE1E6",
            flexShrink: 0,
            gap: 8,
          }}
        >
          {/* Back button when drilling into subtask */}
          {taskStack.length > 1 && (
            <button
              onClick={() => setTaskStack(prev => prev.slice(0, -1))}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px solid #DFE1E6", borderRadius: 4, cursor: "pointer", padding: "3px 8px", fontSize: 12, color: "#5E6C84" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(9,30,66,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <ArrowLeftIcon label="" size="small" />
              {taskStack[taskStack.length - 2]?.title?.slice(0, 30)}
            </button>
          )}

          {/* Breadcrumb */}
          <span style={{ fontSize: 12, color: "#97A0AF", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Add epic
          </span>
          <span style={{ color: "#DFE1E6" }}>/</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: getTypeColor(taskType) }}>{getTypeIcon(taskType)}</span>
            <span style={{ fontSize: 12, color: "#5E6C84", fontWeight: 500 }}>{taskId}</span>
          </span>

          <div style={{ flex: 1 }} />

          {/* Status dropdown trigger */}
          {displayTask && (
            <div style={{ position: "relative" }} ref={statusDropRef}>
              <button
                onClick={() => setStatusDropOpen((p) => !p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 3,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.text,
                }}
              >
                {displayTask.customStatus?.name ?? "No status"}
                <ChevronDownIcon label="" size="small" />
              </button>
              {statusDropOpen && (
                <StatusDropdown
                  task={displayTask}
                  workspaceId={workspaceId}
                  columns={columns}
                  onClose={() => setStatusDropOpen(false)}
                  onTaskUpdated={(updated) => setTaskStack(prev => {
                    const idx = prev.findIndex((t) => t.id === updated.id);
                    if (idx === -1) return prev;
                    const next = [...prev]; next[idx] = updated; return next;
                  })}
                />
              )}
            </div>
          )}

          {/* Priority badge */}
          {displayTask?.priority && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: priColor,
                padding: "2px 8px",
                borderRadius: 3,
                backgroundColor: priColor + "1A",
              }}
            >
              {displayTask.priority}
            </span>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#5E6C84",
              display: "flex",
              alignItems: "center",
              padding: 4,
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(9,30,66,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <CrossIcon label="Close" size="small" />
          </button>
        </div>

        {/* Subtask context banner */}
        {displayTask?.parentId && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            backgroundColor: '#F0F1F3',
            borderBottom: '1px solid #DFE1E6',
            flexShrink: 0,
          }}>
            <span style={{ color: '#7A869A', display: 'flex', alignItems: 'center' }}>
              <SubtasksIcon label="" size="small" />
            </span>
            <span style={{ fontSize: 11, color: '#5E6C84' }}>
              Subtask of
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#0052CC', cursor: 'default' }}>
              {parentTask?.title ?? displayTask.parentId.slice(0, 8)}
            </span>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {!displayTask ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#97A0AF", fontSize: 14 }}>
              Loading…
            </div>
          ) : (
            <>
              <LeftPanel
                task={displayTask}
                open={open}
                actorNames={actorNames}
                onSubtaskClick={(sub) => setTaskStack(prev => [...prev, sub])}
                onTaskUpdated={(updated) => setTaskStack(prev => {
                  const idx = prev.findIndex((t) => t.id === updated.id);
                  if (idx === -1) return prev;
                  const next = [...prev];
                  next[idx] = updated;
                  return next;
                })}
              />
              <RightPanel
                task={displayTask}
                projectMembers={projectMembers}
                workspaceId={workspaceId}
                onTaskUpdated={(updated) => setTaskStack(prev => {
                  const idx = prev.findIndex((t) => t.id === updated.id);
                  if (idx === -1) return prev;
                  const next = [...prev];
                  next[idx] = updated;
                  return next;
                })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
