"use client";

import React from "react";
import type { ProjectMemberPublic, CustomStatusEmbed } from "@/lib/client";

export interface FilterState {
  onlyMine: boolean;
  assigneeId: string | null;
  statusIds: string[];
  typeFilter: string | null;
}

export const EMPTY_FILTERS: FilterState = {
  onlyMine: false,
  assigneeId: null,
  statusIds: [],
  typeFilter: null,
};

export function isFiltersActive(f: FilterState) {
  return f.onlyMine || !!f.assigneeId || f.statusIds.length > 0 || !!f.typeFilter;
}

interface FilterPanelProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  projectMembers: ProjectMemberPublic[];
  customStatuses: CustomStatusEmbed[];
  currentUserId: string | null;
  onClose: () => void;
}

const TYPES = ["Task", "Bug", "Story", "Subtask"];

const TYPE_COLORS: Record<string, string> = {
  Task: "#0052CC", Bug: "#FF5630", Story: "#64BA3B", Subtask: "#7A869A",
};

export function FilterPanel({ filters, onChange, projectMembers, customStatuses, currentUserId, onClose }: FilterPanelProps) {
  const active = isFiltersActive(filters);

  const toggleStatus = (id: string) => {
    const next = filters.statusIds.includes(id)
      ? filters.statusIds.filter(s => s !== id)
      : [...filters.statusIds, id];
    onChange({ ...filters, statusIds: next });
  };

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={onClose} />

      {/* Panel */}
      <div style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        zIndex: 100,
        backgroundColor: "#FFFFFF",
        border: "1px solid #DFE1E6",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(9,30,66,0.15)",
        width: 280,
        padding: "12px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px 10px", borderBottom: "1px solid #DFE1E6" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#172B4D" }}>Filter</span>
          {active && (
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              style={{ fontSize: 12, color: "#0052CC", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Clear all
            </button>
          )}
        </div>

        <div style={{ padding: "10px 14px 4px" }}>
          {/* Only my issues */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={filters.onlyMine}
              onChange={e => onChange({ ...filters, onlyMine: e.target.checked, assigneeId: e.target.checked ? null : filters.assigneeId })}
              style={{ accentColor: "#0052CC", width: 14, height: 14, cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, color: "#172B4D" }}>Only my issues</span>
          </label>

          {/* Assignee */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7A869A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Assignee
            </div>
            <select
              value={filters.assigneeId ?? ""}
              disabled={filters.onlyMine}
              onChange={e => onChange({ ...filters, assigneeId: e.target.value || null })}
              style={{
                width: "100%", height: 32, border: "1px solid #DFE1E6", borderRadius: 4,
                padding: "0 8px", fontSize: 13, color: "#172B4D", background: filters.onlyMine ? "#F4F5F7" : "#FFFFFF",
                cursor: filters.onlyMine ? "not-allowed" : "pointer", outline: "none",
              }}
            >
              <option value="">All assignees</option>
              {projectMembers.map(m => (
                <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          {customStatuses.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A869A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Status
              </div>
              {customStatuses.map(s => (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={filters.statusIds.includes(s.id)}
                    onChange={() => toggleStatus(s.id)}
                    style={{ accentColor: "#0052CC", width: 14, height: 14, cursor: "pointer" }}
                  />
                  <span style={{
                    display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                    backgroundColor: s.color ?? "#DFE1E6", flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, color: "#172B4D" }}>{s.name}</span>
                </label>
              ))}
            </div>
          )}

          {/* Type */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7A869A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Type
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TYPES.map(t => {
                const active = filters.typeFilter === t;
                return (
                  <button
                    key={t}
                    onClick={() => onChange({ ...filters, typeFilter: active ? null : t })}
                    style={{
                      height: 26, padding: "0 10px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                      border: `1px solid ${active ? TYPE_COLORS[t] : "#DFE1E6"}`,
                      background: active ? TYPE_COLORS[t] + "18" : "#FFFFFF",
                      color: active ? TYPE_COLORS[t] : "#5E6C84",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
