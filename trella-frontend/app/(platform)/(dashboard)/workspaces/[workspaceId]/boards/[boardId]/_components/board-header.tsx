"use client";

import React, { useState } from "react";
import Link from "next/link";
import SearchIcon from '@atlaskit/icon/core/search';
import FilterIcon from '@atlaskit/icon/core/filter';
import SettingsIcon from '@atlaskit/icon/core/settings';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import type { BoardPublic } from "@/lib/client";

interface BoardHeaderProps {
  board: BoardPublic;
  workspaceId: string;
  canManageStatuses?: boolean;
}

export const BoardHeader = ({ board, workspaceId, canManageStatuses }: BoardHeaderProps) => {
  const [search, setSearch] = useState('');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 20px',
      flexShrink: 0,
      backgroundColor: 'transparent',
      borderBottom: '1px solid #DFE1E6',
    }}>
      {/* Search board */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 4, padding: '0 10px', height: 32,
      }}>
        <span style={{ color: '#97A0AF', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <SearchIcon label="" size="small" />
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search board"
          style={{ background: 'none', border: 'none', outline: 'none', color: '#172B4D', fontSize: 13, width: 140 }}
        />
      </div>

      {/* Avatar filter */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(135deg,#0052CC,#6554C0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'white', cursor: 'pointer', flexShrink: 0,
      }}>KS</div>

      {/* Filter */}
      <button style={{
        background: 'none',
        border: '1px solid #DFE1E6',
        borderRadius: 4, padding: '0 12px', height: 32,
        color: '#5E6C84', fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ display: 'flex', alignItems: 'center' }}><FilterIcon label="" size="small" /></span> Filter
      </button>

      <div style={{ flex: 1 }} />

      {/* Status Mapping link — only for ADMIN/OWNER */}
      {canManageStatuses && (
        <Link
          href={`/workspaces/${workspaceId}/settings/statuses`}
          style={{ textDecoration: 'none' }}
        >
          <button style={{
            background: 'none', border: '1px solid #DFE1E6',
            borderRadius: 4, padding: '0 12px', height: 32,
            color: '#5E6C84', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ display: 'flex', alignItems: 'center' }}><SettingsIcon label="" size="small" /></span> Status Mapping
          </button>
        </Link>
      )}

      {/* Complete sprint (scrum only) */}
      <button style={{
        background: '#0052CC', color: 'white', border: 'none',
        borderRadius: 4, padding: '0 14px', height: 32,
        fontSize: 13, fontWeight: 500, cursor: 'pointer',
      }}>
        Complete sprint
      </button>

      {/* Group */}
      <button style={{
        background: 'none', border: '1px solid #DFE1E6',
        borderRadius: 4, padding: '0 12px', height: 32,
        color: '#5E6C84', fontSize: 13, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        Group <span style={{ display: 'flex', alignItems: 'center' }}><ChevronDownIcon label="" size="small" /></span>
      </button>

      {/* More */}
      <button style={{
        background: 'none', border: '1px solid #DFE1E6',
        borderRadius: 4, padding: '0 10px', height: 32,
        color: '#5E6C84', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center',
      }}>
        <ShowMoreHorizontalIcon label="More" size="small" />
      </button>
    </div>
  );
};
