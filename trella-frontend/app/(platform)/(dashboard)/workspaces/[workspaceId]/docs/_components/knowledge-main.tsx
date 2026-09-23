'use client'

import * as React from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { BookOpen, Pin, FolderOpen } from 'lucide-react'
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
  onNewDoc: (type: 'manual' | 'file') => void
  onOpenModal: (id: string) => void
  onSearchChange: (q: string) => void
  onCollectionChange: (id: string | null) => void
  onSourceTypeChange: (type: string | null) => void
  onSortChange: (sort: 'updated' | 'created' | 'title') => void
  onViewModeChange: (mode: 'list' | 'grid') => void
  onClearTrash?: () => void
}

const TABS = ['All Docs', 'Created by me', 'Shared with me'] as const
type Tab = typeof TABS[number]

export function KnowledgeMain({
  workspaceId, docs, collections, viewMode, userPrefs,
  searchQuery, filterCollection, filterSourceType, sortBy, navFilter,
  onSelect, onEdit, onNewDoc, onOpenModal,
  onSearchChange, onCollectionChange, onSourceTypeChange, onSortChange, onViewModeChange, onClearTrash,
}: Props) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = React.useState<Tab>('All Docs')
  const [pinnedPage, setPinnedPage] = React.useState(0)
  const PINNED_PAGE_SIZE = 4

  const filteredDocs = React.useMemo(() => {
    let result = [...docs]

    // 1. Sidebar Nav Filters (navFilter)
    if (navFilter === 'mine') {
      result = result.filter(d => d.createdBy === user?.id)
    } else if (navFilter === 'favorites') {
      result = result.filter(d => userPrefs.getPref(d.id).isFavorite)
    } else if (navFilter === 'trash') {
      result = result.filter(d => d.isArchived)
    } else if (navFilter.startsWith('collection:')) {
      const colId = navFilter.split(':')[1]
      result = result.filter(d => d.collectionId === colId)
    } else if (navFilter === 'source:TASK') {
      result = result.filter(d => d.sourceType === 'TASK')
    } else if (navFilter === 'source:SPRINT_REPORT') {
      result = result.filter(d => d.sourceType === 'SPRINT_REPORT')
    } else if (navFilter === 'source:TASK_MINE') {
      result = result.filter(d => d.sourceType === 'TASK')
    } else {
      // By default, exclude archived docs from normal views
      result = result.filter(d => !d.isArchived)
    }

    // 2. Tab Filters (activeTab)
    if (activeTab === 'Created by me') {
      result = result.filter(d => d.createdBy === user?.id)
    } else if (activeTab === 'Shared with me') {
      result = result.filter(d => d.createdBy !== user?.id)
    }

    // 3. Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(d => d.title.toLowerCase().includes(q) || (d.content && d.content.toLowerCase().includes(q)))
    }

    // 4. Collection Dropdown Filter
    if (filterCollection) {
      result = result.filter(d => d.collectionId === filterCollection)
    }

    // 5. Source Type Dropdown Filter
    if (filterSourceType) {
      result = result.filter(d => d.sourceType === filterSourceType)
    }

    // 6. Sorting
    result.sort((a, b) => {
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title)
      } else {
        // default: updated
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
    })

    return result
  }, [docs, navFilter, activeTab, searchQuery, filterCollection, filterSourceType, sortBy, user?.id, userPrefs])

  const pinnedDocs = React.useMemo(() => {
    return docs.filter(d => userPrefs.getPref(d.id).isPinned && !d.isArchived)
  }, [docs, userPrefs])

  const totalPinnedPages = Math.ceil(pinnedDocs.length / PINNED_PAGE_SIZE)
  const visiblePinned = pinnedDocs.slice(pinnedPage * PINNED_PAGE_SIZE, (pinnedPage + 1) * PINNED_PAGE_SIZE)

  const [currentPage, setCurrentPage] = React.useState(0)
  const pageSize = 5

  React.useEffect(() => {
    setCurrentPage(0)
  }, [activeTab, navFilter, searchQuery, filterCollection, filterSourceType, sortBy])

  const paginatedDocs = React.useMemo(() => {
    const start = currentPage * pageSize
    return filteredDocs.slice(start, start + pageSize)
  }, [filteredDocs, currentPage])

  const totalPages = Math.ceil(filteredDocs.length / pageSize)

  const collectionMap = React.useMemo(() => {
    const m: Record<string, KnowledgeCollection> = {}
    collections.forEach(c => { m[c.id] = c })
    return m
  }, [collections])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" strokeWidth={1.5} />
            {navFilter === 'trash' ? 'Trash' : 'Docs'}
          </h1>
          {navFilter === 'trash' && (
            <button 
              onClick={() => onClearTrash?.()}
              className="px-3 py-1.5 text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors"
            >
              Empty Trash
            </button>
          )}
        </div>
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
                <Pin className="w-4 h-4 text-primary rotate-45" strokeWidth={1.5} />
                Pinned Docs
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
                  onOpenModal={() => onOpenModal(doc.id)}
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
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <FolderOpen className="w-10 h-10 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm">No documents found</p>
            <button
              onClick={() => onNewDoc('manual')}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Create your first doc
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {paginatedDocs.map(doc => (
                  <KnowledgeCard
                    key={doc.id}
                    doc={doc}
                    collection={doc.collectionId ? collectionMap[doc.collectionId] : undefined}
                    pref={userPrefs.getPref(doc.id)}
                    onPin={() => userPrefs.getPref(doc.id).isPinned ? userPrefs.unpin(doc.id) : userPrefs.pin(doc.id)}
                    onFavorite={() => userPrefs.getPref(doc.id).isFavorite ? userPrefs.unfavorite(doc.id) : userPrefs.favorite(doc.id)}
                    onOpen={() => onSelect(doc.id)}
                    onOpenModal={() => onOpenModal(doc.id)}
                  />
                ))}
              </div>
            ) : (
              <KnowledgeTable
                workspaceId={workspaceId}
                docs={paginatedDocs}
                collections={collections}
                userPrefs={userPrefs}
                sortBy={sortBy}
                onSelect={onSelect}
                onEdit={onEdit}
                onOpenModal={onOpenModal}
                onPin={(id) => userPrefs.getPref(id).isPinned ? userPrefs.unpin(id) : userPrefs.pin(id)}
                onFavorite={(id) => userPrefs.getPref(id).isFavorite ? userPrefs.unfavorite(id) : userPrefs.favorite(id)}
              />
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
                <span className="text-xs text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{currentPage * pageSize + 1}</span> to{' '}
                  <span className="font-medium text-foreground">
                    {Math.min((currentPage + 1) * pageSize, filteredDocs.length)}
                  </span>{' '}
                  of <span className="font-medium text-foreground">{filteredDocs.length}</span> documents
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="px-2.5 py-1.5 rounded border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(idx)}
                      className={`w-8 h-8 rounded text-xs font-semibold flex items-center justify-center border transition-colors
                        ${currentPage === idx
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-foreground hover:bg-accent'
                        }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="px-2.5 py-1.5 rounded border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
