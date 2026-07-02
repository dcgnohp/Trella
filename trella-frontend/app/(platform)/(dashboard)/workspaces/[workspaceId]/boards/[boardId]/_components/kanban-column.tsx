"use client";

import { useState } from "react";
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
  projectMembers: ProjectMemberPublic[];
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onTaskClick: (task: TaskPublic) => void;
  onTaskCreated: () => void;
}

const STATUS_ACCENT: Record<string, string> = {
  TODO: token("color.border"),
  IN_PROGRESS: token("color.border.brand"),
  PENDING: token("color.border.warning"),
  DONE: token("color.border.success"),
};

export const KanbanColumn = ({
  column,
  tasks,
  subtasksByParent,
  boardId,
  projectMembers,
  dragHandleProps,
  onTaskClick,
  onTaskCreated,
}: KanbanColumnProps) => {
  const accent = STATUS_ACCENT[column.statusKey] ?? token("color.border");
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

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
        backgroundColor: "#F4F5F7",
        border: "1px solid #DFE1E6",
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
              backgroundColor: "rgba(9,30,66,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, color: "#5E6C84", padding: "0 6px",
            }}>{tasks.length}</div>
            {/* Delete button — visible on hover */}
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 4,
                background: "none", border: "none", cursor: "pointer",
                color: "#97A0AF",
                opacity: hovered ? 1 : 0,
                transition: "opacity 0.15s, color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#FF5630")}
              onMouseLeave={e => (e.currentTarget.style.color = "#97A0AF")}
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
            zIndex: 200, background: "#FFFFFF", borderRadius: 8, padding: 24, width: 360,
            boxShadow: "0 8px 32px rgba(9,30,66,0.25)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#172B4D", marginBottom: 8 }}>Delete column?</div>
            <div style={{ fontSize: 14, color: "#5E6C84", marginBottom: 20, lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{column.name}</strong>?
              {tasks.length > 0 && <> This column has <strong>{tasks.length}</strong> task{tasks.length > 1 ? "s" : ""} that will also be removed.</>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ height: 32, padding: "0 14px", border: "1px solid #DFE1E6", borderRadius: 4, background: "#FFFFFF", color: "#5E6C84", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 4, background: "#FF5630", color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}
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
