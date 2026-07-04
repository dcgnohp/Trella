"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

interface DescriptionEditorProps {
  value: string | null;
  onSave: (html: string | null) => void;
  disabled?: boolean;
}

const TB_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  height: 26, minWidth: 26, padding: "0 6px",
  border: "none", borderRadius: 3, background: "none",
  cursor: "pointer", fontSize: 12, fontWeight: 600,
  color: "var(--trella-text-subtle)", transition: "background 0.1s",
};

export function DescriptionEditor({ value, onSave, disabled }: DescriptionEditorProps) {
  const [editing, setEditing] = React.useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { style: "color:var(--trella-brand);text-decoration:underline;cursor:pointer;" } }),
      Placeholder.configure({ placeholder: "Add a description…" }),
    ],
    content: value ?? "",
    editable: !disabled,
    editorProps: {
      attributes: {
        style: "outline:none;min-height:80px;font-size:14px;color:var(--trella-text);line-height:1.6;padding:10px 12px;",
      },
    },
  });

  // Sync when task changes
  React.useEffect(() => {
    if (editor && !editing) {
      editor.commands.setContent(value ?? "");
    }
  }, [value, editor, editing]);

  const handleSave = () => {
    if (!editor) return;
    const html = editor.getText().trim() ? editor.getHTML() : null;
    onSave(html);
    setEditing(false);
  };

  const handleCancel = () => {
    editor?.commands.setContent(value ?? "");
    setEditing(false);
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) { editor.chain().focus().unsetLink().run(); }
    else { editor.chain().focus().extendMarkRange("link").setLink({ href: url.startsWith("http") ? url : `https://${url}` }).run(); }
    setLinkDialogOpen(false);
    setLinkUrl("");
  };

  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--trella-text)" }}>Description</p>

      <div
        style={{
          border: editing ? "1px solid #0052CC" : "1px solid transparent",
          borderRadius: 6, background: editing ? "var(--trella-surface)" : "transparent",
          transition: "border-color 0.15s",
          cursor: editing ? "text" : "pointer",
        }}
        onClick={() => { if (!editing && !disabled) { setEditing(true); setTimeout(() => editor?.commands.focus("end"), 0); } }}
      >
        {/* Toolbar — only when editing */}
        {editing && editor && (
          <div style={{
            display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
            padding: "6px 8px", borderBottom: "1px solid var(--trella-border)",
          }}>
            <ToolBtn
              title="Bold (Ctrl+B)"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >B</ToolBtn>

            <ToolBtn
              title="Italic (Ctrl+I)"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              style={{ fontStyle: "italic" }}
            >I</ToolBtn>

            <ToolBtn
              title="Strikethrough"
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              style={{ textDecoration: "line-through" }}
            >S</ToolBtn>

            <Sep />

            <ToolBtn
              title="Heading 2"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >H2</ToolBtn>

            <ToolBtn
              title="Heading 3"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >H3</ToolBtn>

            <Sep />

            <ToolBtn
              title="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >•—</ToolBtn>

            <ToolBtn
              title="Ordered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >1.</ToolBtn>

            <Sep />

            <ToolBtn
              title="Code"
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >{"`"}</ToolBtn>

            <ToolBtn
              title="Code block"
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >{"</>"}</ToolBtn>

            <Sep />

            {/* Link */}
            <ToolBtn
              title="Add / edit link"
              active={editor.isActive("link")}
              onClick={() => {
                const prev = editor.getAttributes("link").href as string | undefined;
                setLinkUrl(prev ?? "");
                setLinkDialogOpen(true);
              }}
            >🔗</ToolBtn>

            <Sep />

            <ToolBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}>↩</ToolBtn>
            <ToolBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}>↪</ToolBtn>
          </div>
        )}

        {/* Editor area */}
        <div
          style={{
            minHeight: editing ? 100 : 40,
            color: (!value && !editing) ? "var(--trella-text-subtlest)" : "var(--trella-text)",
          }}
          onClick={() => { if (!editing && !disabled) { setEditing(true); setTimeout(() => editor?.commands.focus("end"), 0); } }}
        >
          {(!editing && !value) ? (
            <p style={{ margin: 0, padding: "10px 12px", fontSize: 14, color: "var(--trella-text-subtlest)" }}>
              Add a description…
            </p>
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>
      </div>

      {/* Save / Cancel buttons — only when editing */}
      {editing && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={handleSave}
            style={{
              height: 32, padding: "0 16px", borderRadius: 4, border: "none",
              background: "var(--trella-brand)", color: "var(--trella-surface)", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            style={{
              height: 32, padding: "0 14px", borderRadius: 4, border: "none",
              background: "none", color: "var(--trella-text-subtle)", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Link dialog */}
      {linkDialogOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 499 }} onClick={() => setLinkDialogOpen(false)} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 500, background: "var(--trella-surface)", borderRadius: 8, padding: "20px 24px",
            boxShadow: "var(--trella-shadow-overlay)", width: 360, border: "1px solid var(--trella-border)",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--trella-text)" }}>Add link</p>
            <input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={e => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") setLinkDialogOpen(false); }}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--trella-border)", borderRadius: 4,
                fontSize: 13, color: "var(--trella-text)", outline: "none",
                boxSizing: "border-box", marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setLinkDialogOpen(false)}
                style={{ height: 32, padding: "0 14px", border: "1px solid var(--trella-border)", borderRadius: 4, background: "var(--trella-surface)", color: "var(--trella-text-subtle)", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={applyLink}
                style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 4, background: "var(--trella-brand)", color: "var(--trella-surface)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}

      {/* TipTap base styles */}
      <style>{`
        .tiptap p { margin: 0 0 4px; }
        .tiptap ul, .tiptap ol { margin: 4px 0 4px 20px; padding: 0; }
        .tiptap h2 { font-size: 18px; font-weight: 700; margin: 8px 0 4px; color: var(--trella-text); }
        .tiptap h3 { font-size: 15px; font-weight: 600; margin: 6px 0 4px; color: var(--trella-text); }
        .tiptap code { background: var(--trella-surface-sunken); border-radius: 3px; padding: 1px 5px; font-size: 12px; font-family: monospace; color: var(--trella-text); }
        .tiptap pre { background: var(--trella-surface-sunken); color: var(--trella-text); border-radius: 6px; padding: 12px 16px; margin: 8px 0; overflow-x: auto; }
        .tiptap pre code { background: none; padding: 0; color: inherit; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--trella-text-subtlest); pointer-events: none; float: left; height: 0; }
        .tiptap a { color: var(--trella-brand); text-decoration: underline; cursor: pointer; }
        .tiptap a:hover { color: var(--trella-brand-hover); }
      `}</style>
    </div>
  );
}

function ToolBtn({
  children, onClick, active, title, style: extraStyle,
}: {
  children: React.ReactNode; onClick: () => void; active?: boolean;
  title?: string; style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{
        ...TB_BTN,
        ...extraStyle,
        background: active ? "rgba(0,82,204,0.12)" : "none",
        color: active ? "var(--trella-brand)" : "var(--trella-text-subtle)",
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 18, background: "var(--trella-border)", margin: "0 2px" }} />;
}
