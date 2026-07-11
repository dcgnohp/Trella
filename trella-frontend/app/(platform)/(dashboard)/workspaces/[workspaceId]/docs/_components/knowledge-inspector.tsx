'use client'

import * as React from 'react'
import { Folder, Kanban, CheckSquare, Link2, FileText, Maximize2, Star, Link, X } from 'lucide-react'
import type { KnowledgeDoc, KnowledgeCollection } from './knowledge-center-client'
import type { useKnowledgePrefs } from './use-knowledge-prefs'
import { getSourceType } from './source-type-registry'
import { LinkedEntityBadge } from './knowledge-relationship'

function initials(str: string): string {
  return str.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
}

function avatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

function timeAgo(iso: string) {
  const seconds = Math.floor((new Date().getTime() - new Date(iso).getTime()) / 1000)
  if (seconds < 0) return 'just now'
  let interval = seconds / 31536000
  if (interval > 1) return Math.floor(interval) + ' years ago'
  interval = seconds / 2592000
  if (interval > 1) return Math.floor(interval) + ' months ago'
  interval = seconds / 86400
  if (interval > 1) return Math.floor(interval) + ' days ago'
  interval = seconds / 3600
  if (interval > 1) return Math.floor(interval) + ' hours ago'
  interval = seconds / 60
  if (interval > 1) return Math.floor(interval) + ' minutes ago'
  return 'just now'
}

type UserPrefs = ReturnType<typeof useKnowledgePrefs>

interface Props {
  workspaceId: string
  workspaceName?: string
  docId: string
  docs: KnowledgeDoc[]
  collections: KnowledgeCollection[]
  allTasks?: any[]
  onClose: () => void
  onEdit: (id: string) => void
  onSelect: (id: string) => void
  onOpenModal: (id: string) => void
  userPrefs: UserPrefs
  onFavorite: (id: string) => void
}

type InspectorTab = 'preview' | 'details'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function KnowledgeInspector({ workspaceId, workspaceName, docId, docs, collections, allTasks = [], onClose, onEdit, onSelect, onOpenModal, userPrefs, onFavorite }: Props) {
  const [tab, setTab] = React.useState<InspectorTab>('preview')

  const doc = docs.find(d => d.id === docId) ?? null
  const pref = doc ? userPrefs.getPref(doc.id) : null
  const src = doc ? getSourceType(doc.sourceType) : null
  const col = doc?.collectionId ? collections.find(c => c.id === doc.collectionId) : null
  const authorDisplayName = doc ? (doc.authorName || doc.createdBy.split('@')[0] || 'Unknown') : 'Unknown'

  const subDocs = React.useMemo(() => {
    return docs.filter(d => d.parentId === docId && !d.isArchived)
  }, [docs, docId])

  if (!doc) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-border flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-border flex flex-col bg-background dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {src && <src.icon className="w-4 h-4 text-muted-foreground" style={{ color: src.color }} />}
          <span className="text-sm font-semibold text-foreground truncate">{doc.title || 'Untitled'}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onFavorite(doc.id)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
            title={pref?.isFavorite ? 'Unfavorite' : 'Favorite'}
          >
            <Star 
              className={`w-3.5 h-3.5 ${pref?.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-foreground'}`}
              strokeWidth={1.5}
            />
          </button>
          <button
            onClick={() => onOpenModal(doc.id)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Maximize / View full"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href) }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Copy link"
          >
            <Link className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Close inspector"
            aria-label="Close inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Category + type badges */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
        {(doc.category ?? col?.name) && (() => {
          const CATEGORY_COLORS: Record<string, string> = {
            'Product': '#0052CC', 'Technical Design': '#6554C0', 'API': '#00B8D9',
            'Frontend': '#36B37E', 'Backend': '#FF991F', 'DevOps': '#172B4D',
            'Business': '#DE350B', 'Meeting Notes': '#5E6C84',
          }
          const label = doc.category ?? col?.name ?? ''
          const color = CATEGORY_COLORS[label] ?? col?.color ?? '#6554C0'
          return (
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: `${color}18`, color }}>
              {label}
            </span>
          )
        })()}
        {src && (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border"
            style={{ borderColor: `${src.color}40`, color: src.color, background: `${src.color}0d` }}
          >
            <src.icon className="w-3.5 h-3.5" />
            <span>{src.label}</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {(['preview', 'details'] as InspectorTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors capitalize border-b-2 -mb-px
              ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'preview' ? (
          <div className="p-4">
            {doc.content ? (
              doc.content.length > 500 ? (
                <div>
                  <div className="relative max-h-[300px] overflow-hidden">
                    <div
                      className="doc-content text-sm text-foreground"
                      dangerouslySetInnerHTML={{ __html: doc.content }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background dark:from-gray-900 to-transparent pointer-events-none" />
                  </div>
                  <div className="mt-3 flex justify-center">
                    <button
                      onClick={() => onOpenModal(doc.id)}
                      className="px-4 py-1.5 border border-primary text-primary hover:bg-primary/5 rounded-lg text-xs font-semibold transition-colors"
                    >
                      See More & Read Full Document
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="doc-content text-sm text-foreground"
                  dangerouslySetInnerHTML={{ __html: doc.content }}
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground italic">No content yet.</p>
            )}

            {/* Linked To */}
            <div className="mt-8 pt-6 border-t border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Linked To</h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/40 border border-border/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                    <span className="text-xs text-muted-foreground">Project</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{workspaceName || 'My Software Team'}</span>
                </div>
                {doc.linkedEntityLabel && doc.linkedEntityType?.toLowerCase() !== 'project' && doc.linkedEntityType?.toLowerCase() !== 'workspace' && (
                  <div 
                    onClick={() => {
                      if (doc.linkedEntityType === 'task' || doc.linkedEntityId) {
                        window.location.href = `/workspaces/${workspaceId}/boards?cardId=${doc.linkedEntityId}`
                      }
                    }}
                    className={`flex items-center justify-between p-2 rounded-md border border-border/60 transition-colors ${doc.linkedEntityType === 'task' ? 'hover:bg-muted/40 cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {doc.linkedEntityType === 'task' ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                      ) : doc.linkedEntityType === 'sprint' ? (
                        <Kanban className="w-4 h-4 text-purple-600" strokeWidth={1.5} />
                      ) : (
                        <Link2 className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                      )}
                      <span className="text-xs text-muted-foreground capitalize">{doc.linkedEntityType ?? 'Linked'}</span>
                    </div>
                    <span className="text-xs font-semibold text-primary hover:underline">{doc.linkedEntityLabel}</span>
                  </div>
                )}
                {/* Linked Task */}
                {doc.taskId && (() => {
                  const linkedTask = allTasks.find(t => t.id === doc.taskId)
                  const taskLabel = linkedTask ? `${linkedTask.issueKey ? '#' + linkedTask.issueKey + ': ' : ''}${linkedTask.title}` : doc.taskId
                  return (
                    <div
                      onClick={() => {
                        window.location.href = `/workspaces/${workspaceId}/boards?cardId=${doc.taskId}`
                      }}
                      className="flex items-center justify-between p-2 rounded-md border border-border/60 hover:bg-muted/40 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                        <span className="text-xs text-muted-foreground">Task</span>
                      </div>
                      <span className="text-xs font-semibold text-primary group-hover:underline truncate max-w-[140px]">{taskLabel}</span>
                    </div>
                  )
                })()}
                {/* Parent document link */}
                {doc.parentId && (() => {
                  const parentDoc = docs.find(d => d.id === doc.parentId)
                  if (!parentDoc) return null
                  return (
                    <div
                      onClick={() => onSelect(parentDoc.id)}
                      className="flex items-center justify-between p-2 rounded-md border border-border/60 hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" strokeWidth={1.5} />
                        <span className="text-xs text-muted-foreground">Parent Doc</span>
                      </div>
                      <span className="text-xs font-semibold text-primary hover:underline truncate max-w-[140px]">{parentDoc.title || 'Untitled'}</span>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Sub-documents */}
            {subDocs.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Sub-documents</h3>
                <div className="flex flex-col gap-2">
                  {subDocs.map(sd => (
                    <div
                      key={sd.id}
                      onClick={() => onSelect(sd.id)}
                      className="flex items-center gap-2 p-2 rounded-md border border-border/60 hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <FileText className="w-4 h-4 text-primary" strokeWidth={1.5} />
                      <span className="text-xs font-semibold text-foreground hover:underline">{sd.title || 'Untitled'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity */}
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Activity</h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span
                    className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: avatarColor(doc.authorEmail || doc.createdBy) }}
                  >
                    {initials(authorDisplayName)}
                  </span>
                  <div className="text-xs flex-1">
                    <span className="font-semibold text-foreground">{authorDisplayName}</span>
                    <span className="text-muted-foreground"> updated this doc</span>
                    <span className="block text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(doc.updatedAt)}</span>
                  </div>
                </div>
                {doc.createdAt !== doc.updatedAt && (
                  <div className="flex items-start gap-2">
                    <span
                      className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: avatarColor(doc.authorEmail || doc.createdBy) }}
                    >
                      {initials(authorDisplayName)}
                    </span>
                    <div className="text-xs flex-1">
                      <span className="font-semibold text-foreground">{authorDisplayName}</span>
                      <span className="text-muted-foreground"> created this doc</span>
                      <span className="block text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(doc.createdAt)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-5">
            {/* Meta */}
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">Type</span>
                <span className="font-medium" style={{ color: src?.color }}>{src?.label}</span>
              </div>
              {col && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-20 flex-shrink-0">Collection</span>
                  <span className="font-medium text-foreground">{col.name}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">Author</span>
                <span className="font-medium text-foreground">{doc.authorName || doc.createdBy}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">Updated</span>
                <span className="text-xs text-foreground">{formatDate(doc.updatedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 flex-shrink-0">Created</span>
                <span className="text-xs text-foreground">{formatDate(doc.createdAt)}</span>
              </div>
            </div>

            {/* Linked resources */}
            {doc.linkedEntityType && doc.linkedEntityLabel && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked To</p>
                <LinkedEntityBadge type={doc.linkedEntityType} label={doc.linkedEntityLabel} />
              </div>
            )}

            {/* AI summary placeholder */}
            <div className="rounded-lg border border-dashed border-border p-4 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground mb-1">AI Summary</p>
              <p className="text-xs text-muted-foreground/60 italic">Coming soon</p>
            </div>

            {/* Ask AI button (disabled) */}
            <button
              disabled
              className="w-full py-2 text-sm font-medium rounded-md bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              title="AI features coming soon"
            >
              Ask AI about this doc
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
