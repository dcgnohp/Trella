'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Folder, Kanban, CheckSquare, Maximize2, FileText, ArrowLeft, Star, X, Sparkles } from 'lucide-react'
import { SprintsService, BacklogService } from '@/lib/client'
import { KnowledgeSidebar } from './knowledge-sidebar'
import { KnowledgeMain } from './knowledge-main'
import { KnowledgeInspector } from './knowledge-inspector'
import { KnowledgeEditor } from './knowledge-editor'
import { AiDocSummaryPanel } from './ai-doc-summary'
import { useKnowledgePrefs } from './use-knowledge-prefs'
import { useContributeConversationContext } from '@/lib/ai/conversation-context'

/** Strip HTML tags to plain text for AI summarization (client-side only). */
function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  if (typeof document === 'undefined') return html
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent || el.innerText || '').trim()
}

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
  category?: string | null
  authorName?: string
  authorEmail?: string
  parentId?: string | null
  taskId?: string | null
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
  const router = useRouter()
  const [navFilter, setNavFilter] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterCollection, setFilterCollection] = React.useState<string | null>(null)
  const [filterSourceType, setFilterSourceType] = React.useState<string | null>(null)
  const [sortBy, setSortBy] = React.useState<'updated' | 'created' | 'title'>('updated')
  const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list')
  const [inspectorDocId, setInspectorDocId] = React.useState<string | null>(null)

  const userPrefs = useKnowledgePrefs(workspaceId)

  const queryParams: Record<string, string> = { include_archived: 'true' }
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

  const { data: workspace } = useQuery<{ id: string; name: string }>({
    queryKey: ['workspace-details', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}`)
      if (!res.ok) throw new Error()
      return res.json()
    }
  })

  const queryClient = useQueryClient()
  
  // Upload Preview Modal States
  const [uploadPreview, setUploadPreview] = React.useState<{
    title: string
    content: string
    collectionId?: string | null
    parentId?: string | null
    taskId?: string | null
  } | null>(null)
  const [uploadTab, setUploadTab] = React.useState<'preview' | 'edit'>('preview')

  // Full Document Modal States
  const [modalDocId, setModalDocId] = React.useState<string | null>(null)
  const [modalHistory, setModalHistory] = React.useState<string[]>([])
  const [modalTab, setModalTab] = React.useState<'content' | 'details'>('content')
  const [docSummaryOpen, setDocSummaryOpen] = React.useState(false)

  // Tasks Queries for select dropdowns
  const sprintsQuery = useQuery({
    queryKey: ['workspace-sprints', workspaceId],
    queryFn: () => SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
  })

  const backlogQuery = useQuery({
    queryKey: ['workspace-backlog', workspaceId],
    queryFn: () => BacklogService.Backlog_backlogGetWorkspaceBacklog({ workspaceId }),
  })

  const allTasks = React.useMemo(() => {
    const tasks: any[] = []
    if (sprintsQuery.data) {
      sprintsQuery.data.forEach(s => {
        if (s.tasks) tasks.push(...s.tasks)
      })
    }
    if (backlogQuery.data) {
      tasks.push(...backlogQuery.data)
    }
    return tasks
  }, [sprintsQuery.data, backlogQuery.data])

  // Contribute the currently-open document to the AI chat (payload-mode). Uses
  // the already-loaded doc + client-side plain-text extraction; no extra fetch.
  const activeDoc = React.useMemo(() => {
    const id = modalDocId ?? inspectorDocId
    return id ? docs.find((d) => d.id === id) ?? null : null
  }, [modalDocId, inspectorDocId, docs])
  useContributeConversationContext({
    knowledge: activeDoc
      ? { title: activeDoc.title, summary: htmlToPlainText(activeDoc.content) }
      : undefined,
  })

  const createDocMutation = useMutation({
    mutationFn: async (data: { 
      title: string 
      content: string 
      collectionId?: string | null
      parentId?: string | null
      taskId?: string | null
    }) => {
      const res = await fetch(`/api/knowledge/${workspaceId}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: (newDoc) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['workspace-docs', workspaceId] })
      toast.success("Document created successfully")
      setUploadPreview(null)
      setInspectorDocId(newDoc.id)
    },
    onError: () => toast.error("Failed to create document"),
  })

  const clearTrashMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/knowledge/${workspaceId}/docs/trash/clear`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] })
      toast.success("Trash emptied successfully")
    },
    onError: () => toast.error("Failed to empty trash"),
  })

  const handleNewDoc = (type: 'manual' | 'file') => {
    if (type === 'manual') {
      sessionStorage.removeItem('prefilledDoc')
      router.push(`/workspaces/${workspaceId}/docs/new`)
    } else {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.txt,.md,.html'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (event) => {
          const text = event.target?.result as string
          const title = file.name.replace(/\.[^/.]+$/, "")
          
          let htmlContent = text
          if (file.name.endsWith('.md')) {
            htmlContent = text
              .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
              .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
              .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
              .replace(/^\-\s+(.+)$/gm, '<li>$1</li>')
              .split('\n\n')
              .map(p => {
                const trimmed = p.trim()
                if (trimmed.startsWith('<h') || trimmed.startsWith('<li')) return trimmed
                return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`
              })
              .join('\n')
          } else if (file.name.endsWith('.txt')) {
            htmlContent = text
              .split('\n\n')
              .map(p => `<p>${p.trim().replace(/\n/g, '<br/>')}</p>`)
              .join('\n')
          }
          
          setUploadPreview({ title, content: htmlContent })
        }
        reader.readAsText(file)
      }
      input.click()
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-background dark:bg-gray-900">
      <KnowledgeSidebar
        workspaceId={workspaceId}
        navFilter={navFilter}
        onNavChange={setNavFilter}
        collections={collections}
        onNewDoc={handleNewDoc}
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
        onEdit={(id) => router.push(`/workspaces/${workspaceId}/docs/${id}`)}
        onNewDoc={handleNewDoc}
        onOpenModal={(id) => {
          setModalDocId(id)
          setModalHistory([])
          setModalTab('content')
        }}
        onSearchChange={setSearchQuery}
        onCollectionChange={setFilterCollection}
        onSourceTypeChange={setFilterSourceType}
        onSortChange={setSortBy}
        onViewModeChange={setViewMode}
        onClearTrash={() => clearTrashMutation.mutate()}
      />
      {inspectorDocId && (
        <KnowledgeInspector
          workspaceId={workspaceId}
          workspaceName={workspace?.name}
          docId={inspectorDocId}
          docs={docs}
          collections={collections}
          allTasks={allTasks}
          onClose={() => setInspectorDocId(null)}
          onEdit={(id) => router.push(`/workspaces/${workspaceId}/docs/${id}`)}
          onSelect={setInspectorDocId}
          onOpenModal={(id) => {
            setModalDocId(id)
            setModalHistory([])
            setModalTab('content')
          }}
          userPrefs={userPrefs}
          onFavorite={(id) => userPrefs.getPref(id).isFavorite ? userPrefs.unfavorite(id) : userPrefs.favorite(id)}
        />
      )}

      {/* Upload Preview Modal */}
      {uploadPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setUploadPreview(null)} 
          />
          <div className="relative bg-background dark:bg-gray-900 border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden z-10 transition-all scale-100">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-bold text-foreground">Preview & Edit Uploaded Document</h3>
              <button 
                onClick={() => setUploadPreview(null)}
                className="text-muted-foreground hover:text-foreground p-1 hover:bg-accent rounded"
                title="Close upload preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Document Title</label>
                <input 
                  type="text" 
                  value={uploadPreview.title}
                  onChange={e => setUploadPreview({ ...uploadPreview, title: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                />
              </div>

              {/* Selectors Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Category</label>
                  <select
                    value={uploadPreview.collectionId || ''}
                    onChange={e => setUploadPreview({ ...uploadPreview, collectionId: e.target.value || null })}
                    className="w-full h-8 px-2 text-xs border border-border rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">No collection</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Parent Document</label>
                  <select
                    value={uploadPreview.parentId || ''}
                    onChange={e => setUploadPreview({ ...uploadPreview, parentId: e.target.value || null })}
                    className="w-full h-8 px-2 text-xs border border-border rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">No parent document</option>
                    {docs.filter(d => !d.isArchived).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Linked Task</label>
                  <select
                    value={uploadPreview.taskId || ''}
                    onChange={e => setUploadPreview({ ...uploadPreview, taskId: e.target.value || null })}
                    className="w-full h-8 px-2 text-xs border border-border rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">No linked task</option>
                    {allTasks.map(t => <option key={t.id} value={t.id}>{t.issueKey ? `#${t.issueKey}: ` : ''}{t.title}</option>)}
                  </select>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex gap-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => setUploadTab('preview')}
                  className={`pb-1.5 text-xs font-bold border-b-2 uppercase tracking-wide transition-colors ${uploadTab === 'preview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Visual Preview
                </button>
                <button
                  type="button"
                  onClick={() => setUploadTab('edit')}
                  className={`pb-1.5 text-xs font-bold border-b-2 uppercase tracking-wide transition-colors ${uploadTab === 'edit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Edit HTML/Markdown Source
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-[300px] flex flex-col">
                {uploadTab === 'preview' ? (
                  <div className="flex-1 border border-border rounded-lg p-4 bg-muted/10 overflow-y-auto max-h-[350px]">
                    {uploadPreview.content ? (
                      <div 
                        className="doc-content text-sm text-foreground"
                        dangerouslySetInnerHTML={{ __html: uploadPreview.content }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No preview available</span>
                    )}
                  </div>
                ) : (
                  <textarea 
                    value={uploadPreview.content}
                    onChange={e => setUploadPreview({ ...uploadPreview, content: e.target.value })}
                    className="w-full flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono resize-none"
                    placeholder="No content..."
                  />
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setUploadPreview(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-accent font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createDocMutation.mutate(uploadPreview)}
                disabled={createDocMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 font-medium transition-colors"
              >
                {createDocMutation.isPending ? "Saving..." : "Create Document"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Document Reader Modal */}
      {modalDocId && (() => {
        const activeModalDoc = docs.find(d => d.id === modalDocId)
        if (!activeModalDoc) return null
        
        const modalPref = userPrefs.getPref(activeModalDoc.id)
        const modalCol = activeModalDoc.collectionId ? collections.find(c => c.id === activeModalDoc.collectionId) : null
        const modalAuthorName = activeModalDoc.authorName || activeModalDoc.createdBy.split('@')[0] || 'Unknown'

        // Intercept clicks inside dangerouslySetInnerHTML to load docs modal-side
        const handleModalContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
          const target = e.target as HTMLElement
          const anchor = target.closest('a')
          if (anchor) {
            const href = anchor.getAttribute('href')
            if (href) {
              const docIdMatch = href.match(/docId=([0-9a-fA-F-]+)/)
              if (docIdMatch) {
                e.preventDefault()
                const otherDocId = docIdMatch[1]
                setModalHistory(prev => [...prev, modalDocId])
                setModalDocId(otherDocId)
                setModalTab('content')
              }
            }
          }
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
              onClick={() => setModalDocId(null)} 
            />
            
            {/* Modal Box */}
            <div className="relative bg-background dark:bg-gray-900 border border-border rounded-xl shadow-2xl w-full max-w-4xl flex flex-col h-[85vh] overflow-hidden z-10">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border flex flex-col gap-1.5 flex-shrink-0">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                  {modalHistory.length > 0 && (
                    <button
                      onClick={() => {
                        const nextHistory = [...modalHistory]
                        const prevDocId = nextHistory.pop()
                        setModalHistory(nextHistory)
                        if (prevDocId) setModalDocId(prevDocId)
                      }}
                      className="text-primary hover:underline flex items-center gap-1 mr-2 font-semibold"
                    >
                      ← Back
                    </button>
                  )}
                  <span className="hover:underline hover:text-foreground cursor-pointer font-medium" onClick={() => setModalDocId(null)}>Docs</span>
                  <span>/</span>
                  {modalHistory.map((histId, idx) => {
                    const histDoc = docs.find(d => d.id === histId)
                    return (
                      <React.Fragment key={histId}>
                        <span 
                          className="hover:underline hover:text-foreground cursor-pointer font-medium"
                          onClick={() => {
                            const newHistory = modalHistory.slice(0, idx)
                            setModalHistory(newHistory)
                            setModalDocId(histId)
                          }}
                        >
                          {histDoc?.title || 'Doc'}
                        </span>
                        <span>/</span>
                      </React.Fragment>
                    )
                  })}
                  <span className="text-foreground font-semibold truncate max-w-[250px]">
                    {activeModalDoc.title || 'Untitled'}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-1">
                  <h2 className="text-xl font-bold text-foreground truncate max-w-[80%]">
                    {activeModalDoc.title || 'Untitled'}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => userPrefs.getPref(activeModalDoc.id).isFavorite ? userPrefs.unfavorite(activeModalDoc.id) : userPrefs.favorite(activeModalDoc.id)}
                      className="w-8 h-8 flex items-center justify-center rounded border border-border hover:bg-accent transition-colors"
                      title={modalPref?.isFavorite ? 'Unfavorite' : 'Favorite'}
                    >
                      <Star 
                        className={`w-4 h-4 transition-colors ${modalPref?.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} 
                        strokeWidth={1.5}
                      />
                    </button>
                    <button
                      onClick={() => setDocSummaryOpen(true)}
                      className="h-8 px-3 text-xs font-semibold border border-border hover:bg-accent rounded-lg transition-colors text-foreground inline-flex items-center gap-1.5"
                      title="AI summary — quick read"
                    >
                      <Sparkles className="w-4 h-4 text-primary" />
                      AI Summary
                    </button>
                    <button 
                      onClick={() => { router.push(`/workspaces/${workspaceId}/docs/${activeModalDoc.id}`) }}
                      className="h-8 px-3 text-xs font-semibold border border-border hover:bg-accent rounded-lg transition-colors text-foreground"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => setModalDocId(null)}
                      className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground border border-border hover:bg-accent"
                      title="Close modal"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-border -mb-4 mt-2">
                  <button
                    onClick={() => setModalTab('content')}
                    className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${modalTab === 'content' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    Content
                  </button>
                  <button
                    onClick={() => setModalTab('details')}
                    className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${modalTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    Details
                  </button>
                </div>
              </div>

              {/* Body: document content + optional AI summary side panel */}
              <div className="flex-1 flex overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto p-6" onClick={handleModalContentClick}>
                {modalTab === 'content' ? (
                  activeModalDoc.content ? (
                    <div 
                      className="doc-content text-foreground max-w-none"
                      dangerouslySetInnerHTML={{ __html: activeModalDoc.content }}
                    />
                  ) : (
                    <div className="text-center py-20 text-muted-foreground text-sm">
                      This document has no content.
                    </div>
                  )
                ) : (
                  <div className="max-w-lg flex flex-col gap-4">
                    <div className="grid grid-cols-3 py-2 border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Source Type</span>
                      <span className="col-span-2 text-sm text-foreground font-semibold">{activeModalDoc.sourceType}</span>
                    </div>
                    <div className="grid grid-cols-3 py-2 border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Category</span>
                      <span className="col-span-2 text-sm text-foreground">
                        {activeModalDoc.category || modalCol?.name || <span className="text-muted-foreground font-light italic">—</span>}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 py-2 border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Linked To</span>
                      <span className="col-span-2 text-sm text-foreground">
                        {activeModalDoc.linkedEntityLabel ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                            {activeModalDoc.linkedEntityLabel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-light italic">Project level</span>
                        )}
                      </span>
                    </div>
                    {/* Linked Task */}
                    {activeModalDoc.taskId && (() => {
                      const linkedTask = allTasks.find(t => t.id === activeModalDoc.taskId)
                      const taskLabel = linkedTask ? `${linkedTask.issueKey ? '#' + linkedTask.issueKey + ': ' : ''}${linkedTask.title}` : activeModalDoc.taskId
                      return (
                        <div className="grid grid-cols-3 py-2 border-b border-border">
                          <span className="text-xs font-bold text-muted-foreground uppercase">Task</span>
                          <span className="col-span-2">
                            <button
                              onClick={() => {
                                window.location.href = `/workspaces/${workspaceId}/boards?cardId=${activeModalDoc.taskId}`
                              }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-primary hover:underline"
                            >
                              <CheckSquare className="w-3 h-3" />
                              {taskLabel}
                            </button>
                          </span>
                        </div>
                      )
                    })()}
                    {/* Parent Document */}
                    {activeModalDoc.parentId && (() => {
                      const parentDoc = docs.find(d => d.id === activeModalDoc.parentId)
                      if (!parentDoc) return null
                      return (
                        <div className="grid grid-cols-3 py-2 border-b border-border">
                          <span className="text-xs font-bold text-muted-foreground uppercase">Parent Doc</span>
                          <span className="col-span-2">
                            <button
                              onClick={() => {
                                setModalHistory(prev => [...prev, modalDocId!])
                                setModalDocId(parentDoc.id)
                                setModalTab('content')
                              }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-primary hover:underline"
                            >
                              <FileText className="w-3 h-3" />
                              {parentDoc.title || 'Untitled'}
                            </button>
                          </span>
                        </div>
                      )
                    })()}
                    {/* Sub-documents */}
                    {(() => {
                      const childDocs = docs.filter(d => d.parentId === activeModalDoc.id && !d.isArchived)
                      if (childDocs.length === 0) return null
                      return (
                        <div className="grid grid-cols-3 py-2 border-b border-border">
                          <span className="text-xs font-bold text-muted-foreground uppercase">Sub-docs</span>
                          <div className="col-span-2 flex flex-wrap gap-1.5">
                            {childDocs.map(cd => (
                              <button
                                key={cd.id}
                                onClick={() => {
                                  setModalHistory(prev => [...prev, modalDocId!])
                                  setModalDocId(cd.id)
                                  setModalTab('content')
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-primary hover:underline"
                              >
                                <FileText className="w-3 h-3" />
                                {cd.title || 'Untitled'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                    <div className="grid grid-cols-3 py-2 border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Author</span>
                      <span className="col-span-2 text-sm text-foreground font-semibold">{modalAuthorName}</span>
                    </div>
                    <div className="grid grid-cols-3 py-2 border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Created At</span>
                      <span className="col-span-2 text-sm text-muted-foreground">{new Date(activeModalDoc.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-3 py-2 border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Last Updated</span>
                      <span className="col-span-2 text-sm text-muted-foreground">{new Date(activeModalDoc.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
              {docSummaryOpen && (
                <AiDocSummaryPanel
                  content={htmlToPlainText(activeModalDoc.content)}
                  title={activeModalDoc.title}
                  onClose={() => setDocSummaryOpen(false)}
                />
              )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
