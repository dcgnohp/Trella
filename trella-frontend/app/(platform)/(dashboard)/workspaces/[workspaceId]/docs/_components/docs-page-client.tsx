"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { toast } from "sonner";

interface Doc {
  id: string;
  title: string;
  content: string | null;
  parentId: string | null;
  taskId: string | null;
  createdBy: string;
  position: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchDocs(workspaceId: string): Promise<Doc[]> {
  const res = await fetch(`/api/docs/${workspaceId}`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

async function createDoc(workspaceId: string, data: { title: string; parentId?: string | null; position?: number }) {
  const res = await fetch(`/api/docs/${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create doc");
  return res.json();
}

async function updateDoc(workspaceId: string, docId: string, data: Partial<Doc>) {
  const res = await fetch(`/api/docs/${workspaceId}/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update doc");
  return res.json();
}

async function deleteDoc(workspaceId: string, docId: string) {
  await fetch(`/api/docs/${workspaceId}/${docId}`, { method: "DELETE" });
}

export function DocsPageClient({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: ["docs", workspaceId],
    queryFn: () => fetchDocs(workspaceId),
  });

  const createMut = useMutation({
    mutationFn: (data: { title: string; parentId?: string | null }) => createDoc(workspaceId, data),
    onSuccess: (doc: Doc) => {
      qc.invalidateQueries({ queryKey: ["docs", workspaceId] });
      setSelectedId(doc.id);
    },
    onError: () => toast.error("Failed to create doc"),
  });

  const updateMut = useMutation({
    mutationFn: ({ docId, data }: { docId: string; data: Partial<Doc> }) => updateDoc(workspaceId, docId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs", workspaceId] }),
    onError: () => toast.error("Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: (docId: string) => deleteDoc(workspaceId, docId),
    onSuccess: (_, docId) => {
      qc.invalidateQueries({ queryKey: ["docs", workspaceId] });
      if (selectedId === docId) setSelectedId(null);
    },
    onError: () => toast.error("Failed to delete"),
  });

  const selected = docs.find(d => d.id === selectedId) ?? null;

  // Auto-select first doc
  React.useEffect(() => {
    if (!selectedId && docs.length > 0) setSelectedId(docs[0].id);
  }, [docs, selectedId]);

  // Sync title draft
  React.useEffect(() => {
    if (selected) setTitleDraft(selected.title);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: selected?.content ?? "",
    editorProps: {
      attributes: { style: "outline:none;min-height:300px;font-size:15px;color:var(--trella-text);line-height:1.7;padding:0;" },
    },
    onUpdate: ({ editor }) => {
      if (!selectedId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaving(true);
      saveTimer.current = setTimeout(() => {
        const html = editor.getText().trim() ? editor.getHTML() : null;
        updateMut.mutate({ docId: selectedId, data: { content: html } }, {
          onSettled: () => setSaving(false),
        });
      }, 800);
    },
  });

  // Sync editor when switching doc
  React.useEffect(() => {
    if (editor && selected) {
      editor.commands.setContent(selected.content ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const roots = docs.filter(d => !d.parentId);
  const children = (parentId: string) => docs.filter(d => d.parentId === parentId);

  const saveTitle = () => {
    if (!selected || titleDraft === selected.title) { setEditingTitle(false); return; }
    updateMut.mutate({ docId: selected.id, data: { title: titleDraft } });
    setEditingTitle(false);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: "1px solid var(--trella-border)",
        display: "flex", flexDirection: "column", background: "var(--trella-surface-sunken)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "12px 12px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--trella-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Docs
          </span>
          <button
            title="New root doc"
            onClick={() => createMut.mutate({ title: "Untitled" })}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--trella-text-subtle)", padding: "0 2px" }}
          >+</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 12px" }}>
          {isLoading && <p style={{ padding: "8px 12px", fontSize: 13, color: "var(--trella-text-subtlest)" }}>Loading…</p>}
          {!isLoading && roots.length === 0 && (
            <p style={{ padding: "8px 12px", fontSize: 13, color: "var(--trella-text-subtlest)" }}>No docs yet. Click + to create one.</p>
          )}
          {roots.map(doc => (
            <DocTreeNode
              key={doc.id}
              doc={doc}
              subDocs={children(doc.id)}
              selected={selectedId}
              onSelect={setSelectedId}
              onAddChild={(parentId) => createMut.mutate({ title: "Untitled", parentId })}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selected ? (
          <>
            {/* Doc header */}
            <div style={{ padding: "20px 32px 12px", borderBottom: "1px solid var(--trella-border)", flexShrink: 0 }}>
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(selected.title); } }}
                  style={{
                    fontSize: 24, fontWeight: 700, border: "none", outline: "none",
                    background: "transparent", color: "var(--trella-text)", width: "100%",
                    borderBottom: "2px solid var(--trella-brand)", paddingBottom: 2,
                  }}
                />
              ) : (
                <h1
                  onClick={() => setEditingTitle(true)}
                  style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--trella-text)", cursor: "text" }}
                  title="Click to edit title"
                >
                  {selected.title}
                </h1>
              )}
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12 }}>
                {selected.taskId && (
                  <span style={{ fontSize: 12, color: "var(--trella-text-subtle)", background: "var(--trella-surface-sunken)", borderRadius: 4, padding: "2px 8px", border: "1px solid var(--trella-border)" }}>
                    Linked to task
                  </span>
                )}
                {saving && <span style={{ fontSize: 12, color: "var(--trella-text-subtlest)" }}>Saving…</span>}
              </div>
            </div>

            {/* Tiptap toolbar + content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 32px" }}>
              {editor && <EditorToolbar editor={editor} />}
              <div style={{ marginTop: 8 }}>
                <EditorContent editor={editor} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--trella-text-subtlest)" }}>
            <span style={{ fontSize: 40 }}>📄</span>
            <p style={{ margin: 0, fontSize: 15 }}>Select a doc or create a new one</p>
            <button
              onClick={() => createMut.mutate({ title: "Untitled" })}
              style={{ height: 36, padding: "0 20px", borderRadius: 6, border: "none", background: "var(--trella-brand)", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              New Doc
            </button>
          </div>
        )}
      </div>

      <DocsEditorStyles />
    </div>
  );
}

function DocTreeNode({ doc, subDocs, selected, onSelect, onAddChild, onDelete }: {
  doc: Doc;
  subDocs: Doc[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const isSelected = doc.id === selected;

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "5px 8px", borderRadius: 5, cursor: "pointer",
          background: isSelected ? "rgba(0,82,204,0.08)" : hovered ? "var(--trella-surface-hovered)" : "transparent",
          color: isSelected ? "var(--trella-brand)" : "var(--trella-text)",
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>📄</span>
        <span
          onClick={() => onSelect(doc.id)}
          style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {doc.title}
        </span>
        {hovered && (
          <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <button
              title="Add sub-doc"
              onClick={(e) => { e.stopPropagation(); onAddChild(doc.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text-subtle)", padding: "0 3px", lineHeight: 1 }}
            >+</button>
            <button
              title="Delete"
              onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${doc.title}"?`)) onDelete(doc.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--trella-text-subtle)", padding: "0 3px", lineHeight: 1 }}
            >×</button>
          </span>
        )}
      </div>
      {subDocs.length > 0 && (
        <div style={{ marginLeft: 16 }}>
          {subDocs.map(child => (
            <DocTreeNode
              key={child.id}
              doc={child}
              subDocs={[]}
              selected={selected}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TB: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  height: 26, minWidth: 26, padding: "0 6px",
  border: "none", borderRadius: 3, background: "none",
  cursor: "pointer", fontSize: 12, fontWeight: 600,
  color: "var(--trella-text-subtle)", transition: "background 0.1s",
};

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (label: string, active: boolean, onClick: () => void, title?: string, style?: React.CSSProperties) => (
    <button
      key={label}
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{ ...TB, ...style, background: active ? "rgba(0,82,204,0.12)" : "none", color: active ? "var(--trella-brand)" : "var(--trella-text-subtle)" }}
    >{label}</button>
  );
  const sep = <div key="sep" style={{ width: 1, height: 18, background: "var(--trella-border)", margin: "0 2px" }} />;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, padding: "6px 8px", background: "var(--trella-surface-sunken)", borderRadius: 6, border: "1px solid var(--trella-border)", marginBottom: 12 }}>
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold", { fontWeight: 700 })}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic", { fontStyle: "italic" })}
      {btn("S", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "Strikethrough", { textDecoration: "line-through" })}
      {sep}
      {btn("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "Heading 1")}
      {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Heading 2")}
      {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Heading 3")}
      {sep}
      {btn("•—", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Bullet list")}
      {btn("1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Ordered list")}
      {sep}
      {btn("`", editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), "Inline code")}
      {btn("</>", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), "Code block")}
      {btn("❝", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "Blockquote")}
      {sep}
      {btn("↩", false, () => editor.chain().focus().undo().run(), "Undo")}
      {btn("↪", false, () => editor.chain().focus().redo().run(), "Redo")}
    </div>
  );
}

function DocsEditorStyles() {
  const css = [
    ".tiptap { outline: none; }",
    ".tiptap p { margin: 0 0 6px; }",
    ".tiptap ul, .tiptap ol { margin: 4px 0 6px 24px; padding: 0; }",
    ".tiptap h1 { font-size: 22px; font-weight: 700; margin: 16px 0 8px; color: var(--trella-text); }",
    ".tiptap h2 { font-size: 18px; font-weight: 700; margin: 14px 0 6px; color: var(--trella-text); }",
    ".tiptap h3 { font-size: 15px; font-weight: 600; margin: 10px 0 4px; color: var(--trella-text); }",
    ".tiptap code { background: var(--trella-surface-sunken); border-radius: 3px; padding: 1px 5px; font-size: 13px; font-family: monospace; color: var(--trella-text); }",
    ".tiptap pre { background: var(--trella-surface-sunken); border-radius: 6px; padding: 12px 16px; margin: 8px 0; overflow-x: auto; }",
    ".tiptap pre code { background: none; padding: 0; }",
    ".tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--trella-text-subtlest); pointer-events: none; float: left; height: 0; }",
    ".tiptap a { color: var(--trella-brand); text-decoration: underline; }",
    ".tiptap blockquote { border-left: 3px solid var(--trella-border); margin: 8px 0; padding-left: 14px; color: var(--trella-text-subtle); }",
    ".tiptap hr { border: none; border-top: 1px solid var(--trella-border); margin: 16px 0; }",
  ].join("\n");
  // eslint-disable-next-line react/no-danger
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
