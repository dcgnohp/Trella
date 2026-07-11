'use client'

import * as React from 'react'
import type { KnowledgeDoc, KnowledgeCollection } from './knowledge-center-client'
import type { useKnowledgePrefs } from './use-knowledge-prefs'
import { KnowledgeSearchBar } from './knowledge-search-bar'
import { KnowledgeCard } from './knowledge-card'
import { KnowledgeTable } from './knowledge-table'

type UserPrefs = ReturnType<typeof useKnowledgePrefs>

interface Props {
  workspaceId: string
  docs: KnowledgeDoc[]
  collections: KnowledgeCollection[]
  navFilter: string
  searchQuery: string
  filterCollection: string | null
  filterSourceType: string | null
  sortBy: 'updated' | 'created' | 'title'
  viewMode: 'list' | 'grid'
  userPrefs: UserPrefs
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onNewDoc: () => void
  onSearchChange: (q: string) => void
  onCollectionChange: (id: string | null) => void
  onSourceTypeChange: (type: string | null) => void
  onSortChange: (sort: 'updated' | 'created' | 'title') => void
  onViewModeChange: (mode: 'list' | 'grid') => void
}

const TABS = ['All Docs', 'Created by me', 'Shared with me'] as const
type Tab = typeof TABS[number]

export function KnowledgeMain({
  docs, collections, viewMode, userPrefs,
  searchQuery, filterCollection, filterSourceType, sortBy,
  onSelect, onEdit, onNewDoc,
  onSearchChange, onCollectionChange, onSourceTypeChange, onSortChange, onViewModeChange,
}: Props) {
  const [activeTab, setActiveTab] = React.useState<Tab>('All Docs')
  const [pinnedPage, setPinnedPage] = React.useState(0)
  const PINNED_PAGE_SIZE = 4

  const pinnedDocs = docs.filter(d => userPrefs.getPref(d.id).isPinned)
  const totalPinnedPages = Math.ceil(pinnedDocs.length / PINNED_PAGE_SIZE)
  const visiblePinned = pinnedDocs.slice(pinnedPage * PINNED_PAGE_SIZE, (pinnedPage + 1) * PINNED_PAGE_SIZE)

  const collectionMap = React.useMemo(() => {
    const m: Record<string, KnowledgeCollection> = {}
    collections.forEach(c => { m[c.id] = c })
    return m
  }, [collections])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-border">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <span>📖</span> Docs
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Centralize your project knowledge. Write, organize and share.
        </p>
      </div>

      {/* Search + filters */}
      <div className="px-6 pt-3 pb-2 flex-shrink-0">
        <KnowledgeSearchBar
          searchQuery={searchQuery}
          filterCollection={filterCollection}
          filterSourceType={filterSourceType}
          sortBy={sortBy}
          viewMode={viewMode}
          collections={collections}
          onSearchChange={onSearchChange}
          onCollectionChange={onCollectionChange}
          onSourceTypeChange={onSourceTypeChange}
          onSortChange={onSortChange}
          onViewModeChange={onViewModeChange}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Pinned Docs section — horizontal carousel */}
        {pinnedDocs.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span>📌</span> Pinned Docs
              </h2>
              {totalPinnedPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPinnedPage(p => Math.max(0, p - 1))}
                    disabled={pinnedPage === 0}
                    className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 text-sm"
                    aria-label="Previous pinned"
                  >&lt;</button>
                  <button
                    onClick={() => setPinnedPage(p => Math.min(totalPinnedPages - 1, p + 1))}
                    disabled={pinnedPage >= totalPinnedPages - 1}
                    className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 text-sm"
                    aria-label="Next pinned"
                  >&gt;</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visiblePinned.map(doc => (
                <KnowledgeCard
                  key={doc.id}
                  doc={doc}
                  collection={doc.collectionId ? collectionMap[doc.collectionId] : undefined}
                  pref={userPrefs.getPref(doc.id)}
                  onPin={() => userPrefs.getPref(doc.id).isPinned ? userPrefs.unpin(doc.id) : userPrefs.pin(doc.id)}
                  onFavorite={() => userPrefs.getPref(doc.id).isFavorite ? userPrefs.unfavorite(doc.id) : userPrefs.favorite(doc.id)}
                  onOpen={() => onSelect(doc.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mb-3 border-b border-border">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
                ${activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Table */}
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <span className="text-4xl">📭</span>
            <p className="text-sm">No documents found</p>
            <button
              onClick={onNewDoc}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Create your first doc
            </button>
          </div>
        ) : (
          <KnowledgeTable
            docs={docs}
            collections={collections}
            userPrefs={userPrefs}
            sortBy={sortBy}
            onSelect={onSelect}
            onEdit={onEdit}
            onPin={(id) => userPrefs.getPref(id).isPinned ? userPrefs.unpin(id) : userPrefs.pin(id)}
            onFavorite={(id) => userPrefs.getPref(id).isFavorite ? userPrefs.unfavorite(id) : userPrefs.favorite(id)}
          />
        )}
      </div>
    </div>
  )
}
