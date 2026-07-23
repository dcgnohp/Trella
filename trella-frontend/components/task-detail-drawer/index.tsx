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
import { TasksService, CustomStatusesService, ColumnsService, VelocityConfigService, SprintsService, WorkflowsService, ApiError } from "@/lib/client";
import CreatableSelect from "@atlaskit/select/creatable-select";
import { useTaskRealtime } from "@/lib/realtime/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";
import { useWorkspaceMode } from "@/lib/workspace-mode/use-workspace-mode";
import { ViewWorkflowModal } from "@/components/view-workflow-modal";

import { CommentsTab } from "../modals/task-detail-modal/comments-tab";
import { AttachmentsTab } from "../modals/task-detail-modal/attachments-tab";
import { ActivityTab } from "../modals/task-detail-modal/activity-tab";
import { DescriptionEditor } from "./description-editor";
import { AiDescriptionGenerator } from "./ai-description-generator";
import { AiSummaryCard } from "./ai-summary-card";
import { AiTaskBreakdown } from "./ai-task-breakdown";
import { AiStoryPointCard } from "./ai-story-point-card";

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
  onManageWorkflow?: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#FF5630",
  HIGH: "#FF991F",
  MEDIUM: "#0052CC",
  LOW: "var(--trella-text-subtlest)",
};

const CANONICAL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#FFAB001A", text: "#FFAB00" },
  TODO: { bg: "var(--trella-border)", text: "var(--trella-text)" },
  IN_PROGRESS: { bg: "#0052CC1A", text: "#0052CC" },
  DONE: { bg: "#36B37E1A", text: "#36B37E" },
};

const WORK_TYPES = ["TASK", "BUG", "STORY", "SUBTASK"] as const;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const TABS = ["Comments", "Attachments", "Activity"] as const;

function getStatusStyle(cs: TaskPublic["customStatus"]): { bg: string; text: string } {
  if (!cs) return { bg: "var(--trella-border)", text: "var(--trella-text)" };
  const canonical = cs.canonicalStatus ?? "";
  if (CANONICAL_STATUS_COLORS[canonical]) return CANONICAL_STATUS_COLORS[canonical];
  const color = cs.color ?? "var(--trella-border)";
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
    case "SUBTASK": return "var(--trella-text-subtlest)";
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
        border: "1px solid var(--trella-border)",
        borderRadius: 4,
        background: hov ? "var(--trella-surface-selected)" : "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--trella-text-subtle)",
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
        style={{ cursor: "default", color: "var(--trella-text-subtlest)", display: "inline-flex", alignItems: "center", marginLeft: 3 }}
      >
        <InformationCircleIcon label="" size="small" />
      </span>
      {show && (
        <span style={{
          position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)",
          marginLeft: 6, zIndex: 500, background: "var(--trella-text)", color: "var(--trella-surface)",
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
      <span style={{ fontSize: 12, color: "var(--trella-text-subtle)", paddingTop: 2, display: "flex", alignItems: "center" }}>
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
  onViewWorkflowClick?: () => void;
}

function StatusDropdown({ task, workspaceId, onClose, columns = [], onTaskUpdated, onViewWorkflowClick }: StatusDropdownProps) {
  const qc = useQueryClient();

  const { data: statuses = [] } = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId ?? ""),
    queryFn: () =>
      CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({
        workspaceId: workspaceId!,
      }),
    enabled: !!workspaceId,
  });

  const modeQuery = useWorkspaceMode(workspaceId ?? "");
  const isScrum =
    modeQuery.data?.mode === "SCRUM" ||
    (typeof window !== "undefined" &&
      window.localStorage.getItem(`trella:projectType:${workspaceId}`) === "scrum");

  const workflowsQuery = useQuery({
    queryKey: ["workflows", workspaceId],
    queryFn: () => WorkflowsService.Workflows_workflowsListWorkflows({ workspaceId: workspaceId! }),
    enabled: !!isScrum && !!workspaceId,
  });

  const activeWorkflow = React.useMemo(() => {
    return workflowsQuery.data?.find((w) => w.isActive) || workflowsQuery.data?.[0];
  }, [workflowsQuery.data]);

  const workflowDetailQuery = useQuery({
    queryKey: ["workflow", activeWorkflow?.id],
    queryFn: () => WorkflowsService.Workflows_workflowsGetWorkflow({ workflowId: activeWorkflow!.id }),
    enabled: !!isScrum && !!activeWorkflow?.id,
  });

  const transitions = React.useMemo(() => workflowDetailQuery.data?.transitions ?? [], [workflowDetailQuery.data]);
  const validDestIds = React.useMemo(() => {
    return transitions
      .filter((t) => t.fromStatusId === task.customStatusId || t.fromStatusId === null)
      .map((t) => t.toStatusId);
  }, [transitions, task.customStatusId]);

  const isWorkflowActive = transitions.length > 0;

  // Filter to statuses tied to board columns — by canonical key OR by name (for unmapped statuses)
  const columnStatusKeys = new Set(columns.map((c) => c.statusKey.toUpperCase()));
  const columnNames = new Set(columns.map((c) => c.name.toLowerCase()));
  const filteredStatuses = columnStatusKeys.size > 0
    ? statuses.filter(
      (s) =>
        (s.canonicalStatus && columnStatusKeys.has(s.canonicalStatus.toUpperCase())) ||
        columnNames.has(s.name.toLowerCase()),
    )
    : statuses;

  const mutation = useMutation({
    mutationFn: ({ customStatusId, transitionComment }: { customStatusId: string; transitionComment?: string }) =>
      TasksService.Tasks_tasksUpdateTask({
        taskId: task.id,
        requestBody: { customStatusId, transitionComment },
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
    onError: (error: any, variables) => {
      let msg = "Failed to update status";
      if (error instanceof ApiError) {
        const body = error.body as { detail?: string } | undefined;
        if (typeof body?.detail === "string") {
          msg = body.detail;
        }
      }

      // If a comment is required, prompt the user directly via prompt dialog
      if (msg.includes("comment is required") || msg.toLowerCase().includes("bình luận")) {
        const comment = window.prompt("Quy trình Scrum yêu cầu viết bình luận giải trình để chuyển sang trạng thái này:");
        if (comment !== null && comment.trim() !== "") {
          mutation.mutate({
            customStatusId: variables.customStatusId,
            transitionComment: comment,
          });
          return;
        }
      }

      const currentStatus = statuses.find((s) => s.id === task.customStatusId)?.name || "Không rõ";
      const targetStatus = statuses.find((s) => s.id === variables.customStatusId)?.name || "Không rõ";

      if (msg === "Invalid workflow transition path") {
        const validStatuses = statuses
          .filter((s) => validDestIds.includes(s.id))
          .map((s) => s.name);
        const validListStr = validStatuses.length > 0 ? validStatuses.join(", ") : "không có trạng thái nào";
        msg = `Không thể chuyển trạng thái từ "${currentStatus}" sang "${targetStatus}". Theo quy trình làm việc (Workflow) của dự án, từ "${currentStatus}" bạn chỉ có thể chuyển sang: ${validListStr}.`;
      }

      toast.error(msg);
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 4,
        zIndex: 400,
        backgroundColor: "var(--trella-surface)",
        border: "1px solid var(--trella-border)",
        borderRadius: 6,
        boxShadow: "var(--trella-shadow-overlay)",
        minWidth: 200,
        overflow: "hidden",
      }}
    >
      {filteredStatuses.map((s) => {
        const style = getStatusStyle(s);
        const isSelected = task.customStatusId === s.id;
        const isValid = !isWorkflowActive || isSelected || validDestIds.includes(s.id);

        return (
          <button
            key={s.id}
            onClick={() => {
              if (!isValid) return;
              mutation.mutate({ customStatusId: s.id });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "7px 12px",
              background: "none",
              border: "none",
              cursor: isValid ? "pointer" : "not-allowed",
              fontSize: 13,
              color: "var(--trella-text)",
              textAlign: "left",
              opacity: isValid ? 1 : 0.45,
            }}
            onMouseEnter={(e) => {
              if (isValid) e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)";
            }}
            onMouseLeave={(e) => {
              if (isValid) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span
              style={{
                backgroundColor: style.bg,
                color: style.text,
                padding: "2px 6px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                display: "inline-block",
                letterSpacing: "0.02em",
              }}
            >
              {s.name}
            </span>
            {!isValid && (
              <span style={{ fontSize: 9, color: "var(--trella-text-subtlest)", fontStyle: "italic", marginLeft: "auto" }}>
                (Không hợp lệ)
              </span>
            )}
          </button>
        );
      })}

      {isWorkflowActive && (
        <>
          <div style={{ height: 1, backgroundColor: "var(--trella-border)", margin: "4px 0" }} />
          <div style={{ padding: "8px 12px 10px", fontSize: 11, color: "var(--trella-text-subtle)", lineHeight: 1.4, maxWidth: 220 }}>
            <span style={{ fontWeight: 600, color: "var(--trella-text)" }}>Gợi ý chuyển trạng thái:</span> Từ &quot;{task.customStatus?.name || "To Do"}&quot; chỉ có thể chuyển sang: <span style={{ color: "#0052CC", fontWeight: 500 }}>{filteredStatuses.filter(s => validDestIds.includes(s.id)).map(s => s.name).join(", ") || "không có"}</span>.
          </div>
        </>
      )}

      <div style={{ height: 1, backgroundColor: "var(--trella-border)", margin: "4px 0" }} />
      {(["Create status", "Edit status", "View workflow"] as const).map((label) => (
        <button
          key={label}
          onClick={() => {
            if (label === "View workflow" && onViewWorkflowClick) {
              onViewWorkflowClick();
            } else {
              toast.info("Coming soon");
            }
            onClose();
          }}
          style={{
            display: "flex",
            width: "100%",
            padding: "7px 12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--trella-text-subtle)",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
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

export interface LeftPanelProps {
  task: TaskPublic;
  open: boolean;
  workspaceId?: string;
  actorNames?: Record<string, string>;
  onSubtaskClick?: (sub: TaskPublic) => void;
  onTaskUpdated?: (t: TaskPublic) => void;
}

export function LeftPanel({ task, open, workspaceId, actorNames, onSubtaskClick, onTaskUpdated }: LeftPanelProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = React.useState(0);

  // Fetch workspace documents
  const { data: workspaceDocs = [], refetch: refetchDocs } = useQuery<any[]>({
    queryKey: ['workspace-docs', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await fetch(`/api/knowledge/${workspaceId}/docs`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const linkedDocs = React.useMemo(() => {
    return workspaceDocs.filter(d => d.taskId === task.id && !d.isArchived);
  }, [workspaceDocs, task.id]);

  const unlinkedDocs = React.useMemo(() => {
    return workspaceDocs.filter(d => d.taskId !== task.id && !d.isArchived);
  }, [workspaceDocs, task.id]);

  const linkDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/knowledge/${workspaceId}/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      refetchDocs();
      toast.success("Document linked successfully");
    },
    onError: () => toast.error("Failed to link document"),
  });

  const unlinkDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/knowledge/${workspaceId}/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: null }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      refetchDocs();
      toast.success("Document unlinked");
    },
    onError: () => toast.error("Failed to unlink document"),
  });

  // Title inline edit
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleVal, setTitleVal] = React.useState(task.title);
  React.useEffect(() => { setTitleVal(task.title); }, [task.title]);

  // Description — handled by DescriptionEditor component.
  // AI-generated draft staged for the editor (Apply populates, never saves).
  const [pendingDraft, setPendingDraft] = React.useState<string | null>(null);

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
    <div style={{ flex: "1 1 60%", overflowY: "auto", padding: "24px 28px", borderRight: "1px solid var(--trella-border)" }}>
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
            color: "var(--trella-text)",
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
            color: "var(--trella-text)",
            margin: "0 0 8px",
            lineHeight: 1.4,
            cursor: "text",
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.border = "1px solid var(--trella-border)")}
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
            border: "1px solid var(--trella-border)",
            borderRadius: 4,
            cursor: "pointer",
            padding: "3px 8px",
            fontSize: 12,
            color: typeColor,
          }}
        >
          <span style={{ color: typeColor }}>{getTypeIcon(task.type)}</span>
          {task.type ?? "TASK"}
          <span style={{ color: "var(--trella-text-subtle)" }}><ChevronDownIcon label="" size="small" /></span>
        </button>
        {typeDropOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              zIndex: 400,
              backgroundColor: "var(--trella-surface)",
              border: "1px solid var(--trella-border)",
              borderRadius: 6,
              boxShadow: "var(--trella-shadow-overlay)",
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
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <AiDescriptionGenerator
            title={task.title}
            description={task.description}
            priority={task.priority}
            onApply={setPendingDraft}
            testId="ai-desc-generate"
          />
        </div>
        <DescriptionEditor
          value={task.description}
          draft={pendingDraft}
          onDraftConsumed={() => setPendingDraft(null)}
          onSave={(html) => patchMutation.mutate({ description: html })}
          disabled={patchMutation.isPending}
        />
        <div style={{ marginTop: 16 }}>
          <AiSummaryCard description={task.description} title={task.title} />
        </div>
      </div>

      {/* Subtasks */}
      <div style={{ marginBottom: 24 }}>
        <SubtasksSection task={task} open={open} onSubtaskClick={onSubtaskClick} />
      </div>

      {/* Linked Documents */}
      {workspaceId && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--trella-text)" }}>Linked Documents</p>

          {linkedDocs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {linkedDocs.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "1px solid var(--trella-border)",
                    backgroundColor: "var(--trella-surface)",
                  }}
                >
                  <a
                    href={`/workspaces/${workspaceId}/docs?docId=${doc.id}`}
                    style={{ fontSize: 13, color: "#0052CC", textDecoration: "none", fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                  >
                    📄 {doc.title || 'Untitled'}
                  </a>
                  <button
                    onClick={() => unlinkDocMutation.mutate(doc.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#FF5630", fontSize: 11, padding: 0 }}
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <a
              href={`/workspaces/${workspaceId}/docs/new?taskId=${task.id}`}
              style={{
                fontSize: 12,
                color: "var(--trella-text-subtle)",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--trella-text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--trella-text-subtle)")}
            >
              <span style={{ fontSize: 14 }}>+</span> Create new doc
            </a>

            {unlinkedDocs.length > 0 && (
              <select
                onChange={e => {
                  if (e.target.value) {
                    linkDocMutation.mutate(e.target.value);
                    e.target.value = "";
                  }
                }}
                style={{
                  height: 24,
                  fontSize: 11,
                  border: "1px solid var(--trella-border)",
                  borderRadius: 4,
                  backgroundColor: "var(--trella-surface)",
                  color: "var(--trella-text-subtle)",
                  outline: "none",
                }}
              >
                <option value="">+ Link existing doc...</option>
                {unlinkedDocs.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Linked work items */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--trella-text)" }}>Linked work items</p>
        <button
          onClick={() => toast.info("Coming soon")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text-subtle)", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--trella-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--trella-text-subtle)")}
        >
          <AddIcon label="" size="small" />
          Add linked work item
        </button>
      </div>

      {/* Activity tabs */}
      <div>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--trella-text)" }}>Activity</p>
        <div style={{ display: "flex", borderBottom: "1px solid var(--trella-border)", marginBottom: 16, gap: 4 }}>
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
                color: activeTab === i ? "#0052CC" : "var(--trella-text-subtle)",
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

export interface RightPanelProps {
  task: TaskPublic;
  projectMembers?: ProjectMemberPublic[];
  workspaceId?: string;
  onTaskUpdated?: (t: TaskPublic) => void;
}

export function RightPanel({ task, projectMembers = [], workspaceId, onTaskUpdated }: RightPanelProps) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Sprint is a Scrum-only concept — Kanban workspaces have no backlog/sprints,
  // so hide the Sprint field there. Mirror the board's mode check (BE mode +
  // localStorage fallback) so the two surfaces agree.
  const modeQuery = useWorkspaceMode(workspaceId ?? "");
  const isScrum =
    modeQuery.data?.mode === "SCRUM" ||
    (typeof window !== "undefined" &&
      window.localStorage.getItem(`trella:projectType:${workspaceId}`) === "scrum");

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
  const priColor = PRIORITY_COLORS[task.priority ?? ""] ?? "var(--trella-text-subtlest)";

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const reporterName = user?.fullName ?? user?.email ?? "You";
  const reporterInitials = initials(reporterName);

  return (
    <div style={{ flex: "0 0 280px", overflowY: "auto", padding: 20, backgroundColor: "var(--trella-surface-sunken)" }}>
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "var(--trella-text-subtlest)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
              <div style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "var(--trella-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--trella-text-subtlest)", flexShrink: 0 }}>
                <PersonAvatarIcon label="" size="small" />
              </div>
            )}
            <span style={{ fontSize: 13, color: "var(--trella-text)" }}>{assigneeName}</span>
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
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 400, backgroundColor: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 6, boxShadow: "var(--trella-shadow-overlay)", minWidth: 200, overflow: "hidden" }}>
              {projectMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAssigneeMutation.mutate(m.userId)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text)", textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
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
                  <div style={{ height: 1, backgroundColor: "var(--trella-border)", margin: "4px 0" }} />
                  <button
                    onClick={() => unsetAssigneeMutation.mutate()}
                    style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#FF5630", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
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
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 400, backgroundColor: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 6, boxShadow: "var(--trella-shadow-overlay)", minWidth: 140, overflow: "hidden" }}>
              {PRIORITIES.map((p) => {
                const pc = PRIORITY_COLORS[p];
                return (
                  <button
                    key={p}
                    onClick={() => { patchMutation.mutate({ priority: p }); setPriDrop(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text)", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
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
        <span style={{ fontSize: 13, color: "var(--trella-text-subtlest)" }}>{task.parentId ? task.parentId.slice(0, 8) : "None"}</span>
      </DetailRow>

      <DetailRow label="Due date" tooltip="Target completion date, auto-calculated from story points">
        {editingDueDate ? (
          <input
            type="date"
            autoFocus
            defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onBlur={e => {
              const newDue = e.target.value || null;
              const patch: { dueDate?: string | null; storyPoint?: number | null } = { dueDate: newDue };
              if (newDue && (task.startDate || task.createdAt)) {
                const s = new Date(task.startDate || task.createdAt);
                const d = new Date(newDue);
                const ms = Math.max(0, d.getTime() - s.getTime());
                const days = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
                patch.storyPoint = days * 2;
              }
              patchMutation.mutate(patch);
              setEditingDueDate(false);
            }}
            onKeyDown={e => { if (e.key === "Escape") setEditingDueDate(false); }}
            style={{ fontSize: 13, border: "1px solid #0052CC", borderRadius: 4, padding: "2px 6px", outline: "none" }}
          />
        ) : (
          <span onClick={() => setEditingDueDate(true)} style={{ fontSize: 13, color: task.dueDate ? "var(--trella-text)" : "var(--trella-text-subtlest)", cursor: "pointer" }}>
            {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None"}
          </span>
        )}
      </DetailRow>

      <DetailRow label="Labels" tooltip="Tags for categorizing this task"><span style={{ fontSize: 13, color: "var(--trella-text-subtlest)" }}>None</span></DetailRow>
      <DetailRow label="Team" tooltip="Team responsible for this task"><span style={{ fontSize: 13, color: "var(--trella-text-subtlest)" }}>None</span></DetailRow>
      <DetailRow label="Start date" tooltip="Date this task was created and work can begin">
        <span style={{ fontSize: 13, color: "var(--trella-text)" }}>
          {task.startDate ? new Date(task.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : (task.createdAt ? new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None")}
        </span>
      </DetailRow>
      {isScrum && (
        <DetailRow label="Sprint" tooltip="Sprint this task is assigned to">
          <div style={{ position: "relative" }} ref={sprintRef}>
            <span
              onClick={() => setSprintDrop((p) => !p)}
              style={{ fontSize: 13, color: currentSprint ? "var(--trella-text)" : "var(--trella-text-subtlest)", cursor: "pointer" }}
            >
              {currentSprint ? currentSprint.name : "None"}
            </span>
            {sprintDrop && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 400, backgroundColor: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 6, boxShadow: "var(--trella-shadow-overlay)", minWidth: 180, overflow: "hidden" }}>
                <button
                  onClick={() => { patchMutation.mutate({ sprintId: null }); setSprintDrop(false); }}
                  style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text-subtlest)", textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  None
                </button>
                {sprints.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { patchMutation.mutate({ sprintId: s.id }); setSprintDrop(false); }}
                    style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text)", textAlign: "left", fontWeight: s.id === task.sprintId ? 700 : 400 }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DetailRow>
      )}

      <DetailRow label="Story points" tooltip="Effort estimate — only Fibonacci values allowed (1,2,3,5,8,13,21)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
              if (n !== task.storyPoint) {
                const patch: { storyPoint?: number | null; dueDate?: string | null } = { storyPoint: n };
                if (n != null && n > 0) {
                  const days = Math.max(1, Math.round(n / 2));
                  const s = new Date(task.startDate || task.createdAt || '2026-07-01');
                  s.setDate(s.getDate() + (days - 1));
                  patch.dueDate = s.toISOString().slice(0, 10);
                }
                patchMutation.mutate(patch);
              }
            }}
            styles={{
              control: (base) => ({ ...base, minHeight: 28, fontSize: 13, border: "1px solid var(--trella-border)", boxShadow: "none", cursor: "pointer" }),
              valueContainer: (base) => ({ ...base, padding: "0 6px" }),
              indicatorsContainer: (base) => ({ ...base, height: 28 }),
              menu: (base) => ({ ...base, fontSize: 13, zIndex: 500 }),
            }}
          />
          {task.storyPoint != null && (
            <span style={{ fontSize: 11, color: "var(--trella-text-subtle)", marginTop: 4, display: "block" }}>
              {(task.storyPoint * hoursPerPoint / 8) < 1
                ? `${(task.storyPoint * hoursPerPoint).toFixed(1)}h`
                : `${(task.storyPoint * hoursPerPoint / 8).toFixed(1)} days`}
            </span>
          )}
          <div style={{ marginTop: 8 }}>
            <AiStoryPointCard
              title={task.title}
              description={task.description}
              priority={task.priority}
              onApply={(points) => {
                const days = Math.max(1, Math.round(points / 2));
                const s = new Date(task.startDate || task.createdAt || '2026-07-01');
                s.setDate(s.getDate() + (days - 1));
                patchMutation.mutate({ storyPoint: points, dueDate: s.toISOString().slice(0, 10) });
              }}
            />
          </div>
        </div>
      </DetailRow>

      <DetailRow label="Reporter" tooltip="Person who created this task">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#0052CC,#6554C0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>
            {reporterInitials}
          </div>
          <span style={{ fontSize: 13, color: "var(--trella-text)" }}>{reporterName}</span>
        </div>
      </DetailRow>

      <div style={{ borderTop: "1px solid var(--trella-border)", paddingTop: 12, marginTop: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--trella-text-subtlest)" }}>
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

  const createMultipleMutation = useMutation({
    mutationFn: async (newSubtasks: any[]) => {
      return Promise.all(
        newSubtasks.map(async (s) => {
          const created = await ColumnsService.Columns_columnsCreateTask({
            boardId: task.boardId,
            columnId: task.columnId,
            requestBody: { title: s.title, type: "SUBTASK", parentId: task.id },
          });
          if (s.description) {
            await TasksService.Tasks_tasksUpdateTask({
              taskId: created.id,
              requestBody: { description: s.description },
            });
          }
          return created;
        })
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.boardTasks(task.boardId) });
      qc.invalidateQueries({ queryKey: ["task-subtasks", task.id] });
      toast.success("Subtasks added");
    },
    onError: () => toast.error("Failed to add subtasks"),
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
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--trella-text)" }}>Subtasks</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {total > 0 && (
            <span style={{ fontSize: 12, color: "var(--trella-text-subtle)" }}>{pct}% Done</span>
          )}
          <AiTaskBreakdown
            title={task.title}
            description={task.description}
            priority={task.priority}
            onAddSubtasks={(subtasks) => {
              createMultipleMutation.mutate(subtasks);
            }}
          />
        </div>
      </div>
      {total > 0 && (
        <div style={{ height: 4, backgroundColor: "var(--trella-border)", borderRadius: 2, marginBottom: 10 }}>
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
        <div style={{ border: "1px solid var(--trella-border)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 100px",
              padding: "4px 10px",
              backgroundColor: "var(--trella-surface-sunken)",
              borderBottom: "1px solid var(--trella-border)",
            }}
          >
            {["Work", "Priority", "Assignee", "Status"].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "var(--trella-text-subtle)", textTransform: "uppercase" }}>
                {h}
              </span>
            ))}
          </div>
          {subtasks.map((sub) => {
            const priColor = PRIORITY_COLORS[sub.priority ?? ""] ?? "var(--trella-text-subtlest)";
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
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ color: getTypeColor(sub.type), flexShrink: 0 }}>
                    <SubtasksIcon label="" size="small" />
                  </span>
                  <span style={{ fontSize: 13, color: "var(--trella-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                      backgroundColor: "var(--trella-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--trella-text-subtlest)",
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
              color: "var(--trella-text)",
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
              color: "var(--trella-text-subtle)",
              border: "1px solid var(--trella-border)",
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
            color: "var(--trella-text-subtle)",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--trella-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--trella-text-subtle)")}
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
  onManageWorkflow,
}: TaskDetailDrawerProps) {
  const [statusDropOpen, setStatusDropOpen] = React.useState(false);
  const [workflowDiagramOpen, setWorkflowDiagramOpen] = React.useState(false);
  const statusDropRef = React.useRef<HTMLDivElement>(null);

  // Fetch custom statuses list for the workflow diagram
  const { data: statuses = [] } = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId ?? ""),
    queryFn: () =>
      CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({
        workspaceId: workspaceId!,
      }),
    enabled: open && !!workspaceId,
  });

  // Fetch parent task for the subtask banner
  const { data: parentTask } = useQuery({
    queryKey: ['task', task?.parentId],
    queryFn: () => TasksService.Tasks_tasksGetTask({ taskId: task!.parentId! }),
    enabled: open && !!task?.parentId,
  });

  // Navigation stack for drilling into subtasks
  const [taskStack, setTaskStack] = React.useState<TaskPublic[]>([]);
  // Reset stack on task ID change (new task opened)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const priColor = PRIORITY_COLORS[displayTask?.priority ?? ""] ?? "var(--trella-text-subtlest)";
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
          backgroundColor: "var(--trella-surface)",
          borderRadius: 8,
          boxShadow: "var(--trella-shadow-overlay)",
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
            borderBottom: "1px solid var(--trella-border)",
            flexShrink: 0,
            gap: 8,
          }}
        >
          {/* Back button when drilling into subtask */}
          {taskStack.length > 1 && (
            <button
              onClick={() => setTaskStack(prev => prev.slice(0, -1))}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px solid var(--trella-border)", borderRadius: 4, cursor: "pointer", padding: "3px 8px", fontSize: 12, color: "var(--trella-text-subtle)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--trella-surface-selected)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <ArrowLeftIcon label="" size="small" />
              {taskStack[taskStack.length - 2]?.title?.slice(0, 30)}
            </button>
          )}

          {/* Breadcrumb */}
          <span style={{ fontSize: 12, color: "var(--trella-text-subtlest)", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Add epic
          </span>
          <span style={{ color: "var(--trella-border)" }}>/</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: getTypeColor(taskType) }}>{getTypeIcon(taskType)}</span>
            <span style={{ fontSize: 12, color: "var(--trella-text-subtle)", fontWeight: 500 }}>{taskId}</span>
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
                  onViewWorkflowClick={() => setWorkflowDiagramOpen(true)}
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
              color: "var(--trella-text-subtle)",
              display: "flex",
              alignItems: "center",
              padding: 4,
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-selected)")}
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
            backgroundColor: 'var(--trella-border-subtle)',
            borderBottom: '1px solid var(--trella-border)',
            flexShrink: 0,
          }}>
            <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex', alignItems: 'center' }}>
              <SubtasksIcon label="" size="small" />
            </span>
            <span style={{ fontSize: 11, color: 'var(--trella-text-subtle)' }}>
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
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--trella-text-subtlest)", fontSize: 14 }}>
              Loading…
            </div>
          ) : (
            <>
              <LeftPanel
                task={displayTask}
                open={open}
                workspaceId={workspaceId}
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
      {displayTask && (
        <ViewWorkflowModal
          open={workflowDiagramOpen}
          onClose={() => setWorkflowDiagramOpen(false)}
          workspaceId={workspaceId ?? ""}
          currentStatusId={displayTask.customStatusId}
          customStatuses={statuses}
          onEditClick={onManageWorkflow}
        />
      )}
    </div>
  );
}
