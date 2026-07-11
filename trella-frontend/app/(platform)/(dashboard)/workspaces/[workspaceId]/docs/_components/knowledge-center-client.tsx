'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { KnowledgeSidebar } from './knowledge-sidebar'
import { KnowledgeMain } from './knowledge-main'
import { KnowledgeInspector } from './knowledge-inspector'
import { KnowledgeEditor } from './knowledge-editor'
import { useKnowledgePrefs } from './use-knowledge-prefs'

export interface KnowledgeDoc {
  id: string
  title: string
  content: string | null
  sourceType: string
  collectionId: string | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  linkedEntityLabel: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  isArchived: boolean
}

export interface KnowledgeCollection {
  id: string
  name: string
  color: string | null
}

async function fetchDocs(workspaceId: string, params: Record<string, string>): Promise<KnowledgeDoc[]> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/knowledge/${workspaceId}/docs${qs ? `?${qs}` : ''}`, { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

async function fetchCollections(workspaceId: string): Promise<KnowledgeCollection[]> {
  const res = await fetch(`/api/knowledge/${workspaceId}/collections`, { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

interface Props {
  workspaceId: string
}

export function KnowledgeCenterClient({ workspaceId }: Props) {
  const [navFilter, setNavFilter] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterCollection, setFilterCollection] = React.useState<string | null>(null)
  const [filterSourceType, setFilterSourceType] = React.useState<string | null>(null)
  const [sortBy, setSortBy] = React.useState<'updated' | 'created' | 'title'>('updated')
  const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list')
  const [inspectorDocId, setInspectorDocId] = React.useState<string | null>(null)
  const [editorDocId, setEditorDocId] = React.useState<string | null | undefined>(undefined)

  const userPrefs = useKnowledgePrefs(workspaceId)

  const queryParams: Record<string, string> = {}
  if (searchQuery) queryParams.q = searchQuery
  if (filterCollection) queryParams.collectionId = filterCollection
  if (filterSourceType) queryParams.sourceType = filterSourceType
  if (sortBy) queryParams.sortBy = sortBy
  if (navFilter && navFilter !== 'all') queryParams.nav = navFilter

  const { data: docs = [] } = useQuery<KnowledgeDoc[]>({
    queryKey: ['knowledge-docs', workspaceId, queryParams],
    queryFn: () => fetchDocs(workspaceId, queryParams),
  })

  const { data: collections = [] } = useQuery<KnowledgeCollection[]>({
    queryKey: ['knowledge-collections', workspaceId],
    queryFn: () => fetchCollections(workspaceId),
  })

  // editorDocId === undefined means "not in editor mode"
  // editorDocId === null means "new doc"
  // editorDocId === string means "editing existing doc"
  const inEditor = editorDocId !== undefined

  if (inEditor) {
    return (
      <KnowledgeEditor
        workspaceId={workspaceId}
        docId={editorDocId ?? null}
        collections={collections}
        onBack={() => setEditorDocId(undefined)}
        onSaved={(id) => { setEditorDocId(undefined); setInspectorDocId(id) }}
      />
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-background dark:bg-gray-900">
      <KnowledgeSidebar
        workspaceId={workspaceId}
        navFilter={navFilter}
        onNavChange={setNavFilter}
        collections={collections}
        onNewDoc={() => setEditorDocId(null)}
      />
      <KnowledgeMain
        workspaceId={workspaceId}
        docs={docs}
        collections={collections}
        navFilter={navFilter}
        searchQuery={searchQuery}
        filterCollection={filterCollection}
        filterSourceType={filterSourceType}
        sortBy={sortBy}
        viewMode={viewMode}
        userPrefs={userPrefs}
        onSelect={setInspectorDocId}
        onEdit={(id) => setEditorDocId(id)}
        onNewDoc={() => setEditorDocId(null)}
        onSearchChange={setSearchQuery}
        onCollectionChange={setFilterCollection}
        onSourceTypeChange={setFilterSourceType}
        onSortChange={setSortBy}
        onViewModeChange={setViewMode}
      />
      {inspectorDocId && (
        <KnowledgeInspector
          workspaceId={workspaceId}
          docId={inspectorDocId}
          docs={docs}
          collections={collections}
          onClose={() => setInspectorDocId(null)}
          onEdit={(id) => setEditorDocId(id)}
          userPrefs={userPrefs}
          onFavorite={userPrefs.favorite}
        />
      )}
    </div>
  )
}
