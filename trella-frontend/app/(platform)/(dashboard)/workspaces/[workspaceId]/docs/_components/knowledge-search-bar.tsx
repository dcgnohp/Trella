'use client'

import * as React from 'react'
import { Search, List, Grid } from 'lucide-react'
import type { KnowledgeCollection } from './knowledge-center-client'

const SOURCE_TYPES = [
  { value: 'MANUAL',        label: 'Doc' },
  { value: 'TASK',          label: 'Task Doc' },
  { value: 'SPRINT_REPORT', label: 'Sprint Report' },
  { value: 'MEETING_NOTE',  label: 'Meeting Notes' },
  { value: 'ADR',           label: 'ADR' },
  { value: 'RFC',           label: 'RFC' },
]

interface Props {
  searchQuery: string
  filterCollection: string | null
  filterSourceType: string | null
  sortBy: 'updated' | 'created' | 'title'
  viewMode: 'list' | 'grid'
  collections: KnowledgeCollection[]
  onSearchChange: (q: string) => void
  onCollectionChange: (id: string | null) => void
  onSourceTypeChange: (type: string | null) => void
  onSortChange: (sort: 'updated' | 'created' | 'title') => void
  onViewModeChange: (mode: 'list' | 'grid') => void
}

const selectCls = 'h-8 px-2 text-sm border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary'

export function KnowledgeSearchBar({
  searchQuery, filterCollection, filterSourceType, sortBy, viewMode, collections,
  onSearchChange, onCollectionChange, onSourceTypeChange, onSortChange, onViewModeChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search input */}
      <div className="relative flex-1 min-w-48">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center">
          <Search className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search documents…"
          className="w-full h-8 pl-8 pr-3 text-sm border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Category (collection) filter */}
      <select
        value={filterCollection ?? ''}
        onChange={e => onCollectionChange(e.target.value || null)}
        className={selectCls}
        aria-label="Filter by category"
      >
        <option value="">All Categories</option>
        {collections.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* Type filter */}
      <select
        value={filterSourceType ?? ''}
        onChange={e => onSourceTypeChange(e.target.value || null)}
        className={selectCls}
        aria-label="Filter by type"
      >
        <option value="">All Types</option>
        {SOURCE_TYPES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={sortBy}
        onChange={e => onSortChange(e.target.value as 'updated' | 'created' | 'title')}
        className={selectCls}
        aria-label="Sort by"
      >
        <option value="updated">Sort: Recently updated</option>
        <option value="created">Sort: Created</option>
        <option value="title">Sort: Title A–Z</option>
      </select>

      {/* View mode toggle */}
      <div className="flex border border-border rounded-md overflow-hidden">
        <button
          onClick={() => onViewModeChange('list')}
          title="List view"
          className={`px-2 h-8 text-sm transition-colors flex items-center justify-center ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
        >
          <List className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onViewModeChange('grid')}
          title="Grid view"
          className={`px-2 h-8 text-sm transition-colors flex items-center justify-center ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
        >
          <Grid className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
