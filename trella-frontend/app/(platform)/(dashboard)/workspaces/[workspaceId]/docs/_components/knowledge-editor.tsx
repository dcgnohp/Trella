'use client'

import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { KnowledgeCollection } from './knowledge-center-client'
import { SOURCE_TYPE_REGISTRY } from './source-type-registry'

interface Props {
  workspaceId: string
  docId: string | null
  collections: KnowledgeCollection[]
  onBack: () => void
  onSaved: (id: string) => void
}

const SOURCE_TYPES = Object.entries(SOURCE_TYPE_REGISTRY)
  .filter(([, v]) => v.editable)
  .map(([k, v]) => ({ value: k, label: v.label, icon: v.icon }))

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

export function KnowledgeEditor({ workspaceId, docId, collections, onBack, onSaved }: Props) {
  const qc = useQueryClient()
  const [liveDocId, setLiveDocId] = React.useState<string | null>(docId)
  const [title, setTitle] = React.useState('')
  const [collectionId, setCollectionId] = React.useState<string>('')
  const [sourceType, setSourceType] = React.useState('MANUAL')
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const createMut = useMutation({
    mutationFn: (data: object) => createDoc(workspaceId, data),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] })
      setLiveDocId(doc.id)
      setSaveStatus('saved')
    },
    onError: () => { toast.error('Failed to create doc'); setSaveStatus('idle') },
  })

  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => patchDoc(workspaceId, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge-docs', workspaceId] })
      setSaveStatus('saved')
    },
    onError: () => { toast.error('Failed to save'); setSaveStatus('idle') },
  })

  const triggerSave = React.useCallback((content: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(() => {
      const payload = { title: title || 'Untitled', content, collectionId: collectionId || null, sourceType }
      if (!liveDocId) {
        createMut.mutate(payload)
      } else {
        patchMut.mutate({ id: liveDocId, data: payload })
      }
    }, 800)
  }, [title, collectionId, sourceType, liveDocId, createMut, patchMut])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    editorProps: {
      attributes: { style: 'outline:none;min-height:400px;font-size:15px;line-height:1.7;color:var(--trella-text);' },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getText().trim() ? editor.getHTML() : null
      triggerSave(html ?? '')
    },
  })

  const handleTitleBlur = () => {
    const content = editor?.getText().trim() ? editor.getHTML() : ''
    triggerSave(content)
  }

  const handleBack = () => {
    if (liveDocId) onSaved(liveDocId)
    else onBack()
  }

  const selectedCollection = collections.find(c => c.id === collectionId)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background dark:bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0">
        <button
          onClick={handleBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          ← Back
        </button>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground overflow-hidden">
          <span>Knowledge Center</span>
          {selectedCollection && (
            <><span>/</span><span>{selectedCollection.name}</span></>
          )}
          <span>/</span>
          <span className="text-foreground font-medium truncate">{title || 'Untitled'}</span>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && '✓ Saved'}
        </div>
      </div>

      {/* Meta bar */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border flex-shrink-0 flex-wrap">
        <select
          value={collectionId}
          onChange={e => setCollectionId(e.target.value)}
          className="h-7 px-2 text-xs border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
          aria-label="Collection"
        >
          <option value="">No collection</option>
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={sourceType}
          onChange={e => setSourceType(e.target.value)}
          className="h-7 px-2 text-xs border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
          aria-label="Document type"
        >
          {SOURCE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl w-full mx-auto">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          className="w-full text-3xl font-bold border-none outline-none bg-transparent text-foreground placeholder:text-muted-foreground/40 mb-6"
          aria-label="Document title"
        />

        {/* Tiptap toolbar */}
        {editor && <EditorToolbar editor={editor} />}

        {/* Editor content */}
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .tiptap { outline: none; }
        .tiptap p { margin: 0 0 6px; }
        .tiptap h1 { font-size:22px;font-weight:700;margin:16px 0 8px; }
        .tiptap h2 { font-size:18px;font-weight:700;margin:14px 0 6px; }
        .tiptap h3 { font-size:15px;font-weight:600;margin:10px 0 4px; }
        .tiptap ul, .tiptap ol { margin:4px 0 6px 24px;padding:0; }
        .tiptap code { background:var(--trella-surface-sunken);border-radius:3px;padding:1px 5px;font-size:13px;font-family:monospace; }
        .tiptap pre { background:var(--trella-surface-sunken);border-radius:6px;padding:12px 16px;margin:8px 0;overflow-x:auto; }
        .tiptap pre code { background:none;padding:0; }
        .tiptap p.is-editor-empty:first-child::before { content:attr(data-placeholder);color:var(--trella-text-subtlest);pointer-events:none;float:left;height:0; }
        .tiptap a { color:var(--trella-brand);text-decoration:underline; }
        .tiptap blockquote { border-left:3px solid var(--trella-border);margin:8px 0;padding-left:14px;color:var(--trella-text-subtle); }
      `}</style>
    </div>
  )
}

const TB_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 26, minWidth: 26, padding: '0 6px',
  border: 'none', borderRadius: 3, background: 'none',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
  transition: 'background 0.1s',
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btn = (label: string, active: boolean, onClick: () => void, title?: string, style?: React.CSSProperties) => (
    <button
      key={label} type="button" title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{ ...TB_BTN, ...style, background: active ? 'rgba(0,82,204,0.12)' : 'none', color: active ? 'var(--trella-brand)' : 'var(--trella-text-subtle)' }}
    >{label}</button>
  )
  const sep = <div key={`sep-${Math.random()}`} style={{ width: 1, height: 18, background: 'var(--trella-border)', margin: '0 2px' }} />

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '6px 8px', background: 'var(--trella-surface-sunken)', borderRadius: 6, border: '1px solid var(--trella-border)', marginBottom: 12 }}>
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold', { fontWeight: 700 })}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic', { fontStyle: 'italic' })}
      {btn('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Strikethrough', { textDecoration: 'line-through' })}
      {sep}
      {btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'Heading 1')}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2')}
      {sep}
      {btn('•—', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bullet list')}
      {btn('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Ordered list')}
      {sep}
      {btn('`', editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'Inline code')}
      {btn('</>', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), 'Code block')}
      {sep}
      {btn('↩', false, () => editor.chain().focus().undo().run(), 'Undo')}
      {btn('↪', false, () => editor.chain().focus().redo().run(), 'Redo')}
    </div>
  )
}
