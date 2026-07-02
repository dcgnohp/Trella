"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import TaskIcon from "@atlaskit/icon/core/task";
import BugIcon from "@atlaskit/icon/core/bug";
import StoryIcon from "@atlaskit/icon/core/story";
import SubtasksIcon from "@atlaskit/icon/core/subtasks";
import CalendarIcon from "@atlaskit/icon/core/calendar";
import PersonAvatarIcon from "@atlaskit/icon/core/person-avatar";
import ChevronUpIcon from "@atlaskit/icon/core/chevron-up";

import { ColumnsService, type ColumnPublic, type ProjectMemberPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";

interface AddTaskFormProps {
  column: ColumnPublic;
  boardId: string;
  onTaskCreated: () => void;
  projectMembers?: ProjectMemberPublic[];
}

const WORK_TYPES = [
  { key: "STORY", label: "Story", icon: <StoryIcon label="Story" size="small" />, color: "#64BA3B" },
  { key: "TASK", label: "Task", icon: <TaskIcon label="Task" size="small" />, color: "#0052CC" },
  { key: "BUG", label: "Bug", icon: <BugIcon label="Bug" size="small" />, color: "#FF5630" },
  { key: "SUBTASK", label: "Subtask", icon: <SubtasksIcon label="Subtask" size="small" />, color: "#7A869A" },
];

export const AddTaskForm = ({ column, boardId, onTaskCreated, projectMembers = [] }: AddTaskFormProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState("TASK");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [assigneeDrop, setAssigneeDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: (params: { title: string; type: string }) =>
      ColumnsService.Columns_columnsCreateTask({
        boardId,
        columnId: column.id,
        requestBody: {
          title: params.title,
          type: params.type,
          assigneeId: assigneeId ?? undefined,
          dueDate: dueDate || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(boardId) });
      setTitle("");
      setIsEditing(false);
      setSelectedType("TASK");
      setAssigneeId(null);
      setDueDate("");
      onTaskCreated();
    },
    onError: () => { toast.error("Failed to create task"); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate({ title: trimmed, type: selectedType });
  };

  const currentType = WORK_TYPES.find(t => t.key === selectedType) ?? WORK_TYPES[1];
  const assignee = assigneeId ? projectMembers.find(m => m.userId === assigneeId) : null;
  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (!isEditing) {
    return (
      <button
        onClick={() => { setIsEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        style={{
          display: "flex", width: "100%", alignItems: "center", gap: 6,
          borderRadius: 4, padding: "6px 8px", background: "none", border: "none",
          fontSize: 13, color: "#97A0AF", cursor: "pointer", transition: "color 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#172B4D")}
        onMouseLeave={e => (e.currentTarget.style.color = "#97A0AF")}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ border: "2px solid #0052CC", borderRadius: 6, background: "#FFFFFF", overflow: "visible" }}>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          disabled={createTask.isPending}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setIsEditing(false); setTitle(""); }
            if (e.key === "Enter") { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
          }}
          style={{
            display: "block", width: "100%", padding: "10px 12px",
            border: "none", outline: "none", background: "none",
            color: "#172B4D", fontSize: 13, boxSizing: "border-box",
          }}
        />

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", padding: "6px 8px", gap: 6, position: "relative" }}>

          {/* Work type */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setTypeMenuOpen(v => !v)}
              title={`Work type: ${currentType.label}`}
              style={{
                display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px",
                border: "1px solid #DFE1E6", borderRadius: 4, background: "none", cursor: "pointer",
                color: currentType.color, fontSize: 12, fontWeight: 500,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", color: currentType.color }}>{currentType.icon}</span>
              <span style={{ display: "flex", alignItems: "center", color: "#5E6C84" }}><ChevronUpIcon label="" size="small" /></span>
            </button>
            {typeMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 299 }} onClick={() => setTypeMenuOpen(false)} />
                <div style={{
                  position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 300,
                  background: "#2B2D31", border: "1px solid #3C3F45", borderRadius: 6,
                  padding: "4px 0", minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}>
                  {WORK_TYPES.map(t => (
                    <button key={t.key} type="button" onClick={() => { setSelectedType(t.key); setTypeMenuOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: t.color, fontSize: 13 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span style={{ display: "flex", alignItems: "center" }}>{t.icon}</span>
                      <span style={{ color: "#E0E2E7" }}>{t.label}</span>
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid #3C3F45", margin: "4px 0" }} />
                  {[{ label: "Add work type" }, { label: "Edit work type" }, { label: "Manage" }].map(item => (
                    <button key={item.label} type="button"
                      onClick={() => { setTypeMenuOpen(false); toast.info(`${item.label} — coming soon`); }}
                      style={{ display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "#9FADBC", fontSize: 13 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Due date */}
          <div style={{ position: "relative" }}>
            <button type="button"
              title={dueDate ? `Due: ${new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Set due date"}
              style={{
                display: "flex", alignItems: "center", height: 28,
                width: dueDate ? "auto" : 28, padding: dueDate ? "0 8px" : 0,
                border: "1px solid #DFE1E6", borderRadius: 4, background: "none", cursor: "pointer",
                justifyContent: "center", color: dueDate ? "#0052CC" : "#5E6C84", fontSize: 12, gap: 4,
              }}
              onClick={() => setShowDatePicker(v => !v)}>
              <CalendarIcon label="Due date" size="small" />
              {dueDate && new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </button>
            {showDatePicker && (
              <div style={{
                position: "absolute", bottom: "100%", left: 0, zIndex: 310,
                background: "#fff", border: "1px solid #DFE1E6", borderRadius: 6,
                padding: 8, boxShadow: "0 4px 16px rgba(9,30,66,0.18)", marginBottom: 4,
              }}>
                <input type="date" value={dueDate}
                  onChange={e => { setDueDate(e.target.value); setShowDatePicker(false); }}
                  style={{ fontSize: 13, border: "1px solid #DFE1E6", borderRadius: 4, padding: "4px 8px", outline: "none" }} />
                {dueDate && (
                  <button type="button" onClick={() => { setDueDate(""); setShowDatePicker(false); }}
                    style={{ display: "block", marginTop: 4, width: "100%", fontSize: 12, color: "#FF5630", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                    Clear date
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Assignee */}
          <div style={{ position: "relative" }}>
            <button type="button"
              title={assignee ? (assignee.fullName ?? assignee.email) : "Assign"}
              style={{
                display: "flex", alignItems: "center", height: 28,
                width: assignee ? "auto" : 28, padding: assignee ? "0 8px" : 0,
                border: "1px solid #DFE1E6", borderRadius: 4, background: "none", cursor: "pointer",
                justifyContent: "center", color: assignee ? "#172B4D" : "#5E6C84", fontSize: 12, gap: 4,
              }}
              onClick={() => setAssigneeDrop(v => !v)}>
              {assignee ? (
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "linear-gradient(135deg,#0052CC,#6554C0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "white" }}>
                  {initials(assignee.fullName ?? assignee.email)}
                </div>
              ) : (
                <PersonAvatarIcon label="Assign" size="small" />
              )}
              {assignee && <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assignee.fullName ?? assignee.email}</span>}
            </button>
            {assigneeDrop && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 309 }} onClick={() => setAssigneeDrop(false)} />
                <div style={{
                  position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 310,
                  background: "#FFFFFF", border: "1px solid #DFE1E6", borderRadius: 6,
                  minWidth: 180, boxShadow: "0 4px 16px rgba(9,30,66,0.18)", overflow: "hidden",
                }}>
                  {projectMembers.length === 0 && (
                    <div style={{ padding: "8px 12px", fontSize: 13, color: "#97A0AF" }}>No members</div>
                  )}
                  {projectMembers.map(m => (
                    <button key={m.id} type="button" onClick={() => { setAssigneeId(m.userId); setAssigneeDrop(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px",
                        background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#172B4D",
                        textAlign: "left", fontWeight: assigneeId === m.userId ? 600 : 400,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg,#0052CC,#6554C0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "white", flexShrink: 0 }}>
                        {initials(m.fullName ?? m.email)}
                      </div>
                      {m.fullName ?? m.email}
                    </button>
                  ))}
                  {assigneeId && (
                    <>
                      <div style={{ height: 1, backgroundColor: "#DFE1E6" }} />
                      <button type="button" onClick={() => { setAssigneeId(null); setAssigneeDrop(false); }}
                        style={{ display: "flex", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#FF5630", textAlign: "left" }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F4F5F7")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                        Remove assignee
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Submit */}
          <button type="submit" disabled={!title.trim() || createTask.isPending} title="Create task (Enter)"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 28, width: 28, border: "1px solid #DFE1E6", borderRadius: 4, background: "none",
              cursor: (!title.trim() || createTask.isPending) ? "not-allowed" : "pointer",
              color: (!title.trim() || createTask.isPending) ? "#DFE1E6" : "#0052CC",
              fontSize: 14, fontWeight: 600,
            }}>
            ↵
          </button>
        </div>
      </div>

      {/* Cancel */}
      <div style={{ paddingTop: 4 }}>
        <button type="button"
          onClick={() => { setIsEditing(false); setTitle(""); setAssigneeId(null); setDueDate(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#97A0AF", padding: 0 }}>
          Cancel (Esc)
        </button>
      </div>
    </form>
  );
};
