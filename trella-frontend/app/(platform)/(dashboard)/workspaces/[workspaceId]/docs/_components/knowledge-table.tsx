'use client'

import * as React from 'react'
import type { KnowledgeDoc, KnowledgeCollection } from './knowledge-center-client'
import type { useKnowledgePrefs } from './use-knowledge-prefs'
import { getSourceType } from './source-type-registry'

type UserPrefs = ReturnType<typeof useKnowledgePrefs>

interface Props {
  workspaceId: string
  docs: KnowledgeDoc[]
  collections: KnowledgeCollection[]
  userPrefs: UserPrefs
  sortBy: 'updated' | 'created' | 'title'
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onOpenModal: (id: string) => void
  onPin: (id: string) => void
  onFavorite: (id: string) => void
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(str: string): string {
  return str.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
}

// Pastel-ish deterministic avatar color from string
function avatarColor(str: string): string {
  const colors = ['#0052CC', '#6554C0', '#00B8D9', '#36B37E', '#FF991F', '#DE350B']
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff
  return colors[h % colors.length]
}

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

export function KnowledgeTable({
  workspaceId, docs, collections, userPrefs, sortBy, onSelect, onEdit, onOpenModal, onPin, onFavorite,
}: Props) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null)

  const collectionMap = React.useMemo(() => {
    const m: Record<string, KnowledgeCollection> = {}
    collections.forEach(c => { m[c.id] = c })
    return m
  }, [collections])

  React.useEffect(() => {
    const close = () => setOpenMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  return (
    <div className="w-full" role="table" aria-label="Knowledge documents">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border"
        role="row"
      >
        <span className="flex-1 min-w-0">Title</span>
        <span className="w-32 hidden sm:block">Category</span>
        <span className="w-24 hidden md:block">Type</span>
        <span className="w-28 hidden md:block">Linked To</span>
        <span className="w-20 hidden lg:block">Updated</span>
        <span className="w-28 hidden lg:block">Author</span>
        <span className="w-8" />
      </div>

      {docs.map(doc => {
        const pref = userPrefs.getPref(doc.id)
        const src = getSourceType(doc.sourceType)
        const col = doc.collectionId ? collectionMap[doc.collectionId] : null
        const catColor = doc.category ? (CATEGORY_COLORS[doc.category] ?? '#6554C0') : '#6554C0'
        const authorDisplayName = doc.authorName || doc.createdBy.split('@')[0] || 'Unknown'
        const av = avatarColor(doc.authorEmail || doc.createdBy)

        return (
          <div
            key={doc.id}
            role="row"
            onClick={() => onSelect(doc.id)}
            onDoubleClick={(e) => { e.stopPropagation(); onOpenModal(doc.id) }}
            className="flex items-center gap-3 px-3 py-2.5 border-b border-border hover:bg-accent/50 cursor-pointer group transition-colors"
          >
            {/* Icon + title + description */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="flex-shrink-0 text-muted-foreground">
                <src.icon className="w-4 h-4" style={{ color: src.color }} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{doc.title || 'Untitled'}</p>
                {doc.content && (
                  <p className="text-xs text-muted-foreground truncate hidden sm:block"
                    dangerouslySetInnerHTML={{
                      __html: doc.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 80)
                    }}
                  />
                )}
              </div>
            </div>

            {/* Category badge — colored */}
            <div className="w-32 hidden sm:block">
              {doc.category ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium truncate max-w-full"
                  style={{ background: `${catColor}18`, color: catColor }}
                >
                  {doc.category}
                </span>
              ) : col ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium truncate max-w-full"
                  style={{ background: `${col.color ?? '#6554C0'}18`, color: col.color ?? '#6554C0' }}
                >
                  {col.name}
                </span>
              ) : null}
            </div>

            {/* Type badge */}
            <div className="w-24 hidden md:block">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap"
                style={{ borderColor: `${src.color}40`, color: src.color, background: `${src.color}0d` }}
              >
                <src.icon className="w-3 h-3 flex-shrink-0" />
                <span>{src.label}</span>
              </span>
            </div>

            {/* Linked To */}
            <div className="w-28 hidden md:block">
              {doc.linkedEntityLabel ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.location.href = `/workspaces/${workspaceId}/boards`
                  }}
                  className="text-xs text-primary font-medium hover:underline text-left truncate block max-w-full"
                >
                  {doc.linkedEntityLabel}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {/* Updated */}
            <div className="w-20 hidden lg:block">
              <span className="text-xs text-muted-foreground">{timeAgo(doc.updatedAt)}</span>
            </div>

            {/* Author avatar + name */}
            <div className="w-28 hidden lg:flex items-center gap-1.5">
              <span
                title={authorDisplayName}
                className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                style={{ background: av }}
              >
                {initials(authorDisplayName)}
              </span>
              <span className="text-xs text-muted-foreground truncate">{authorDisplayName}</span>
            </div>

            {/* 3-dot menu */}
            <div className="w-8 flex justify-center relative">
              <button
                onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === doc.id ? null : doc.id) }}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground text-sm transition-opacity"
                aria-label="More actions"
              >⋯</button>
              {openMenu === doc.id && (
                <div
                  onClick={e => e.stopPropagation()}
                  className="absolute right-0 top-7 z-50 w-36 bg-popover border border-border rounded-md shadow-md py-1 text-sm"
                >
                  <button
                    onClick={() => { onEdit(doc.id); setOpenMenu(null) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent text-foreground"
                  >Edit</button>
                  <button
                    onClick={() => { onPin(doc.id); setOpenMenu(null) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent text-foreground"
                  >{pref.isPinned ? 'Unpin' : 'Pin'}</button>
                  <button
                    onClick={() => { onFavorite(doc.id); setOpenMenu(null) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent text-foreground"
                  >{pref.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                  <div className="border-t border-border my-1" />
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-accent text-destructive"
                    onClick={() => setOpenMenu(null)}
                  >Delete</button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
