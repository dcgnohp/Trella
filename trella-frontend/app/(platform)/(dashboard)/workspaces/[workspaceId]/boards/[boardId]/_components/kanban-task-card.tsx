"use client";

import { Draggable } from "@hello-pangea/dnd";
import type { TaskPublic, ColumnPublic, ProjectMemberPublic } from "@/lib/client";
import type { CanonicalStatus } from "@/lib/status/display-style";
import { TaskCard } from "@/components/ads/task-card";

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
          style={{
            ...(provided.draggableProps.style as React.CSSProperties),
            marginBottom: 8,
            opacity: snapshot.isDragging ? 0.85 : 1,
          }}
        >
          <TaskCard
            task={effectiveTask}
            assignee={assignee}
            dragHandleProps={provided.dragHandleProps}
            onClick={() => onClick(task)}
          />
        </div>
      )}
    </Draggable>
  );
};

