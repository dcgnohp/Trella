'use client'

import * as React from 'react'
import type { KnowledgeCollection } from './knowledge-center-client'

interface Props {
  workspaceId: string
  navFilter: string
  onNavChange: (filter: string) => void
  collections: KnowledgeCollection[]
  onNewDoc: () => void
}

const NAV_ITEMS = [
  { value: 'all',       icon: '📄', label: 'All Docs',   count: null },
  { value: 'mine',      icon: '👤', label: 'My Docs',    count: null },
  { value: 'recent',    icon: '🕐', label: 'Recent',     count: null },
  { value: 'favorites', icon: '⭐', label: 'Favorites',  count: null },
  { value: 'templates', icon: '🗂️', label: 'Templates', count: null },
  { value: 'trash',     icon: '🗑️', label: 'Trash',     count: null },
]

const TASK_DOCS_ITEMS = [
  { value: 'source:TASK', label: 'All Task Docs' },
  { value: 'source:SPRINT_REPORT', label: 'This Sprint' },
  { value: 'source:TASK_MINE', label: 'Assigned to me' },
]

// Colors matching the mockup
const CATEGORY_COLORS: Record<string, string> = {
  'Product':          '#0052CC',
  'Technical Design': '#6554C0',
  'API':              '#00B8D9',
  'Frontend':         '#36B37E',
  'Backend':          '#FF991F',
  'DevOps':           '#172B4D',
  'Business':         '#DE350B',
  'Meeting Notes':    '#5E6C84',
}

export function KnowledgeSidebar({ navFilter, onNavChange, collections, onNewDoc }: Props) {
  return (
    <div className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-muted/30 dark:bg-gray-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Documentation
        </span>
        <button
          onClick={onNewDoc}
          className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-2 py-1 rounded"
        >
          + New Doc
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Main nav */}
        <div className="px-2 mb-4">
          {NAV_ITEMS.map(item => (
            <button
              key={item.value}
              onClick={() => onNavChange(item.value)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left
                ${navFilter === item.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-accent'
                }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>

        {/* CATEGORIES section */}
        <div className="px-2 mb-4">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Categories</span>
          </div>
          {collections.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">No categories yet</p>
          )}
          {collections.map(col => {
            const color = CATEGORY_COLORS[col.name] ?? col.color ?? '#6554C0'
            return (
              <button
                key={col.id}
                onClick={() => onNavChange(`collection:${col.id}`)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left
                  ${navFilter === `collection:${col.id}`
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent'
                  }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="flex-1 truncate">{col.name}</span>
              </button>
            )
          })}
        </div>

        {/* DOCS FROM TASKS section */}
        <div className="px-2">
          <div className="px-2 mb-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Docs from Tasks</span>
          </div>
          {TASK_DOCS_ITEMS.map(item => (
            <button
              key={item.value}
              onClick={() => onNavChange(item.value)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left
                ${navFilter === item.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-accent'
                }`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-muted-foreground/40" />
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
