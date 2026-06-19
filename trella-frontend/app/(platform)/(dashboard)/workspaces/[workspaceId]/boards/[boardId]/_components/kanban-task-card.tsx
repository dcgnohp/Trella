"use client";

import { Draggable } from "@hello-pangea/dnd";
import type { TaskPublic, ColumnPublic, ProjectMemberPublic } from "@/lib/client";
import type { CanonicalStatus } from "@/lib/status/display-style";
import { TaskCard } from "@/components/task-card";

interface KanbanTaskCardProps {
  task: TaskPublic;
  column: ColumnPublic;
  index: number;
  projectMembers: ProjectMemberPublic[];
  onClick: (task: TaskPublic) => void;
}

export const KanbanTaskCard = ({
  task,
  column,
  index,
  projectMembers,
  onClick,
}: KanbanTaskCardProps) => {
  // If the task has no custom status, synthesise one from the column's statusKey
  // so TaskCard always has a canonical to derive its DisplayStyle from.
  const effectiveTask: TaskPublic =
    task.customStatus == null
      ? {
          ...task,
          customStatus: {
            id: "",
            name: column.name,
            color: null,
            canonicalStatus: column.statusKey as CanonicalStatus,
          },
        }
      : task;

  // Resolve the assignee for display on the board
  const assigneeMember = task.assigneeId
    ? projectMembers.find((m) => m.userId === task.assigneeId)
    : null;

  const assignee = assigneeMember
    ? {
        id: assigneeMember.userId,
        fullName: assigneeMember.fullName,
        avatarUrl: assigneeMember.avatarUrl,
      }
    : null;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={provided.draggableProps.style as React.CSSProperties}
          className={snapshot.isDragging ? "opacity-80" : ""}
        >
          <TaskCard
            task={effectiveTask}
            assignee={assignee}
            dragHandleProps={provided.dragHandleProps}
            onClick={() => onClick(task)}
            className="mb-2"
          />
        </div>
      )}
    </Draggable>
  );
};
