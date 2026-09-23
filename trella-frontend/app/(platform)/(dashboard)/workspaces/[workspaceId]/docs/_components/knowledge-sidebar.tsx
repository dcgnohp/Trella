'use client'

import * as React from 'react'
import { 
  FileText, User, Clock, Star, Copy, Trash2, 
  ClipboardList, Zap, UserCheck, Upload 
} from 'lucide-react'
import { toast } from 'sonner'
import type { KnowledgeCollection } from './knowledge-center-client'

interface Props {
  workspaceId: string
  navFilter: string
  onNavChange: (filter: string) => void
  collections: KnowledgeCollection[]
  onNewDoc: (type: 'manual' | 'file') => void
}

const NAV_ITEMS = [
  { value: 'all',       icon: FileText, label: 'All Docs',   count: null },
  { value: 'mine',      icon: User, label: 'My Docs',    count: null },
  { value: 'recent',    icon: Clock, label: 'Recent',     count: null },
  { value: 'favorites', icon: Star, label: 'Favorites',  count: null },
  { value: 'templates', icon: Copy, label: 'Templates', count: null },
  { value: 'trash',     icon: Trash2, label: 'Trash',     count: null },
]

const TASK_DOCS_ITEMS = [
  { value: 'source:TASK', icon: ClipboardList, label: 'All Task Docs' },
  { value: 'source:SPRINT_REPORT', icon: Zap, label: 'This Sprint' },
  { value: 'source:TASK_MINE', icon: UserCheck, label: 'Assigned to me' },
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

export function KnowledgeSidebar({ workspaceId, navFilter, onNavChange, collections, onNewDoc }: Props) {
  const [isAddingCategory, setIsAddingCategory] = React.useState(false)
  const [newCategoryName, setNewCategoryName] = React.useState('')
  const [showNewDocDropdown, setShowNewDocDropdown] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!showNewDocDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNewDocDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNewDocDropdown])

  const submitCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    try {
      const res = await fetch(`/api/knowledge/${workspaceId}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), color: '#6554C0' })
      })
      if (!res.ok) throw new Error()
      setIsAddingCategory(false)
      setNewCategoryName('')
      toast.success('Category created')
      // reload browser window to refresh category lists
      window.location.reload()
    } catch {
      toast.error('Failed to create category')
    }
  }

  return (
    <div className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-muted/30 dark:bg-gray-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border relative">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Documentation
        </span>
        <div ref={dropdownRef}>
          <button
            onClick={() => setShowNewDocDropdown(!showNewDocDropdown)}
            className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-2 py-1 rounded"
          >
            + New Doc
          </button>
          
          {showNewDocDropdown && (
            <div className="absolute right-4 top-11 z-50 w-44 bg-background border border-border rounded-md shadow-lg overflow-hidden py-1">
              <button
                onClick={() => { onNewDoc('manual'); setShowNewDocDropdown(false) }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                Write Manual Doc
              </button>
              <button
                onClick={() => { onNewDoc('file'); setShowNewDocDropdown(false) }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                Upload Existing File
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Main nav */}
        <div className="px-2 mb-4">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.value}
                onClick={() => onNavChange(item.value)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left
                  ${navFilter === item.value
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent'
                  }`}
              >
                <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <span className="flex-1">{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* CATEGORIES section */}
        <div className="px-2 mb-4">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Categories</span>
            <button
              onClick={() => setIsAddingCategory(!isAddingCategory)}
              className="text-muted-foreground hover:text-foreground text-sm font-semibold px-1"
              title="Add category"
            >
              +
            </button>
          </div>

          {isAddingCategory && (
            <form onSubmit={submitCategory} className="px-2 mb-2">
              <input
                autoFocus
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Press Enter to add..."
                className="w-full text-xs px-2 py-1 border border-border rounded bg-background text-foreground outline-none focus:border-primary"
                onBlur={() => { if (!newCategoryName) setIsAddingCategory(false) }}
              />
            </form>
          )}

          {collections.length === 0 && !isAddingCategory && (
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
          {TASK_DOCS_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.value}
                onClick={() => onNavChange(item.value)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left
                  ${navFilter === item.value
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent'
                  }`}
              >
                <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <span className="flex-1">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
