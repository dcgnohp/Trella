"use client";

import React, { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import SearchIcon from "@atlaskit/icon/core/search";
import FilterIcon from "@atlaskit/icon/core/filter";
import SettingsIcon from "@atlaskit/icon/core/settings";
import ChevronDownIcon from "@atlaskit/icon/core/chevron-down";
import ShowMoreHorizontalIcon from "@atlaskit/icon/core/show-more-horizontal";
import type { BoardPublic, ProjectMemberPublic, CustomStatusEmbed } from "@/lib/client";
import { FilterPanel, type FilterState, isFiltersActive } from "./filter-panel";

interface BoardHeaderProps {
  board: BoardPublic;
  workspaceId: string;
  canManageStatuses?: boolean;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  projectMembers: ProjectMemberPublic[];
  customStatuses: CustomStatusEmbed[];
  currentUserId: string | null;
  onStartStandup: () => void;
  onManageWorkflow: () => void;
  isScrum?: boolean;
  onCompleteSprint?: () => void;
}

export const BoardHeader = ({
  board,
  workspaceId,
  canManageStatuses,
  filters,
  onFiltersChange,
  projectMembers,
  customStatuses,
  currentUserId,
  onStartStandup,
  onManageWorkflow,
  isScrum,
  onCompleteSprint,
}: BoardHeaderProps) => {
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const filterActive = isFiltersActive(filters);

  const btnBase: React.CSSProperties = {
    background: "none", border: "1px solid #DFE1E6", borderRadius: 4,
    padding: "0 12px", height: 32, color: "#5E6C84", fontSize: 13,
    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 20px", flexShrink: 0,
      backgroundColor: "transparent", borderBottom: "1px solid #DFE1E6",
    }}>
      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        backgroundColor: "#FFFFFF", border: "1px solid #DFE1E6",
        borderRadius: 4, padding: "0 10px", height: 32,
      }}>
        <span style={{ color: "#97A0AF", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <SearchIcon label="" size="small" />
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search board"
          style={{ background: "none", border: "none", outline: "none", color: "#172B4D", fontSize: 13, width: 140 }}
        />
      </div>

      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "linear-gradient(135deg,#0052CC,#6554C0)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "white", cursor: "pointer", flexShrink: 0,
      }}>KS</div>

      {/* Filter — with relative wrapper so panel anchors here */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setFilterOpen(v => !v)}
          style={{
            ...btnBase,
            borderColor: filterActive ? "#0052CC" : "#DFE1E6",
            color: filterActive ? "#0052CC" : "#5E6C84",
            background: filterActive ? "rgba(0,82,204,0.06)" : "none",
          }}
        >
          <span style={{ display: "flex", alignItems: "center" }}><FilterIcon label="" size="small" /></span>
          Filter
          {filterActive && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: "50%", background: "#0052CC",
              color: "#FFFFFF", fontSize: 10, fontWeight: 700,
            }}>
              {[filters.onlyMine ? 1 : 0, filters.assigneeId ? 1 : 0, filters.statusIds.length > 0 ? 1 : 0, filters.typeFilter ? 1 : 0].reduce((a, b) => a + b, 0)}
            </span>
          )}
        </button>

        {filterOpen && (
          <FilterPanel
            filters={filters}
            onChange={onFiltersChange}
            projectMembers={projectMembers}
            customStatuses={customStatuses}
            currentUserId={currentUserId}
            onClose={() => setFilterOpen(false)}
          />
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Status Mapping link */}
      {canManageStatuses && (
        <Link href={`/workspaces/${workspaceId}/settings/statuses`} style={{ textDecoration: "none" }}>
          <button style={btnBase}>
            <span style={{ display: "flex", alignItems: "center" }}><SettingsIcon label="" size="small" /></span>
            Status Mapping
          </button>
        </Link>
      )}

      {/* Complete sprint (scrum only) */}
      {isScrum && (
        <button
          onClick={onCompleteSprint ?? (() => toast.info("Complete sprint coming soon"))}
          style={{ background: "#0052CC", color: "white", border: "none", borderRadius: 4, padding: "0 14px", height: 32, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          Complete sprint
        </button>
      )}

      {/* Group */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setGroupOpen(v => !v)}
          style={btnBase}
        >
          Group <span style={{ display: "flex", alignItems: "center" }}><ChevronDownIcon label="" size="small" /></span>
        </button>
        {groupOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setGroupOpen(false)} />
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
              background: "#FFFFFF", border: "1px solid #DFE1E6", borderRadius: 6,
              boxShadow: "0 8px 24px rgba(9,30,66,0.15)", padding: "4px 0", minWidth: 160,
            }}>
              {["None", "Assignee", "Priority", "Type"].map(opt => (
                <button
                  key={opt}
                  onClick={() => { setGroupOpen(false); if (opt !== "None") toast.info(`Group by ${opt} coming soon`); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 14px", fontSize: 13, color: "#172B4D",
                    background: "none", border: "none", cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(9,30,66,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* More ··· */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setMoreOpen(v => !v)}
          style={{ ...btnBase, padding: "0 10px" }}
        >
          <ShowMoreHorizontalIcon label="More" size="small" />
        </button>
        {moreOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setMoreOpen(false)} />
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
              background: "#FFFFFF", border: "1px solid #DFE1E6", borderRadius: 6,
              boxShadow: "0 8px 24px rgba(9,30,66,0.15)", padding: "4px 0", minWidth: 180,
            }}>
              <MoreItem label="Start standup" onClick={() => { setMoreOpen(false); onStartStandup(); }} />
              <MoreItem label="Manage workflow" onClick={() => { setMoreOpen(false); onManageWorkflow(); }} />
              <MoreItem label="Edit sprint" onClick={() => { setMoreOpen(false); toast.info("Edit sprint coming soon"); }} />
              <MoreItem label="Configure board" onClick={() => { setMoreOpen(false); toast.info("Configure board coming soon"); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function MoreItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "8px 14px", fontSize: 13, color: "#172B4D",
        background: "none", border: "none", cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(9,30,66,0.04)")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      {label}
    </button>
  );
}
