"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Trash2,
  Settings,
  Lock,
  FileText,
  UserCheck,
  Zap,
  Plus,
  Play,
  ArrowRight,
  Info,
} from "lucide-react";
import TaskIcon from "@atlaskit/icon/core/task";
import BugIcon from "@atlaskit/icon/core/bug";
import StoryIcon from "@atlaskit/icon/core/story";
import SubtasksIcon from "@atlaskit/icon/core/subtasks";

import { Button } from "@/components/ui/button";

import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { WorkflowsService, type CustomStatusEmbed } from "@/lib/client";

interface ManageWorkflowModalProps {
  open: boolean;
  onClose: () => void;
  boardName: string;
  customStatuses: CustomStatusEmbed[];
  workspaceId: string;
}

const CANONICAL_ORDER: Record<string, number> = {
  PENDING: 0,
  TODO: 1,
  IN_PROGRESS: 2,
  DONE: 3,
};

const CANONICAL_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#FFAB00", text: "#000000" },
  TODO: { bg: "#F4F5F7", text: "#172B4D" },
  IN_PROGRESS: { bg: "#0052CC", text: "#FFFFFF" },
  DONE: { bg: "#36B37E", text: "#FFFFFF" },
};

function getStatusColor(status: CustomStatusEmbed): { bg: string; text: string } {
  if (status.canonicalStatus && CANONICAL_COLORS[status.canonicalStatus]) {
    return CANONICAL_COLORS[status.canonicalStatus];
  }
  const bg = status.color ?? "#F4F5F7";
  const hex = bg.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { bg, text: luminance > 0.55 ? "#172B4D" : "#FFFFFF" };
}

// Custom Node Components for React Flow
const StatusNodeComponent = ({ data }: any) => {
  const { name, canonicalStatus, bg, text } = data;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 6,
        background: bg,
        color: text,
        border: "1px solid var(--trella-border)",
        minWidth: 150,
        boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
        fontSize: 12,
        fontWeight: 600,
        position: "relative",
      }}
    >
      <div style={{ opacity: 0.7, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {canonicalStatus || "STATUS"}
      </div>
      <div>{name}</div>
      
      <Handle type="target" position={Position.Left} style={{ background: "#0052cc", width: 12, height: 12, border: "2px solid white", borderRadius: "50%", boxShadow: "0 0 0 1px var(--trella-border)", cursor: "crosshair" }} />
      <Handle type="source" position={Position.Right} style={{ background: "#0052cc", width: 12, height: 12, border: "2px solid white", borderRadius: "50%", boxShadow: "0 0 0 1px var(--trella-border)", cursor: "crosshair" }} />
    </div>
  );
};

const StartNodeComponent = () => {
  return (
    <div
      style={{
        width: 60,
        height: 60,
        borderRadius: "50%",
        background: "var(--trella-surface)",
        border: "2px solid var(--trella-text-subtle)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 800,
        color: "var(--trella-text)",
        boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
        position: "relative",
      }}
    >
      START
      <Handle type="source" position={Position.Right} style={{ background: "var(--trella-text)", width: 12, height: 12, border: "2px solid white", borderRadius: "50%", cursor: "crosshair" }} />
    </div>
  );
};

const nodeTypes = {
  statusNode: StatusNodeComponent,
  startNode: StartNodeComponent,
};

export function ManageWorkflowModal({
  open,
  onClose,
  boardName,
  customStatuses,
  workspaceId,
}: ManageWorkflowModalProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"diagram" | "text">("diagram");
  const [selectedElement, setSelectedElement] = useState<{ type: "node" | "edge"; id: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Form states for selected transition
  const [transitionName, setTransitionName] = useState("");
  const [commentRequired, setCommentRequired] = useState(false);
  const [assigneeOnly, setAssigneeOnly] = useState(false);
  const [autoAssign, setAutoAssign] = useState(false);

  // Fetch all workflows in the workspace
  const workflowsQuery = useQuery({
    queryKey: ["workflows", workspaceId],
    queryFn: () => WorkflowsService.Workflows_workflowsListWorkflows({ workspaceId }),
    enabled: open,
  });

  const activeWorkflow = useMemo(() => {
    return workflowsQuery.data?.find((w) => w.isActive) || workflowsQuery.data?.[0];
  }, [workflowsQuery.data]);

  // Fetch workflow detail with transitions
  const workflowDetailQuery = useQuery({
    queryKey: ["workflow", activeWorkflow?.id],
    queryFn: () => WorkflowsService.Workflows_workflowsGetWorkflow({ workflowId: activeWorkflow!.id }),
    enabled: !!activeWorkflow?.id && open,
  });

  // Mutators for API syncing
  const bootstrapMutation = useMutation({
    mutationFn: () => WorkflowsService.Workflows_workflowsBootstrapDefaultWorkflow({ workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", workspaceId] });
      toast.success("Đã khởi tạo quy trình (workflow) chuẩn Scrum!");
    },
  });

  const createTransitionMutation = useMutation({
    mutationFn: (data: { fromStatusId: string | null; toStatusId: string; name: string }) =>
      WorkflowsService.Workflows_workflowsCreateTransition({
        workflowId: activeWorkflow!.id,
        requestBody: {
          name: data.name,
          fromStatusId: data.fromStatusId,
          toStatusId: data.toStatusId,
          conditions: [],
          validators: [],
          actions: [],
        },
      }),
    onSuccess: (newTransition) => {
      queryClient.invalidateQueries({ queryKey: ["workflow", activeWorkflow?.id] });
      toast.success("Đã thêm transition mới!");

      // If the selected element was the temporary edge for this transition, update its ID to the real UUID!
      if (selectedElement && selectedElement.type === "edge" && selectedElement.id.startsWith("temp-")) {
        const tempEdge = edges.find((e) => e.id === selectedElement.id);
        if (tempEdge) {
          const tempSourceId = tempEdge.source === "start" ? null : tempEdge.source;
          if (tempSourceId === newTransition.fromStatusId && tempEdge.target === newTransition.toStatusId) {
            setSelectedElement({ type: "edge", id: newTransition.id });
          }
        }
      }
    },
  });

  const updateTransitionMutation = useMutation({
    mutationFn: (data: {
      transitionId: string;
      name: string;
      conditions: any[];
      validators: any[];
      actions: any[];
    }) =>
      WorkflowsService.Workflows_workflowsUpdateTransition({
        transitionId: data.transitionId,
        requestBody: {
          name: data.name,
          conditions: data.conditions,
          validators: data.validators,
          actions: data.actions,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", activeWorkflow?.id] });
      toast.success("Đã lưu cấu hình transition!");
    },
  });

  const deleteTransitionMutation = useMutation({
    mutationFn: (transitionId: string) =>
      WorkflowsService.Workflows_workflowsDeleteTransition({ transitionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", activeWorkflow?.id] });
      setSelectedElement(null);
      toast.success("Đã xóa transition!");
    },
  });

  // React Flow state hooks
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const hasTriggeredBootstrap = useRef(false);

  // Auto-bootstrap default workflow if none exists in workspace
  useEffect(() => {
    if (!open) {
      hasTriggeredBootstrap.current = false;
      return;
    }
    if (open && workflowsQuery.isSuccess && !activeWorkflow && !bootstrapMutation.isPending && !hasTriggeredBootstrap.current) {
      hasTriggeredBootstrap.current = true;
      bootstrapMutation.mutate();
    }
  }, [open, workflowsQuery.isSuccess, activeWorkflow, bootstrapMutation]);

  // Generate React Flow Nodes & Edges from workflow data
  useEffect(() => {
    if (!open || !customStatuses) return;

    // 1. Create a special start node
    const startNode: Node = {
      id: "start",
      type: "startNode",
      position: { x: 50, y: 150 },
      data: {},
    };

    // 2. Map custom statuses to status nodes
    const sorted = [...customStatuses].sort((a, b) => {
      const oa = a.canonicalStatus ? (CANONICAL_ORDER[a.canonicalStatus] ?? 4) : 4;
      const ob = b.canonicalStatus ? (CANONICAL_ORDER[b.canonicalStatus] ?? 4) : 4;
      return oa - ob;
    });

    const statusNodes: Node[] = sorted.map((s, i) => {
      const colors = getStatusColor(s);
      return {
        id: s.id,
        type: "statusNode",
        position: { x: 200 + i * 240, y: 150 + (i % 2 === 0 ? 0 : 40) }, // grid offset
        data: {
          name: s.name,
          canonicalStatus: s.canonicalStatus,
          bg: colors.bg,
          text: colors.text,
        },
      };
    });

    setNodes([startNode, ...statusNodes]);

    // 3. Map transitions to edges
    const transitions = workflowDetailQuery.data?.transitions || [];
    const flowEdges: Edge[] = transitions.map((t) => {
      const sourceId = t.fromStatusId || "start";
      return {
        id: t.id,
        source: sourceId,
        target: t.toStatusId,
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--trella-brand)",
        },
        style: { strokeWidth: 2, stroke: "var(--trella-brand)" },
        label: t.name,
        labelStyle: { fill: "var(--trella-text-subtle)", fontSize: 9, fontWeight: 500 },
      };
    });

    setEdges(flowEdges);
  }, [workflowDetailQuery.data, customStatuses, open, setNodes, setEdges]);

  // Hook up sidebar values when element is clicked
  const onElementClick = useCallback((_: any, element: any) => {
    if (element.source) {
      // It's an edge (transition)
      setSelectedElement({ type: "edge", id: element.id });
      const transition = workflowDetailQuery.data?.transitions?.find((t) => t.id === element.id);
      if (transition) {
        setTransitionName(transition.name);
        
        // Parse conditions, validators, actions lists
        const hasComment = transition.validators?.some((v: any) => v.type === "COMMENT_REQUIRED");
        const hasAssignee = transition.conditions?.some((c: any) => c.type === "ASSIGNEE_ONLY");
        const hasAutoAssign = transition.actions?.some((a: any) => a.type === "AUTO_ASSIGN_TO_ACTOR");
        
        setCommentRequired(!!hasComment);
        setAssigneeOnly(!!hasAssignee);
        setAutoAssign(!!hasAutoAssign);
      }
    } else {
      // It's a node
      setSelectedElement({ type: "node", id: element.id });
    }
  }, [workflowDetailQuery.data]);

  // Connect handler to add transition
  const onConnect = useCallback((params: Connection) => {
    if (!activeWorkflow) {
      toast.error("Vui lòng đợi quy trình khởi tạo xong.");
      return;
    }
    if (!params.target) return;
    const sourceId = params.source === "start" ? null : params.source;
    
    // Add the edge locally immediately so the connection line maps and displays instantly!
    const tempId = `temp-${Date.now()}`;
    const newEdge: Edge = {
      id: tempId,
      source: params.source || "start",
      target: params.target,
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--trella-brand)",
      },
      style: { strokeWidth: 2, stroke: "var(--trella-brand)" },
      label: "Chuyển tiếp",
      labelStyle: { fill: "var(--trella-text-subtle)", fontSize: 9, fontWeight: 500 },
    };
    setEdges((eds) => addEdge(newEdge, eds));

    // Find target status name
    const targetStatus = customStatuses.find((s) => s.id === params.target);
    const transitionName = targetStatus ? `Chuyển đến ${targetStatus.name}` : "Chuyển tiếp";

    createTransitionMutation.mutate({
      fromStatusId: sourceId,
      toStatusId: params.target,
      name: transitionName,
    });
  }, [customStatuses, activeWorkflow, createTransitionMutation, setEdges]);

  const handleSaveTransition = () => {
    if (!selectedElement || selectedElement.type !== "edge") return;
    if (selectedElement.id.startsWith("temp-")) {
      toast.error("Vui lòng đợi đường chuyển tiếp khởi tạo xong trước khi lưu cấu hình.");
      return;
    }
    
    const conditions = [];
    if (assigneeOnly) {
      conditions.push({ type: "ASSIGNEE_ONLY" });
    }
    
    const validators = [];
    if (commentRequired) {
      validators.push({ type: "COMMENT_REQUIRED" });
    }
    
    const actions = [];
    if (autoAssign) {
      actions.push({ type: "AUTO_ASSIGN_TO_ACTOR" });
    }

    updateTransitionMutation.mutate({
      transitionId: selectedElement.id,
      name: transitionName,
      conditions,
      validators,
      actions,
    });
  };

  const handleDeleteTransition = () => {
    if (!selectedElement || selectedElement.type !== "edge") return;
    if (selectedElement.id.startsWith("temp-")) {
      toast.error("Vui lòng đợi đường chuyển tiếp khởi tạo xong trước khi xóa.");
      return;
    }
    if (window.confirm("Bạn có chắc chắn muốn xóa đường chuyển tiếp này?")) {
      deleteTransitionMutation.mutate(selectedElement.id);
    }
  };

  if (!open || !mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--trella-surface)",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          borderBottom: "1px solid var(--trella-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--trella-text-subtle)" }}>Workflow Editor cho </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--trella-text)" }}>{boardName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <TaskIcon label="Task" size="small" />
          <BugIcon label="Bug" size="small" />
          <StoryIcon label="Story" size="small" />
          <SubtasksIcon label="Subtasks" size="small" />
        </div>
        <div style={{ flex: 1 }} />
        
        {/* Bootstrap Workflow button if missing */}
        {!activeWorkflow && (
          <button
            onClick={() => bootstrapMutation.mutate()}
            disabled={bootstrapMutation.isPending}
            style={{
              height: 32,
              background: "#0052CC",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "0 12px",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Zap className="h-4 w-4" /> Khởi tạo Workflow mặc định
          </button>
        )}
        
        <button
          onClick={onClose}
          style={{
            height: 32,
            border: "1px solid var(--trella-border)",
            background: "var(--trella-surface)",
            color: "var(--trella-text)",
            borderRadius: 4,
            padding: "0 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Đóng
        </button>
      </div>

      {/* Toolbar */}
      <div
        style={{
          height: 44,
          borderBottom: "1px solid var(--trella-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 13, color: "var(--trella-text-subtle)", gap: 4 }}>
          <Info className="h-4 w-4 text-blue-600" />
          <span>Kéo chuột từ các handle ở rìa status để tạo đường dẫn chuyển tiếp (Transition). Bấm vào transition để chỉnh sửa.</span>
        </div>
        
        <div style={{ flex: 1 }} />
        
        <div
          style={{
            display: "flex",
            backgroundColor: "var(--trella-surface-sunken)",
            borderRadius: 4,
            padding: 2,
          }}
        >
          <button
            onClick={() => setActiveTab("diagram")}
            style={{
              height: 26,
              borderRadius: 3,
              padding: "0 12px",
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              background: activeTab === "diagram" ? "var(--trella-surface)" : "transparent",
              color: "var(--trella-text)",
              boxShadow: activeTab === "diagram" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Sơ đồ trực quan
          </button>
          <button
            onClick={() => setActiveTab("text")}
            style={{
              height: 26,
              borderRadius: 3,
              padding: "0 12px",
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              background: activeTab === "text" ? "var(--trella-surface)" : "transparent",
              color: "var(--trella-text)",
              boxShadow: activeTab === "text" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Dạng danh sách
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* React Flow Editor Panel */}
        <div style={{ flex: 1, height: "100%", background: "var(--trella-surface-sunken)", position: "relative" }}>
          {activeTab === "diagram" ? (
            <div style={{ width: "100%", height: "100%" }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onElementClick}
                onEdgeClick={onElementClick}
                nodeTypes={nodeTypes}
                fitView
              >
                <Background color="var(--trella-text-subtlest)" gap={16} />
                <Controls />
              </ReactFlow>
            </div>
          ) : (
            <div style={{ padding: 32, overflowY: "auto", height: "100%" }}>
              <div style={{ maxWidth: 600, margin: "0 auto", backgroundColor: "var(--trella-surface)", padding: 24, borderRadius: 8, border: "1px solid var(--trella-border)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Quy trình làm việc (Trạng thái)</h3>
                {customStatuses.map((s, i) => {
                  const { bg, text: textColor } = getStatusColor(s);
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--trella-border)" }}>
                      <span style={{ fontSize: 12, color: "var(--trella-text-subtlest)", minWidth: 20 }}>{i + 1}.</span>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          background: bg,
                          color: textColor,
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {s.name}
                      </span>
                      {s.canonicalStatus && (
                        <span style={{ fontSize: 11, color: "var(--trella-text-subtlest)", textTransform: "uppercase" }}>{s.canonicalStatus}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Sidebar Control Panel */}
        <div
          style={{
            width: 320,
            borderLeft: "1px solid var(--trella-border)",
            overflowY: "auto",
            padding: 20,
            background: "var(--trella-surface)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {selectedElement?.type === "edge" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <Settings className="h-4 w-4 text-blue-600" /> Cấu hình Transition
                </h4>
                <p style={{ fontSize: 11, color: "var(--trella-text-subtle)", marginTop: 4 }}>
                  Chỉnh sửa tên và các ràng buộc di chuyển nhiệm vụ.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500 }}>Tên đường dẫn</label>
                <input
                  type="text"
                  value={transitionName}
                  onChange={(e) => setTransitionName(e.target.value)}
                  style={{
                    height: 32,
                    borderRadius: 4,
                    border: "1px solid var(--trella-border)",
                    padding: "0 8px",
                    fontSize: 13,
                    background: "var(--trella-surface)",
                    color: "var(--trella-text)",
                  }}
                />
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--trella-border)" }} />

              {/* Conditions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <Lock className="h-3.5 w-3.5 text-amber-500" /> Conditions (Điều kiện)
                </span>
                
                <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={assigneeOnly}
                    onChange={(e) => setAssigneeOnly(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <span style={{ fontWeight: 500 }}>Chỉ Assignee</span>
                    <p style={{ fontSize: 10, color: "var(--trella-text-subtle)", margin: 0 }}>
                      Chỉ người được gán nhiệm vụ mới được kéo sang trạng thái này.
                    </p>
                  </div>
                </label>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--trella-border)" }} />

              {/* Validators */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <FileText className="h-3.5 w-3.5 text-blue-500" /> Validators (Kiểm tra)
                </span>
                
                <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={commentRequired}
                    onChange={(e) => setCommentRequired(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <span style={{ fontWeight: 500 }}>Yêu cầu bình luận (Comment)</span>
                    <p style={{ fontSize: 10, color: "var(--trella-text-subtle)", margin: 0 }}>
                      Bắt buộc người dùng nhập giải trình/comment khi chuyển trạng thái nhiệm vụ.
                    </p>
                  </div>
                </label>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--trella-border)" }} />

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <UserCheck className="h-3.5 w-3.5 text-green-500" /> Post-Actions (Tự động hóa)
                </span>
                
                <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={autoAssign}
                    onChange={(e) => setAutoAssign(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <span style={{ fontWeight: 500 }}>Tự gán Assignee (Auto-Assign)</span>
                    <p style={{ fontSize: 10, color: "var(--trella-text-subtle)", margin: 0 }}>
                      Tự động đổi Assignee của nhiệm vụ thành tài khoản người thực hiện thao tác kéo thả.
                    </p>
                  </div>
                </label>
              </div>

              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                <Button
                  onClick={handleSaveTransition}
                  disabled={updateTransitionMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white w-full text-xs"
                >
                  {updateTransitionMutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}
                </Button>
                <Button
                  onClick={handleDeleteTransition}
                  disabled={deleteTransitionMutation.isPending}
                  variant="destructive"
                  className="w-full text-xs"
                >
                  Xóa đường chuyển tiếp
                </Button>
              </div>
            </div>
          ) : selectedElement?.type === "node" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600 }}>Trạng thái nhiệm vụ</h4>
              {selectedElement.id === "start" ? (
                <div>
                  <p style={{ fontSize: 12, color: "var(--trella-text-subtle)" }}>
                    Đây là nút bắt đầu của quy trình. Bất kỳ đường kéo từ nút này sẽ cấu hình điều kiện chuyển tiếp mặc định (từ bất kỳ trạng thái nào).
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500 }}>
                    ID: <code style={{ fontSize: 11, background: "var(--trella-surface-sunken)", padding: "2px 4px", borderRadius: 3 }}>{selectedElement.id}</code>
                  </p>
                  <p style={{ fontSize: 12, color: "var(--trella-text-subtle)", marginTop: 6 }}>
                    Trạng thái này được đồng bộ với cột trên bảng. Bạn có thể kéo đường chuyển tiếp từ status này sang status khác trên sơ đồ để ràng buộc quy trình làm việc Agile.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Zap className="h-4 w-4 text-blue-600" /> Hướng dẫn biên tập
              </h4>
              <p style={{ fontSize: 13, color: "var(--trella-text-subtle)", lineHeight: 1.6 }}>
                Bằng cách quản lý chặt chẽ cách thức các task thay đổi trạng thái, bạn giúp nhóm hoạt động hiệu quả hơn và dữ liệu báo cáo luôn nhất quán.
              </p>
              
              <div style={{ padding: 12, borderRadius: 6, background: "var(--trella-surface-sunken)", border: "1px solid var(--trella-border)", fontSize: 11, color: "var(--trella-text-subtle)" }}>
                <strong style={{ display: "block", marginBottom: 4, color: "var(--trella-text)" }}>Mẹo thao tác:</strong>
                Kéo từ điểm tròn bên phải của một trạng thái, thả vào trạng thái đích để tạo một đường chuyển tiếp nhiệm vụ mới.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
