"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Droppable } from "@hello-pangea/dnd";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { TaskPublic, ColumnPublic, ProjectMemberPublic } from "@/lib/client";
import { ColumnsService } from "@/lib/client";
import { token } from "@atlaskit/tokens";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import DeleteIcon from "@atlaskit/icon/core/delete";

import { KanbanTaskCard } from "./kanban-task-card";
import { AddTaskForm } from "./add-task-form";

interface KanbanColumnProps {
  column: ColumnPublic;
  tasks: TaskPublic[];
  subtasksByParent: Map<string, TaskPublic[]>;
  boardId: string;
  workspaceId: string;
  projectMembers: ProjectMemberPublic[];
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onTaskClick: (task: TaskPublic) => void;
  onTaskCreated: () => void;
  isScrum?: boolean;
  boardIsEmpty?: boolean;
}

const STATUS_ACCENT: Record<string, string> = {
  TODO: "var(--trella-text-subtle)",
  IN_PROGRESS: token("color.border.brand"),
  PENDING: token("color.border.warning"),
  DONE: token("color.border.success"),
};

export const KanbanColumn = ({
  column,
  tasks,
  subtasksByParent,
  boardId,
  workspaceId,
  projectMembers,
  dragHandleProps,
  onTaskClick,
  onTaskCreated,
  isScrum,
  boardIsEmpty,
}: KanbanColumnProps) => {
  const accent = STATUS_ACCENT[column.statusKey] ?? "var(--trella-text-subtle)";
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await ColumnsService.Columns_columnsDeleteColumn({ boardId, columnId: column.id });
      await queryClient.invalidateQueries({ queryKey: queryKeys.boardColumns(boardId) });
      toast.success(`Column "${column.name}" deleted`);
    } catch {
      toast.error("Failed to delete column");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      style={{
        width: 272,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: "6px",
        backgroundColor: "var(--trella-surface-sunken)",
        border: "1px solid var(--trella-border)",
        overflow: "hidden",
        maxHeight: "calc(100vh - 200px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Column header */}
      <div
        {...dragHandleProps}
        style={{
          borderTop: `3px solid ${accent}`,
          padding: "10px 12px 10px 14px",
          cursor: dragHandleProps ? "grab" : "default",
          backgroundColor: "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: "0.05em" }}>
            {column.name.toUpperCase()}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              minWidth: 20, height: 20, borderRadius: 10,
              backgroundColor: "var(--trella-surface-selected)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, color: "var(--trella-text-subtle)", padding: "0 6px",
            }}>{tasks.length}</div>
            {/* Delete button — visible on hover */}
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 4,
                background: "none", border: "none", cursor: "pointer",
                color: "var(--trella-text-subtlest)",
                opacity: hovered ? 1 : 0,
                transition: "opacity 0.15s, color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#FF5630")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--trella-text-subtlest)")}
              title="Delete column"
            >
              <DeleteIcon label="Delete" size="small" />
            </button>
          </div>
        </div>
      </div>

      {/* Task list */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex: 1,
              minHeight: 40,
              overflowY: 'auto',
              padding: "0 8px",
              backgroundColor: snapshot.isDraggingOver ? "rgba(0,82,204,0.06)" : "transparent",
              transition: "background-color 0.15s ease",
            }}
          >
            {isScrum && boardIsEmpty && column.statusKey === 'TODO' && (
              <div style={{ margin: '8px 0', padding: '20px 12px', textAlign: 'center', border: '1px dashed var(--trella-border)', borderRadius: 8, background: 'var(--trella-surface-raised)' }}>
                {/* scrum sprint icon */}
                <svg width="40" height="40" viewBox="0 0 40 40" style={{ margin: '0 auto 10px', display: 'block' }}>
                  <circle cx="20" cy="20" r="18" stroke="var(--trella-brand)" strokeWidth="2" fill="none"/>
                  <path d="M20 10 A10 10 0 1 1 10 20" stroke="var(--trella-brand)" strokeWidth="3" fill="none" strokeLinecap="round"/>
                  <path d="M18 6 L20 10 L24 8" stroke="var(--trella-brand)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--trella-text)', margin: '0 0 4px' }}>Get started in the backlog</p>
                <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', margin: '0 0 12px', lineHeight: 1.4 }}>Plan and start a sprint to see work here.</p>
                <button
                  onClick={() => router.push(`/workspaces/${workspaceId}/backlog`)}
                  style={{
                    padding: '5px 14px', fontSize: 12, borderRadius: 4,
                    border: '1px solid var(--trella-border)', background: 'var(--trella-surface)',
                    color: 'var(--trella-text)', cursor: 'pointer',
                  }}
                >
                  Go to Backlog
                </button>
              </div>
            )}
            {tasks.map((task, index) => (
              <KanbanTaskCard
                key={task.id}
                task={task}
                column={column}
                index={index}
                projectMembers={projectMembers}
                subtasks={subtasksByParent.get(task.id) ?? []}
                onClick={onTaskClick}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add task */}
      <div style={{ padding: "8px" }}>
        <AddTaskForm column={column} boardId={boardId} onTaskCreated={onTaskCreated} projectMembers={projectMembers} />
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(9,30,66,0.4)" }} onClick={() => setConfirmDelete(false)} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 200, background: "var(--trella-surface)", borderRadius: 8, padding: 24, width: 360,
            boxShadow: "0 8px 32px rgba(9,30,66,0.25)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--trella-text)", marginBottom: 8 }}>Delete column?</div>
            <div style={{ fontSize: 14, color: "var(--trella-text-subtle)", marginBottom: 20, lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{column.name}</strong>?
              {tasks.length > 0 && <> This column has <strong>{tasks.length}</strong> task{tasks.length > 1 ? "s" : ""} that will also be removed.</>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ height: 32, padding: "0 14px", border: "1px solid var(--trella-border)", borderRadius: 4, background: "var(--trella-surface)", color: "var(--trella-text-subtle)", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 4, background: "#FF5630", color: "var(--trella-surface)", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
