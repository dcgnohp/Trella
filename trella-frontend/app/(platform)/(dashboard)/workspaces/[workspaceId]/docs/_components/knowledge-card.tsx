'use client'

import * as React from 'react'
import { Star } from 'lucide-react'
import type { KnowledgeDoc, KnowledgeCollection } from './knowledge-center-client'
import type { DocPref } from './use-knowledge-prefs'
import { getSourceType } from './source-type-registry'

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

interface Props {
  doc: KnowledgeDoc
  collection?: KnowledgeCollection
  pref: DocPref
  onPin: () => void
  onFavorite: () => void
  onOpen: () => void
  onOpenModal: () => void
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function KnowledgeCard({ doc, collection, pref, onPin, onFavorite, onOpen, onOpenModal }: Props) {
  const src = getSourceType(doc.sourceType)
  const preview = doc.content ? stripHtml(doc.content).slice(0, 100) : ''
  const catColor = doc.category
    ? (CATEGORY_COLORS[doc.category] ?? collection?.color ?? '#6554C0')
    : collection?.color ?? '#6554C0'
  const catLabel = doc.category ?? collection?.name

  return (
    <div
      onClick={onOpen}
      onDoubleClick={(e) => { e.stopPropagation(); onOpenModal(); }}
      className="relative flex flex-col gap-2 p-3 rounded-lg border border-border bg-card hover:shadow-sm cursor-pointer transition-shadow group"
    >
      {/* Category badge */}
      <div className="flex items-center justify-between">
        {catLabel ? (
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium truncate max-w-[70%]"
            style={{ background: `${catColor}18`, color: catColor }}
          >
            {catLabel}
          </span>
        ) : (
          <span className="text-muted-foreground flex-shrink-0">
            <src.icon className="w-4 h-4" style={{ color: src.color }} />
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onFavorite() }}
          className="flex-shrink-0 p-1 rounded hover:bg-muted/40 transition-colors"
          title={pref.isFavorite ? 'Unfavorite' : 'Favorite'}
          aria-label={pref.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star 
            className={`w-4 h-4 transition-colors ${pref.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40 hover:text-yellow-400'}`} 
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
        {doc.title || 'Untitled'}
      </p>

      {/* Preview */}
      {preview && (
        <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{preview}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-xs text-muted-foreground">{formatDate(doc.updatedAt)}</span>
      </div>
    </div>
  )
}
