'use client'

import * as React from 'react'
import type { KnowledgeDoc, KnowledgeCollection } from './knowledge-center-client'
import type { useKnowledgePrefs } from './use-knowledge-prefs'
import { getSourceType } from './source-type-registry'
import { LinkedEntityBadge } from './knowledge-relationship'

type UserPrefs = ReturnType<typeof useKnowledgePrefs>

interface Props {
  workspaceId: string
  docId: string
  docs: KnowledgeDoc[]
  collections: KnowledgeCollection[]
  onClose: () => void
  onEdit: (id: string) => void
  userPrefs: UserPrefs
  onFavorite: (id: string) => void
}

type InspectorTab = 'preview' | 'details'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function KnowledgeInspector({ docId, docs, collections, onClose, onEdit, userPrefs, onFavorite }: Props) {
  const [tab, setTab] = React.useState<InspectorTab>('preview')

  const doc = docs.find(d => d.id === docId) ?? null
  const pref = doc ? userPrefs.getPref(doc.id) : null
  const src = doc ? getSourceType(doc.sourceType) : null
  const col = doc?.collectionId ? collections.find(c => c.id === doc.collectionId) : null

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
          <span className="text-base">{src?.icon}</span>
          <span className="text-sm font-semibold text-foreground truncate">{doc.title || 'Untitled'}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onFavorite(doc.id)}
            className={`w-7 h-7 flex items-center justify-center rounded text-base transition-colors ${pref?.isFavorite ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-300'}`}
            title={pref?.isFavorite ? 'Unfavorite' : 'Favorite'}
          >{pref?.isFavorite ? '★' : '☆'}</button>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href) }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Copy link"
          >🔗</button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Close inspector"
            aria-label="Close inspector"
          >✕</button>
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
            className="text-xs px-2 py-0.5 rounded font-medium border"
            style={{ borderColor: `${src.color}40`, color: src.color, background: `${src.color}0d` }}
          >
            {src.icon} {src.label}
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
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground"
                dangerouslySetInnerHTML={{ __html: doc.content }}
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">No content yet.</p>
            )}
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
                <span className="font-medium text-foreground">{doc.createdBy}</span>
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
