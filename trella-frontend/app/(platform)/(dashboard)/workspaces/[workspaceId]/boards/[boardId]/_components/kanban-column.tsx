"use client";

import { Droppable } from "@hello-pangea/dnd";
import type { TaskPublic, ColumnPublic, ProjectMemberPublic } from "@/lib/client";
import { cn } from "@/lib/utils";

import { KanbanTaskCard } from "./kanban-task-card";
import { AddTaskForm } from "./add-task-form";

interface KanbanColumnProps {
  column: ColumnPublic;
  tasks: TaskPublic[];
  boardId: string;
  projectMembers: ProjectMemberPublic[];
  onTaskClick: (task: TaskPublic) => void;
  onTaskCreated: () => void;
}

const STATUS_HEADER_CLASS: Record<string, string> = {
  TODO: "border-t-slate-400",
  IN_PROGRESS: "border-t-blue-500",
  PENDING: "border-t-yellow-500",
  DONE: "border-t-green-500",
};

export const KanbanColumn = ({
  column,
  tasks,
  boardId,
  projectMembers,
  onTaskClick,
  onTaskCreated,
}: KanbanColumnProps) => {
  const headerClass =
    STATUS_HEADER_CLASS[column.statusKey] ?? "border-t-slate-300";

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-[#f1f2f4] dark:bg-neutral-800 shadow-sm border border-neutral-200/50 dark:border-neutral-700/50">
      <div
        className={cn(
          "flex items-center justify-between border-t-2 rounded-t-lg px-3 py-2.5",
          headerClass,
        )}
      >
        <span className="text-sm font-semibold">{column.name}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "min-h-[2rem] flex-1 px-2 pt-2 transition-colors",
              snapshot.isDraggingOver && "bg-neutral-200/50 dark:bg-neutral-700/50",
            )}
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

      <div className="px-2 pb-2">
        <AddTaskForm
          column={column}
          boardId={boardId}
          onTaskCreated={onTaskCreated}
        />
      </div>
    </div>
  );
};
