"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Controls,
  Background,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import TaskIcon from "@atlaskit/icon/core/task";
import CrossIcon from "@atlaskit/icon/core/cross";
import { WorkflowsService, type CustomStatusEmbed } from "@/lib/client";

interface ViewWorkflowModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  currentStatusId?: string | null;
  customStatuses: CustomStatusEmbed[];
  onEditClick?: () => void;
}

const CANONICAL_ORDER: Record<string, number> = {
  PENDING: 0,
  TODO: 1,
  IN_PROGRESS: 2,
  DONE: 3,
};

export const STATUS_LOZENGE_COLORS: Record<string, { bg: string; text: string }> = {
  TODO: { bg: "#F4F5F7", text: "#42526E" },
  IN_PROGRESS: { bg: "#DEEBFF", text: "#0747A6" },
  DONE: { bg: "#E3FCEF", text: "#006644" },
  PENDING: { bg: "#FFF0B3", text: "#172B4D" },
};

export function getStatusLozengeStyle(canonical?: string | null, color?: string | null) {
  const upper = (canonical ?? "").toUpperCase();
  if (STATUS_LOZENGE_COLORS[upper]) return STATUS_LOZENGE_COLORS[upper];
  if (color) {
    return { bg: color + "1E", text: color };
  }
  return STATUS_LOZENGE_COLORS.TODO;
}

// React Flow custom node: Any (wildcard transition)
const AnyNodeComponent = () => {
  return (
    <div
      style={{
        padding: "2px 8px",
        borderRadius: 12,
        background: "var(--trella-surface-selected)",
        color: "var(--trella-text-subtle)",
        fontSize: 10,
        fontWeight: 700,
        border: "1px solid var(--trella-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      Any
      <Handle type="source" position={Position.Right} style={{ top: "50%", right: -4, opacity: 0 }} />
    </div>
  );
};

// React Flow custom node: Start node
const StartNodeComponent = () => {
  return (
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: "50%",
        background: "var(--trella-surface-sunken)",
        border: "2px solid var(--trella-text-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 800,
        color: "var(--trella-text)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      START
      <Handle type="source" position={Position.Right} style={{ top: "50%", right: -4, opacity: 0 }} />
    </div>
  );
};

// React Flow custom node: Status representation
const StatusNodeComponent = ({ data }: any) => {
  const { name, bg, text, isCurrent } = data;
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRadius: 3,
        background: bg,
        color: text,
        border: isCurrent ? "2px solid #0052CC" : "1px solid var(--trella-border)",
        boxShadow: isCurrent ? "0 0 0 2px rgba(0,82,204,0.2)" : "0 1px 3px rgba(0,0,0,0.08)",
        minWidth: 110,
        textAlign: "center",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        position: "relative",
      }}
    >
      {name}
      <Handle type="target" position={Position.Left} style={{ top: "50%", left: -4, opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ top: "50%", right: -4, opacity: 0 }} />
    </div>
  );
};

const nodeTypes = {
  statusNode: StatusNodeComponent,
  startNode: StartNodeComponent,
  anyNode: AnyNodeComponent,
};

export function ViewWorkflowModal({
  open,
  onClose,
  workspaceId,
  currentStatusId,
  customStatuses,
  onEditClick,
}: ViewWorkflowModalProps) {
  const [showLabels, setShowLabels] = useState(false);

  // Fetch workflows
  const workflowsQuery = useQuery({
    queryKey: ["workflows", workspaceId],
    queryFn: () => WorkflowsService.Workflows_workflowsListWorkflows({ workspaceId }),
    enabled: open && !!workspaceId,
  });

  const activeWorkflow = useMemo(() => {
    return workflowsQuery.data?.find((w) => w.isActive) || workflowsQuery.data?.[0];
  }, [workflowsQuery.data]);

  // Fetch workflow transitions
  const workflowDetailQuery = useQuery({
    queryKey: ["workflow", activeWorkflow?.id],
    queryFn: () => WorkflowsService.Workflows_workflowsGetWorkflow({ workflowId: activeWorkflow!.id }),
    enabled: open && !!activeWorkflow?.id,
  });

  const currentStatusObj = useMemo(() => {
    return customStatuses.find((s) => s.id === currentStatusId);
  }, [customStatuses, currentStatusId]);

  const transitions = workflowDetailQuery.data?.transitions || [];
  
  // Pre-calculate valid target statuses from current status
  const validTargets = useMemo(() => {
    const validIds = transitions
      .filter((t) => t.fromStatusId === currentStatusId || t.fromStatusId === null)
      .map((t) => t.toStatusId);
    return customStatuses.filter((s) => s.id !== currentStatusId && validIds.includes(s.id));
  }, [transitions, currentStatusId, customStatuses]);

  // Build react-flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    if (!open || customStatuses.length === 0) return { nodes: [], edges: [] };

    const nodesList: Node[] = [];
    const edgesList: Edge[] = [];

    // 1. Add Start node
    nodesList.push({
      id: "start",
      type: "startNode",
      position: { x: 40, y: 150 },
      data: {},
    });

    // 2. Map status nodes (wrapped in grid to be large and highly readable)
    const sorted = [...customStatuses].sort((a, b) => {
      const oa = a.canonicalStatus ? (CANONICAL_ORDER[a.canonicalStatus] ?? 4) : 4;
      const ob = b.canonicalStatus ? (CANONICAL_ORDER[b.canonicalStatus] ?? 4) : 4;
      return oa - ob;
    });

    const colCount = Math.min(4, sorted.length); // Max 4 nodes horizontally, wrap below to prevent tiny scale
    const statusNodes: Node[] = sorted.map((s, i) => {
      const colors = getStatusLozengeStyle(s.canonicalStatus, s.color);
      const isCurrent = s.id === currentStatusId;
      const row = Math.floor(i / colCount);
      const col = i % colCount;
      return {
        id: s.id,
        type: "statusNode",
        position: { x: 160 + col * 240, y: 150 + row * 160 },
        data: {
          name: s.name,
          bg: colors.bg,
          text: colors.text,
          isCurrent,
        },
      };
    });

    nodesList.push(...statusNodes);

    // Identify first status (typically TODO canonical or first in list)
    const initialStatusId = sorted.find(s => s.canonicalStatus === "TODO")?.id || sorted[0]?.id;

    // 3. Map transitions to edges
    transitions.forEach((t) => {
      if (t.fromStatusId === null) {
        // Wildcard transition (Any)
        const anyNodeId = `any-${t.toStatusId}`;
        if (!nodesList.some((n) => n.id === anyNodeId)) {
          const targetNode = statusNodes.find((n) => n.id === t.toStatusId);
          if (targetNode) {
            nodesList.push({
              id: anyNodeId,
              type: "anyNode",
              position: { x: targetNode.position.x - 65, y: targetNode.position.y + 8 },
              data: {},
            });
            edgesList.push({
              id: `edge-${anyNodeId}`,
              source: anyNodeId,
              target: t.toStatusId,
              markerEnd: { type: MarkerType.ArrowClosed, color: "var(--trella-text-subtle)" },
              style: { stroke: "var(--trella-border)", strokeWidth: 1.5 },
            });
          }
        }

        // Draw arrow from START if it targets initial status
        if (t.toStatusId === initialStatusId) {
          edgesList.push({
            id: `start-to-${t.toStatusId}`,
            source: "start",
            target: t.toStatusId,
            markerEnd: { type: MarkerType.ArrowClosed, color: "var(--trella-text-subtle)" },
            style: { stroke: "var(--trella-border)", strokeWidth: 1.5 },
            label: showLabels ? "Create" : undefined,
            labelStyle: { fontSize: 8, fill: "var(--trella-text-subtlest)", fontWeight: 600 },
          });
        }
      } else {
        // Direct transition
        edgesList.push({
          id: `edge-${t.id}`,
          source: t.fromStatusId,
          target: t.toStatusId,
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--trella-text-subtle)" },
          style: { stroke: "var(--trella-border)", strokeWidth: 1.5 },
          label: showLabels ? t.name : undefined,
          labelStyle: { fontSize: 8, fill: "var(--trella-text-subtlest)", fontWeight: 600 },
        });
      }
    });

    return { nodes: nodesList, edges: edgesList };
  }, [customStatuses, transitions, currentStatusId, showLabels, open]);

  if (!open) return null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Premium ADS blur backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          backgroundColor: "rgba(9, 30, 66, 0.45)",
          backdropFilter: "blur(4px)",
          transition: "backdrop-filter 0.2s ease, background-color 0.2s ease",
        }}
      />

      {/* Centered Modal Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          width: "95vw",
          maxWidth: 1200,
          height: "85vh",
          backgroundColor: "var(--trella-surface)",
          border: "1px solid var(--trella-border)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(9,30,66,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--trella-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#0052CC", display: "flex", alignItems: "center" }}>
              <TaskIcon label="" size="medium" />
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--trella-text)" }}>
              Task workflow
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--trella-text-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-sunken)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <CrossIcon label="Close" size="small" />
          </button>
        </div>

        {/* Status lozenges details block */}
        <div
          style={{
            padding: "16px 24px 12px",
            backgroundColor: "var(--trella-surface-sunken)",
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            fontSize: 12,
            borderBottom: "1px solid var(--trella-border)",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "var(--trella-text-subtle)", marginBottom: 6 }}>
              Current status
            </div>
            {currentStatusObj ? (
              <span
                style={{
                  ...getStatusLozengeStyle(currentStatusObj.canonicalStatus, currentStatusObj.color),
                  padding: "3px 8px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {currentStatusObj.name}
              </span>
            ) : (
              <span style={{ color: "var(--trella-text-subtlest)" }}>None</span>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 600, color: "var(--trella-text-subtle)", marginBottom: 6 }}>
              This work item can be moved to
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {validTargets.length > 0 ? (
                validTargets.map((s) => {
                  const colors = getStatusLozengeStyle(s.canonicalStatus, s.color);
                  return (
                    <span
                      key={s.id}
                      style={{
                        ...colors,
                        padding: "3px 8px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      {s.name}
                    </span>
                  );
                })
              ) : (
                <span style={{ color: "var(--trella-text-subtlest)", fontSize: 11, fontStyle: "italic" }}>
                  No available transitions
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Labels control */}
        <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--trella-text)", borderBottom: "1px solid var(--trella-border)" }}>
          <input
            type="checkbox"
            id="show-transition-labels"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <label htmlFor="show-transition-labels" style={{ cursor: "pointer", userSelect: "none" }}>
            Show transition labels
          </label>
        </div>

        {/* Diagram Canvas */}
        <div style={{ flex: 1, position: "relative", backgroundColor: "var(--trella-surface-sunken)" }}>
          {workflowDetailQuery.isLoading ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--trella-text-subtle)" }}>
              Loading workflow diagram...
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
              zoomOnScroll={true}
              panOnDrag={true}
            >
              <Background color="var(--trella-border)" gap={16} />
              <Controls showInteractive={false} style={{ bottom: 16, right: 16, display: "flex", flexDirection: "row", gap: 4 }} />
            </ReactFlow>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--trella-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {onEditClick && (
            <button
              onClick={onEditClick}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 4,
                border: "1px solid var(--trella-border)",
                backgroundColor: "var(--trella-surface)",
                color: "var(--trella-text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--trella-surface-selected)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Edit Workflow
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 4,
              border: "none",
              backgroundColor: "var(--trella-text)",
              color: "var(--trella-surface)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
