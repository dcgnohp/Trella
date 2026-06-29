"use client";

import { Droppable } from "@hello-pangea/dnd";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { TaskPublic, ColumnPublic, ProjectMemberPublic } from "@/lib/client";
import { token } from "@atlaskit/tokens";

import { KanbanTaskCard } from "./kanban-task-card";
import { AddTaskForm } from "./add-task-form";

interface KanbanColumnProps {
  column: ColumnPublic;
  tasks: TaskPublic[];
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
  boardId,
  projectMembers,
  dragHandleProps,
  onTaskClick,
  onTaskCreated,
}: KanbanColumnProps) => {
  const accent = STATUS_ACCENT[column.statusKey] ?? token("color.border");

  return (
    <div style={{
      width: 272,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRadius: "6px",
      backgroundColor: "#F4F5F7",
      border: "1px solid #DFE1E6",
      overflow: "hidden",
      maxHeight: "calc(100vh - 200px)",
    }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: '0.05em' }}>
            {column.name.toUpperCase()}
          </span>
          <div style={{
            minWidth: 20, height: 20, borderRadius: 10,
            backgroundColor: 'rgba(9,30,66,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: '#5E6C84',
            padding: '0 6px',
          }}>{tasks.length}</div>
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
                onClick={onTaskClick}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add task */}
      <div style={{ padding: "8px" }}>
        <AddTaskForm column={column} boardId={boardId} onTaskCreated={onTaskCreated} />
      </div>
    </div>
  );
};
