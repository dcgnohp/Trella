"use client";

import { useState } from "react";
import { toast } from "sonner";
import TaskIcon from "@atlaskit/icon/core/task";
import BugIcon from "@atlaskit/icon/core/bug";
import StoryIcon from "@atlaskit/icon/core/story";
import SubtasksIcon from "@atlaskit/icon/core/subtasks";
import AddIcon from "@atlaskit/icon/core/add";
import MinusIcon from "@atlaskit/icon/core/minus";

import type { CustomStatusEmbed } from "@/lib/client";

interface ManageWorkflowModalProps {
  open: boolean;
  onClose: () => void;
  boardName: string;
  customStatuses: CustomStatusEmbed[];
}

const CANONICAL_ORDER: Record<string, number> = {
  PENDING: 0,
  TODO: 1,
  IN_PROGRESS: 2,
  DONE: 3,
};

const CANONICAL_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#FFAB00", text: "#172B4D" },
  TODO: { bg: "#DFE1E6", text: "#172B4D" },
  IN_PROGRESS: { bg: "#0052CC", text: "#FFFFFF" },
  DONE: { bg: "#36B37E", text: "#FFFFFF" },
};

function getStatusColor(status: CustomStatusEmbed): { bg: string; text: string } {
  if (status.canonicalStatus && CANONICAL_COLORS[status.canonicalStatus]) {
    return CANONICAL_COLORS[status.canonicalStatus];
  }
  const bg = status.color ?? "#DFE1E6";
  // simple luminance check: use dark text for light bg
  const hex = bg.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { bg, text: luminance > 0.55 ? "#172B4D" : "#FFFFFF" };
}

function sortStatuses(statuses: CustomStatusEmbed[]): CustomStatusEmbed[] {
  return [...statuses].sort((a, b) => {
    const oa = a.canonicalStatus ? (CANONICAL_ORDER[a.canonicalStatus] ?? 4) : 4;
    const ob = b.canonicalStatus ? (CANONICAL_ORDER[b.canonicalStatus] ?? 4) : 4;
    return oa - ob;
  });
}

// SVG diagram constants
const NODE_W = 120;
const NODE_H = 48;
const NODE_GAP = 60;
const NODE_STEP = NODE_W + NODE_GAP;
const SVG_H = 260;
const START_CX = 40;
const START_CY = 105;
const START_R = 24;
const FIRST_NODE_X = START_CX + START_R + 16;
const NODE_Y = START_CY - NODE_H / 2;

interface WorkflowDiagramProps {
  statuses: CustomStatusEmbed[];
  showLabels: boolean;
  zoom: number;
}

function WorkflowDiagram({ statuses, showLabels, zoom }: WorkflowDiagramProps) {
  const sorted = sortStatuses(statuses);
  const svgWidth = sorted.length * NODE_STEP + FIRST_NODE_X + 80;

  // node x positions
  const nodeXs = sorted.map((_, i) => FIRST_NODE_X + i * NODE_STEP);

  return (
    <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", padding: 40, display: "inline-block" }}>
      <svg width={svgWidth} height={SVG_H} style={{ display: "block" }}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#97A0AF" />
          </marker>
        </defs>

        {/* Arrow: START -> first node */}
        {sorted.length > 0 && (
          <line
            x1={START_CX + START_R}
            y1={START_CY}
            x2={nodeXs[0]}
            y2={START_CY}
            stroke="#97A0AF"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        )}

        {/* Arrows between nodes */}
        {sorted.slice(0, -1).map((_, i) => {
          const x1 = nodeXs[i] + NODE_W;
          const x2 = nodeXs[i + 1];
          const my = START_CY;
          return (
            <g key={`arrow-${i}`}>
              <line x1={x1} y1={my} x2={x2} y2={my} stroke="#97A0AF" strokeWidth={1.5} markerEnd="url(#arrow)" />
              {showLabels && (
                <text x={(x1 + x2) / 2} y={my - 8} textAnchor="middle" fontSize={9} fill="#97A0AF">
                  {"->"}
                </text>
              )}
            </g>
          );
        })}

        {/* START circle */}
        <circle cx={START_CX} cy={START_CY} r={START_R} fill="white" stroke="#5E6C84" strokeWidth={1.5} />
        <text x={START_CX} y={START_CY + 4} textAnchor="middle" fontSize={10} fill="#5E6C84" fontWeight={600}>
          START
        </text>

        {/* Status nodes */}
        {sorted.map((status, i) => {
          const x = nodeXs[i];
          const { bg, text: textColor } = getStatusColor(status);
          const label = status.name.length > 13 ? status.name.slice(0, 12) + "..." : status.name;
          const anyX = x + NODE_W / 2;
          const anyY = NODE_Y + NODE_H + 28;
          return (
            <g key={status.id}>
              <rect x={x} y={NODE_Y} width={NODE_W} height={NODE_H} rx={6} fill={bg} />
              <text x={x + NODE_W / 2} y={NODE_Y + NODE_H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={textColor}>
                {label}
              </text>
              {/* "Any" bubble */}
              <circle cx={anyX} cy={anyY} r={14} fill="white" stroke="#97A0AF" strokeWidth={1} />
              <text x={anyX} y={anyY + 4} textAnchor="middle" fontSize={9} fill="#97A0AF">
                Any
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MinimapSvg({ statuses }: { statuses: CustomStatusEmbed[] }) {
  const sorted = sortStatuses(statuses);
  const n = sorted.length;
  if (n === 0) return null;
  const bw = 28;
  const gap = 8;
  const totalW = n * (bw + gap) + 24;
  const scale = Math.min(1, 130 / totalW);
  return (
    <svg width={160} height={80} style={{ display: "block" }}>
      <g transform={`translate(8,30) scale(${scale})`}>
        {sorted.map((s, i) => {
          const { bg } = getStatusColor(s);
          const x = 16 + i * (bw + gap);
          return (
            <g key={s.id}>
              <rect x={x} y={0} width={bw} height={14} rx={3} fill={bg} opacity={0.8} />
              {i < sorted.length - 1 && (
                <line x1={x + bw} y1={7} x2={x + bw + gap} y2={7} stroke="#97A0AF" strokeWidth={1} />
              )}
            </g>
          );
        })}
      </g>
      <text x={80} y={68} textAnchor="middle" fontSize={8} fill="#97A0AF">
        Minimap
      </text>
    </svg>
  );
}

export function ManageWorkflowModal({ open, onClose, boardName, customStatuses }: ManageWorkflowModalProps) {
  const [showLabels, setShowLabels] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState<"diagram" | "text">("diagram");

  if (!open) return null;

  const sorted = sortStatuses(customStatuses);

  const toolbarBtnBase: React.CSSProperties = {
    height: 32,
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    padding: "0 12px",
    fontSize: 13,
    color: "#5E6C84",
    background: "#FFFFFF",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };

  const tabBtn = (tab: "diagram" | "text"): React.CSSProperties => ({
    height: 28,
    borderRadius: 4,
    padding: "0 10px",
    fontSize: 13,
    border: "none",
    cursor: "pointer",
    background: activeTab === tab ? "#0052CC" : "#F4F5F7",
    color: activeTab === tab ? "#FFFFFF" : "#5E6C84",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          borderBottom: "1px solid #DFE1E6",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#5E6C84" }}>Workflow for </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#172B4D" }}>{boardName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <TaskIcon label="Task" size="small" />
          <BugIcon label="Bug" size="small" />
          <StoryIcon label="Story" size="small" />
          <SubtasksIcon label="Subtasks" size="small" />
        </div>
        <div style={{ flex: 1 }} />
        <button
          disabled
          style={{
            height: 32,
            border: "1px solid #DFE1E6",
            background: "#F4F5F7",
            color: "#97A0AF",
            borderRadius: 4,
            padding: "0 12px",
            fontSize: 13,
            cursor: "not-allowed",
          }}
        >
          Update workflow
        </button>
        <button
          onClick={onClose}
          style={{
            height: 32,
            border: "1px solid #DFE1E6",
            background: "#FFFFFF",
            color: "#172B4D",
            borderRadius: 4,
            padding: "0 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {/* Toolbar */}
      <div
        style={{
          height: 44,
          borderBottom: "1px solid #DFE1E6",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button style={toolbarBtnBase} onClick={() => toast.info("Coming soon")}>
          <AddIcon label="Add" size="small" /> Add status
        </button>
        <button style={toolbarBtnBase} onClick={() => toast.info("Coming soon")}>
          <AddIcon label="Add" size="small" /> Add transition
        </button>
        <div style={{ width: 1, height: 20, background: "#DFE1E6" }} />
        <button style={tabBtn("diagram")} onClick={() => setActiveTab("diagram")}>
          Diagram
        </button>
        <button style={tabBtn("text")} onClick={() => setActiveTab("text")}>
          Text
        </button>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#5E6C84", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          Show transition labels
        </label>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Canvas */}
        <div style={{ flex: 1, overflow: "auto", background: "#F8F9FA", position: "relative" }}>
          {activeTab === "diagram" ? (
            <WorkflowDiagram statuses={customStatuses} showLabels={showLabels} zoom={zoom} />
          ) : (
            <div style={{ padding: 32 }}>
              {sorted.map((s, i) => {
                const { bg, text: textColor } = getStatusColor(s);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: "#97A0AF", minWidth: 20 }}>{i + 1}.</span>
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
                      <span style={{ fontSize: 11, color: "#97A0AF" }}>{s.canonicalStatus}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Minimap */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              width: 160,
              height: 100,
              background: "#FFFFFF",
              border: "1px solid #DFE1E6",
              borderRadius: 4,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MinimapSvg statuses={customStatuses} />
          </div>

          {/* Zoom controls */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#FFFFFF",
              border: "1px solid #DFE1E6",
              borderRadius: 4,
              padding: "4px 12px",
            }}
          >
            <button
              style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: "#172B4D" }}
              onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
              aria-label="Zoom out"
            >
              <MinusIcon label="Zoom out" size="small" />
            </button>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: 80 }}
            />
            <button
              style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: "#172B4D" }}
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
              aria-label="Zoom in"
            >
              <AddIcon label="Zoom in" size="small" />
            </button>
            <span style={{ fontSize: 12, color: "#5E6C84", minWidth: 36, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>

        {/* Right sidebar */}
        <div
          style={{
            width: 280,
            borderLeft: "1px solid #DFE1E6",
            overflowY: "auto",
            padding: 20,
            background: "#FFFFFF",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "#172B4D", marginBottom: 12 }}>
            Power up your team with the right workflow
          </div>
          <p style={{ fontSize: 13, color: "#5E6C84", lineHeight: 1.6, margin: 0 }}>
            Before you map your workflow here, spend some time with your team. Learn what&apos;s
            effective, what&apos;s not, and how to help your team be their best.
          </p>
          {[
            "Follow our guide to mapping a workflow with your team",
            "See how best practices for workflow design",
            "Learn how to manage workflows here",
          ].map((text) => (
            <div
              key={text}
              style={{ color: "#0052CC", fontSize: 13, cursor: "pointer", marginTop: 16 }}
              onClick={() => toast.info("Coming soon")}
            >
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
