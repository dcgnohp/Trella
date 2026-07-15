'use client'

import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Code, Terminal, Quote, Undo2, Redo2,
  MoreHorizontal, Eye, ChevronRight, Trash2, Plus, X, CheckCircle2, Loader2,
  AlertCircle, CheckCircle, Save,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { SprintsService, BacklogService } from '@/lib/client'
import type { KnowledgeCollection } from './knowledge-center-client'
import { SOURCE_TYPE_REGISTRY } from './source-type-registry'
import { AiDocSummary } from './ai-doc-summary'

interface Props {
  workspaceId: string
  docId: string | null
  collections: KnowledgeCollection[]
  onBack: () => void
  onSaved: (id: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'Product': '#0052CC', 'Technical Design': '#6554C0', 'API': '#00B8D9',
  'Frontend': '#36B37E', 'Backend': '#FF991F', 'DevOps': '#172B4D',
  'Business': '#DE350B', 'Meeting Notes': '#5E6C84',
}
const CATEGORIES = Object.keys(CATEGORY_COLORS)

const SOURCE_TYPES = Object.entries(SOURCE_TYPE_REGISTRY)
  .filter(([, v]) => v.editable)
  .map(([k, v]) => ({ value: k, label: v.label }))

function initials(str: string) {
  return str.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
}

function avatarColor(str: string) {
  const colors = ['#0052CC', '#6554C0', '#00B8D9', '#36B37E', '#FF991F', '#DE350B']
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff
  return colors[h % colors.length]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

async function createDoc(workspaceId: string, data: object) {
  const res = await fetch(`/api/knowledge/${workspaceId}/docs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create doc')
  return res.json()
}

async function patchDoc(workspaceId: string, docId: string, data: object) {
  const res = await fetch(`/api/knowledge/${workspaceId}/docs/${docId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save doc')
  return res.json()
}

async function deleteDoc(workspaceId: string, docId: string) {
  const res = await fetch(`/api/knowledge/${workspaceId}/docs/${docId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete doc')
}

type RightTab = 'details' | 'outline' | 'history'

export function KnowledgeEditor({ workspaceId, docId, collections, onBack, onSaved }: Props) {
  const qc = useQueryClient()
  const [liveDocId, setLiveDocId] = React.useState<string | null>(docId)
  const [title, setTitle] = React.useState('')
  const [collectionId, setCollectionId] = React.useState('')
  const [sourceType, setSourceType] = React.useState('MANUAL')
  const [category, setCategory] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [parentId, setParentId] = React.useState('')
  const [taskId, setTaskId] = React.useState('')
  const [isDirty, setIsDirty] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle')
  const [rightTab, setRightTab] = React.useState<RightTab>('details')
  const [editorText, setEditorText] = React.useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const initialLoadDone = React.useRef(false)
  const contentScrollRef = React.useRef<HTMLDivElement>(null)

  const searchParams = useSearchParams()
  const queryTaskId = searchParams?.get('taskId')

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
    if (sprintsQuery.data) sprintsQuery.data.forEach(s => { if (s.tasks) tasks.push(...s.tasks) })
    if (backlogQuery.data) tasks.push(...backlogQuery.data)
    return tasks
  }, [sprintsQuery.data, backlogQuery.data])

  const { data: docs = [] } = useQuery<any[]>({
    queryKey: ['knowledge-docs', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge/${workspaceId}/docs`)
      if (!res.ok) throw new Error()
      return res.json()
    }
  })

  const { data: doc } = useQuery({
    queryKey: ['knowledge-doc', workspaceId, liveDocId],
    queryFn: async () => {
      if (!liveDocId) return null
      const res = await fetch(`/api/knowledge/${workspaceId}/docs/${liveDocId}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!liveDocId,
  })

  const createMut = useMutation({
    mutationFn: (data: object) => createDoc(workspaceId, data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspace-docs', workspaceId] })
      setLiveDocId(d.id)
      setSaveStatus('saved')
      setIsDirty(false)
    },
    onError: () => { toast.error('Failed to create doc'); setSaveStatus('idle') },
  })

  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => patchDoc(workspaceId, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspace-docs', workspaceId] })
      setSaveStatus('saved')
      setIsDirty(false)
    },
    onError: () => { toast.error('Failed to save'); setSaveStatus('idle') },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteDoc(workspaceId, liveDocId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] }); onBack() },
    onError: () => toast.error('Failed to delete'),
  })

  const buildPayload = React.useCallback((html: string) => ({
    title: title || 'Untitled',
    content: html,
    collectionId: collectionId || null,
    sourceType,
    category: category || null,
    description: description || null,
    parentId: parentId || null,
    taskId: taskId || null,
  }), [title, collectionId, sourceType, category, description, parentId, taskId])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    editorProps: {
      attributes: { style: 'outline:none;min-height:400px;font-size:15px;line-height:1.75;' },
    },
    onUpdate: ({ editor: e }) => {
      const text = e.getText()
      setEditorText(text)
      if (initialLoadDone.current) {
        setIsDirty(true)
        setSaveStatus('idle')
      }
    },
  })

  const handleSave = React.useCallback(() => {
    if (!isDirty && saveStatus === 'saved') return

    setSaveStatus('saving')
    const html = editor?.getText().trim() ? editor.getHTML() : ''
    const payload = buildPayload(html)
    if (!liveDocId) createMut.mutate(payload)
    else patchMut.mutate({ id: liveDocId, data: payload })
  }, [liveDocId, buildPayload, createMut, patchMut, editor, isDirty, saveStatus])

  React.useEffect(() => {
    if (doc && editor && !initialLoadDone.current) {
      setTitle(doc.title || '')
      setCollectionId(doc.collectionId || '')
      setSourceType(doc.sourceType || 'MANUAL')
      setCategory(doc.category || '')
      setDescription(doc.description || '')
      setParentId(doc.parentId || '')
      setTaskId(doc.taskId || '')
      editor.commands.setContent(doc.content ?? '')
      setEditorText(editor.getText())
      setIsDirty(false)
      setSaveStatus('saved')
      setTimeout(() => { initialLoadDone.current = true }, 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, editor])

  React.useEffect(() => {
    if (!docId && editor) initialLoadDone.current = true
  }, [docId, editor])

  React.useEffect(() => {
    if (queryTaskId) { setTaskId(queryTaskId) }
  }, [queryTaskId])

  React.useEffect(() => {
    if (!docId && editor) {
      const saved = sessionStorage.getItem('prefilledDoc')
      if (saved) {
        try {
          const { title: t, content: c } = JSON.parse(saved)
          setTitle(t || '')
          if (c) editor.commands.setContent(c)
          sessionStorage.removeItem('prefilledDoc')
          setIsDirty(true)
        } catch { /* ignore */ }
      }
    }
  }, [docId, editor])

  // Ctrl+S fallback
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (editor) handleSave()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [editor, handleSave])

  const markDirty = () => {
    if (!initialLoadDone.current || !editor) return
    setIsDirty(true)
    setSaveStatus('idle')
  }

  const selectedCollection = collections.find(c => c.id === collectionId)
  const authorName = doc?.authorName || doc?.createdBy?.split('@')[0] || 'Unknown'
  const words = wordCount(editorText)
  const chars = editorText.length

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background min-h-0 h-full">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border flex-shrink-0 min-h-[56px]">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-1 min-w-0 overflow-hidden">
          <button onClick={onBack} className="hover:text-foreground transition-colors whitespace-nowrap">Knowledge Center</button>
          {selectedCollection && (
            <><ChevronRight className="w-4 h-4 flex-shrink-0" /><span className="truncate">{selectedCollection.name}</span></>
          )}
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
          <span className="text-foreground font-medium truncate">{title || 'Untitled'}</span>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isDirty && (
            <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-medium">
              <AlertCircle className="w-4 h-4" />
              Unsaved changes
            </span>
          )}
          {saveStatus === 'saved' && !isDirty && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle className="w-4 h-4" />
              Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={(!isDirty && saveStatus === 'saved') || saveStatus === 'saving'}
            className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all
              ${isDirty
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:-translate-y-0.5'
                : saveStatus === 'saving'
                  ? 'bg-muted text-muted-foreground cursor-wait'
                  : 'bg-muted text-muted-foreground cursor-default opacity-60'
              }`}
          >
            <Save className="w-4 h-4" />
            {saveStatus === 'saving' ? 'Saving…' : isDirty ? 'Save Document' : 'Saved'}
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Author avatar */}
          {doc && (
            <span
              title={authorName}
              className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
              style={{ background: avatarColor(doc.authorEmail || doc.createdBy || 'user') }}
            >
              {initials(authorName)}
            </span>
          )}

          <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground" title="More options">
            <MoreHorizontal className="w-5 h-5" />
          </button>

          <button className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md border border-border hover:bg-accent text-foreground transition-colors">
            <Eye className="w-4 h-4" />
            Preview
          </button>

          <button className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors">
            Share
          </button>
        </div>
      </div>

      {/* ── Body: editor + right panel ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Center: toolbar + content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Tiptap toolbar */}
          {editor && <EditorToolbar editor={editor} />}

          {/* Scrollable content area */}
          <div ref={contentScrollRef} className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
            <div className="max-w-3xl mx-auto">
              {/* Category badge above title */}
              {(category || selectedCollection?.name) && (() => {
                const label = category || selectedCollection?.name || ''
                const color = CATEGORY_COLORS[label] ?? selectedCollection?.color ?? '#6554C0'
                return (
                  <span className="inline-block mb-3 text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: `${color}18`, color }}>
                    {label}
                  </span>
                )
              })()}

              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); markDirty() }}
                placeholder="Untitled"
                className="w-full text-4xl font-bold border-none outline-none bg-transparent text-foreground placeholder:text-muted-foreground/30 mb-6"
                aria-label="Document title"
              />

              {/* Editor */}
              <EditorContent editor={editor} />

              {/* Read-only AI summary panel (P3-F2) — reads content/title only */}
              <div className="mt-6">
                <AiDocSummary content={editorText} title={title} testId="ai-doc-summary" />
              </div>
            </div>
          </div>

          {/* ── Status bar ── */}
          <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border text-xs text-muted-foreground flex-shrink-0">
            <span>Markdown</span>
            <span className="w-px h-3 bg-border" />
            <span>{words.toLocaleString()} words</span>
            <span className="w-px h-3 bg-border" />
            <span>{chars.toLocaleString()} characters</span>
          </div>
        </div>

        {/* ── Right panel (Details) ── */}
        <RightPanel
          doc={doc}
          docs={docs}
          collections={collections}
          allTasks={allTasks}
          tab={rightTab}
          onTabChange={setRightTab}
          title={title}
          collectionId={collectionId}
          sourceType={sourceType}
          category={category}
          description={description}
          parentId={parentId}
          taskId={taskId}
          onTitleChange={v => { setTitle(v); markDirty() }}
          onCollectionChange={v => { setCollectionId(v); markDirty() }}
          onSourceTypeChange={v => { setSourceType(v); markDirty() }}
          onCategoryChange={v => { setCategory(v); markDirty() }}
          onDescriptionChange={v => { setDescription(v); markDirty() }}
          onParentIdChange={v => { setParentId(v); markDirty() }}
          onTaskIdChange={v => { setTaskId(v); markDirty() }}
          showDeleteConfirm={showDeleteConfirm}
          onDeleteRequest={() => setShowDeleteConfirm(true)}
          onDeleteCancel={() => setShowDeleteConfirm(false)}
          onDeleteConfirm={() => deleteMut.mutate()}
          canDelete={!!liveDocId}
          editor={editor}
          contentScrollRef={contentScrollRef}
        />
      </div>

      <style>{`
        .tiptap { outline: none; }
        .tiptap p { margin: 0 0 6px; }
        .tiptap h1 { font-size:22px;font-weight:700;margin:16px 0 8px;scroll-margin-top:80px; }
        .tiptap h2 { font-size:18px;font-weight:700;margin:14px 0 6px;scroll-margin-top:80px; }
        .tiptap h3 { font-size:15px;font-weight:600;margin:10px 0 4px;scroll-margin-top:80px; }
        .tiptap ul, .tiptap ol { margin:4px 0 6px 24px;padding:0; }
        .tiptap code { background:var(--trella-surface-sunken);border-radius:3px;padding:1px 5px;font-size:13px;font-family:monospace; }
        .tiptap pre { background:var(--trella-surface-sunken);border-radius:6px;padding:12px 16px;margin:8px 0;overflow-x:auto; }
        .tiptap pre code { background:none;padding:0; }
        .tiptap p.is-editor-empty:first-child::before { content:attr(data-placeholder);color:var(--trella-text-subtlest);pointer-events:none;float:left;height:0; }
        .tiptap a { color:var(--trella-brand);text-decoration:underline; }
        .tiptap blockquote { border-left:3px solid var(--trella-border);margin:8px 0;padding-left:14px;color:var(--trella-text-subtle); }
        @keyframes outline-flash { 0%,15% { background:rgba(0,82,204,0.18); border-radius:4px; outline: 2px solid rgba(0,82,204,0.4); outline-offset:2px } 100% { background:transparent; outline:none } }
        .outline-flash { animation: outline-flash 2s ease-out forwards; }
      `}</style>
    </div>
  )
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

const TB_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 26, minWidth: 26, padding: '0 6px',
  border: 'none', borderRadius: 3, background: 'none',
  cursor: 'pointer', fontSize: 12, transition: 'background 0.1s',
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btn = (icon: React.ReactNode, active: boolean, onClick: () => void, title?: string) => (
    <button
      key={title} type="button" title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{ ...TB_BTN, background: active ? 'rgba(0,82,204,0.12)' : 'none', color: active ? 'var(--trella-brand)' : 'var(--trella-text-subtle)' }}
      className="hover:bg-accent hover:text-foreground"
    >{icon}</button>
  )
  const sep = <div style={{ width: 1, height: 18, background: 'var(--trella-border)', margin: '0 3px' }} />

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-4 py-1.5 border-b border-border bg-muted/30 flex-shrink-0">
      {btn(<Bold className="w-3.5 h-3.5" />, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
      {btn(<Italic className="w-3.5 h-3.5" />, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
      {btn(<Strikethrough className="w-3.5 h-3.5" />, editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Strikethrough')}
      {btn(<Code className="w-3.5 h-3.5" />, editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'Inline code')}
      {sep}
      {btn(<Heading1 className="w-3.5 h-3.5" />, editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'Heading 1')}
      {btn(<Heading2 className="w-3.5 h-3.5" />, editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2')}
      {btn(<Heading3 className="w-3.5 h-3.5" />, editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Heading 3')}
      {sep}
      {btn(<List className="w-3.5 h-3.5" />, editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bullet list')}
      {btn(<ListOrdered className="w-3.5 h-3.5" />, editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Ordered list')}
      {btn(<Quote className="w-3.5 h-3.5" />, editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Blockquote')}
      {btn(<Terminal className="w-3.5 h-3.5" />, editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), 'Code block')}
      {sep}
      {btn(<Undo2 className="w-3.5 h-3.5" />, false, () => editor.chain().focus().undo().run(), 'Undo')}
      {btn(<Redo2 className="w-3.5 h-3.5" />, false, () => editor.chain().focus().redo().run(), 'Redo')}
    </div>
  )
}

// ── Right Panel ──────────────────────────────────────────────────────────────

interface RightPanelProps {
  doc: any
  docs: any[]
  collections: KnowledgeCollection[]
  allTasks: any[]
  tab: RightTab
  onTabChange: (t: RightTab) => void
  title: string
  collectionId: string
  sourceType: string
  category: string
  description: string
  parentId: string
  taskId: string
  onTitleChange: (v: string) => void
  onCollectionChange: (v: string) => void
  onSourceTypeChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onParentIdChange: (v: string) => void
  onTaskIdChange: (v: string) => void
  showDeleteConfirm: boolean
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
  canDelete: boolean
  editor: any
  contentScrollRef: React.RefObject<HTMLDivElement>
}

const SELECT_CLS = 'w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary'
const LABEL_CLS = 'text-sm font-semibold text-foreground mb-1.5'

function RightPanel({
  doc, docs, collections, allTasks, tab, onTabChange,
  title, collectionId, sourceType, category, description, parentId, taskId,
  onTitleChange, onCollectionChange, onSourceTypeChange, onCategoryChange,
  onDescriptionChange, onParentIdChange, onTaskIdChange,
  showDeleteConfirm, onDeleteRequest, onDeleteCancel, onDeleteConfirm, canDelete, editor,
  contentScrollRef,
}: RightPanelProps) {
  const selectedCollection = collections.find(c => c.id === collectionId)
  const authorName = doc?.authorName || doc?.createdBy?.split('@')[0] || '—'
  const potentialParents = docs.filter(d => d.id !== doc?.id && !d.isArchived)
  const [activeOutlinePos, setActiveOutlinePos] = React.useState<number | null>(null)

  const outline = React.useMemo(() => {
    if (!editor) return []
    const items: { level: number; text: string; pos: number; nodeSize: number }[] = []
    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'heading') {
        items.push({ level: node.attrs.level, text: node.textContent, pos, nodeSize: node.nodeSize })
      }
    })
    return items
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state.doc.content])

  // Auto-sync active outline item while scrolling
  React.useEffect(() => {
    if (!editor || !contentScrollRef.current || outline.length === 0) return
    const headings = Array.from(editor.view.dom.querySelectorAll('h1,h2,h3')) as HTMLElement[]
    if (headings.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        )
        const idx = headings.indexOf(topmost.target as HTMLElement)
        if (idx !== -1 && outline[idx]) setActiveOutlinePos(outline[idx].pos)
      },
      { root: contentScrollRef.current, rootMargin: '0px 0px -80% 0px', threshold: 0 }
    )
    headings.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [editor, outline, contentScrollRef])

  return (
    <div className="w-80 flex-shrink-0 border-l border-border flex flex-col bg-background overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {(['details', 'outline', 'history'] as RightTab[]).map(t => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors capitalize border-b-2 -mb-px
              ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'history' ? 'Version History' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'details' && (
          <div className="p-4 flex flex-col gap-4">
            {/* Details section */}
            <section>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Details</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <p className={LABEL_CLS}>Title</p>
                  <input
                    value={title}
                    onChange={e => onTitleChange(e.target.value)}
                    className={SELECT_CLS + ' h-auto py-1.5'}
                    placeholder="Untitled"
                  />
                </div>

                <div>
                  <p className={LABEL_CLS}>Collection</p>
                  <div className="relative">
                    <select value={collectionId} onChange={e => onCollectionChange(e.target.value)} className={SELECT_CLS + ' pl-6'}>
                      <option value="">No collection</option>
                      {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {selectedCollection?.color && (
                      <span
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none"
                        style={{ background: selectedCollection.color }}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <p className={LABEL_CLS}>Source type</p>
                  <select value={sourceType} onChange={e => onSourceTypeChange(e.target.value)} className={SELECT_CLS}>
                    {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div>
                  <p className={LABEL_CLS}>Category <span className="text-muted-foreground/50">(optional)</span></p>
                  <select value={category} onChange={e => onCategoryChange(e.target.value)} className={SELECT_CLS}>
                    <option value="">None</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <p className={LABEL_CLS}>Description</p>
                  <textarea
                    value={description}
                    onChange={e => onDescriptionChange(e.target.value)}
                    rows={3}
                    placeholder="Add a description…"
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            </section>

            {/* Linked Resources */}
            <section>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Linked Resources</h3>
              <div className="flex flex-col gap-2">
                {/* Parent doc */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Parent</span>
                  <select
                    value={parentId}
                    onChange={e => onParentIdChange(e.target.value)}
                    className="flex-1 h-7 px-2 text-xs border border-border rounded bg-background text-foreground outline-none"
                  >
                    <option value="">None</option>
                    {potentialParents.map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
                  </select>
                  {parentId && (
                    <button onClick={() => onParentIdChange('')} className="w-5 h-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Task */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Task</span>
                  <select
                    value={taskId}
                    onChange={e => onTaskIdChange(e.target.value)}
                    className="flex-1 h-7 px-2 text-xs border border-border rounded bg-background text-foreground outline-none"
                  >
                    <option value="">None</option>
                    {allTasks.map(t => <option key={t.id} value={t.id}>{t.issueKey ? `#${t.issueKey}: ` : ''}{t.title}</option>)}
                  </select>
                  {taskId && (
                    <button onClick={() => onTaskIdChange('')} className="w-5 h-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="w-3 h-3" />Add more link
                </button>
              </div>
            </section>

            {/* Metadata */}
            <section>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Metadata</h3>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {doc && (
                    <span
                      className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                      style={{ background: avatarColor(doc.authorEmail || doc.createdBy || 'user') }}
                    >
                      {initials(authorName)}
                    </span>
                  )}
                  <span className="text-muted-foreground">Author:</span>
                  <span className="text-foreground font-medium">{authorName}</span>
                </div>
                {doc?.createdAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="text-foreground">{formatDate(doc.createdAt)}</span>
                  </div>
                )}
                {doc?.updatedAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Updated:</span>
                    <span className="text-foreground">{formatDate(doc.updatedAt)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Delete */}
            {canDelete && (
              <section className="pt-2 border-t border-border">
                {showDeleteConfirm ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-destructive font-medium">Delete this document?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={onDeleteConfirm}
                        className="flex-1 py-1.5 text-xs font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={onDeleteCancel}
                        className="flex-1 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onDeleteRequest}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete document
                  </button>
                )}
              </section>
            )}
          </div>
        )}

        {tab === 'outline' && (
          <div className="p-4 flex flex-col gap-2">
            {outline.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No headings found</p>
            ) : (
              outline.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const headings = Array.from(editor.view.dom.querySelectorAll('h1,h2,h3')) as HTMLElement[]
                    const el = headings[i]
                    if (!el) return
                    setActiveOutlinePos(h.pos)
                    // Scroll within editor container
                    let scrollable: HTMLElement | null = el.parentElement
                    while (scrollable && scrollable !== document.body) {
                      const oy = window.getComputedStyle(scrollable).overflowY
                      if (oy === 'auto' || oy === 'scroll') break
                      scrollable = scrollable.parentElement
                    }
                    if (scrollable) {
                      const offset = el.getBoundingClientRect().top - scrollable.getBoundingClientRect().top - 24
                      scrollable.scrollTo({ top: scrollable.scrollTop + offset, behavior: 'smooth' })
                    }
                    // Highlight after scroll lands
                    setTimeout(() => {
                      el.animate([
                        { backgroundColor: 'rgba(0,82,204,0.15)', borderRadius: '4px', boxShadow: '0 0 0 3px rgba(0,82,204,0.3)' },
                        { backgroundColor: 'transparent', borderRadius: '4px', boxShadow: 'none' },
                      ], { duration: 2000, easing: 'ease-out', fill: 'none' })
                    }, 450)
                  }}
                  className={`text-left text-sm transition-colors truncate
                    ${activeOutlinePos === h.pos
                      ? 'text-primary font-semibold'
                      : 'hover:text-primary hover:underline text-foreground'
                    }
                    ${h.level === 1 ? 'font-bold mt-2' : h.level === 2 ? 'pl-3' : 'pl-6 text-muted-foreground'}`}
                >
                  {h.text || 'Empty heading'}
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="p-4">
            {doc ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-foreground">Current version</p>
                  <p className="text-muted-foreground mt-0.5">{formatDate(doc.updatedAt)}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No history yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
