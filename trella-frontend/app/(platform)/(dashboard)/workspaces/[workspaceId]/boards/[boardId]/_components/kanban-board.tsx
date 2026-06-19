"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import {
  BoardsService,
  ColumnsService,
  TasksService,
  type ColumnPublic,
  type CustomStatusEmbed,
  type TaskPublic,
  type ProjectMemberPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { KanbanColumn } from "./kanban-column";

interface KanbanBoardProps {
  boardId: string;
  workspaceId: string;
  columns: ColumnPublic[];
  tasks: TaskPublic[];
  customStatuses: CustomStatusEmbed[];
  projectMembers: ProjectMemberPublic[];
  onTaskClick: (task: TaskPublic) => void;
}

export const KanbanBoard = ({
  boardId,
  workspaceId,
  columns,
  tasks,
  customStatuses,
  projectMembers,
  onTaskClick,
}: KanbanBoardProps) => {
  const queryClient = useQueryClient();

  const [isAdding, setIsAdding] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close suggestions and reset when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setIsAdding(false);
        setColumnName("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter custom statuses for autocomplete suggestions
  const filteredSuggestions = useMemo(() => {
    if (!columnName) return customStatuses;
    const lower = columnName.toLowerCase();
    return customStatuses.filter((cs) =>
      cs.name.toLowerCase().includes(lower),
    );
  }, [customStatuses, columnName]);

  // Group tasks by column id for efficient lookup
  const tasksByColumn = useMemo(() => {
    const map = new Map<string, TaskPublic[]>();
    for (const col of columns) {
      map.set(col.id, []);
    }
    for (const task of tasks) {
      const list = map.get(task.columnId) ?? [];
      list.push(task);
      map.set(task.columnId, list);
    }
    // Sort each column's tasks by position
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [columns, tasks]);

  const moveTask = useMutation({
    mutationFn: ({
      taskId,
      columnId,
      customStatusId,
    }: {
      taskId: string;
      columnId: string;
      customStatusId: string | null;
    }) =>
      TasksService.Tasks_tasksUpdateTask({
        taskId,
        requestBody: { columnId, customStatusId },
      }),
    onError: () => {
      toast.error("Failed to move task");
      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(boardId) });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(boardId) });
    },
  });

  const reorderColumns = useMutation({
    mutationFn: (items: { id: string; position: number }[]) =>
      ColumnsService.Columns_columnsReorderColumns({
        boardId,
        requestBody: { items },
      }),
    onError: () => {
      toast.error("Failed to reorder columns");
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardColumns(boardId),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardColumns(boardId),
      });
    },
  });

  const createColumn = useMutation({
    mutationFn: ({ name, statusKey }: { name: string; statusKey: string }) =>
      ColumnsService.Columns_columnsCreateColumn({
        boardId,
        requestBody: { name, statusKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardColumns(boardId),
      });
      setColumnName("");
      setIsAdding(false);
      toast.success("Column created successfully");
    },
    onError: () => {
      toast.error("Failed to create column");
    },
  });

  const handleAddColumn = (name: string, statusKey: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createColumn.mutate({ name: trimmed, statusKey });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = columnName.trim();
    if (!trimmed) return;

    // Resolve statusKey based on columnName
    const matched = customStatuses.find(
      (cs) => cs.name.toLowerCase() === trimmed.toLowerCase(),
    );
    let statusKey = matched?.canonicalStatus || null;

    if (!statusKey) {
      // Check if it matches a canonical status string directly
      const upper = trimmed.toUpperCase();
      if (["TODO", "IN_PROGRESS", "PENDING", "DONE"].includes(upper)) {
        statusKey = upper;
      } else if (trimmed.toLowerCase() === "to do") {
        statusKey = "TODO";
      } else if (trimmed.toLowerCase() === "in progress") {
        statusKey = "IN_PROGRESS";
      } else {
        statusKey = "TODO"; // Fallback
      }
    }

    handleAddColumn(trimmed, statusKey);
  };

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;

      const { source, destination, type } = result;

      if (type === "COLUMN") {
        if (source.index === destination.index) return;
        const reordered = Array.from(columns);
        const [moved] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, moved);
        const items = reordered.map((col, i) => ({ id: col.id, position: i }));
        reorderColumns.mutate(items);
        return;
      }

      // Task drag
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      const destColumn = columns.find((c) => c.id === destination.droppableId);
      if (!destColumn) return;

      // Column-drives-status: match either by canonicalStatus key OR name (case-insensitive)
      const matchingStatus = customStatuses.find(
        (cs) =>
          (cs.canonicalStatus && cs.canonicalStatus === destColumn.statusKey) ||
          (cs.name &&
            cs.name.toLowerCase() === destColumn.name.toLowerCase()),
      );
      const customStatusId = matchingStatus?.id ?? null;

      const taskId = result.draggableId;

      // Optimistic update
      queryClient.setQueryData<TaskPublic[]>(
        queryKeys.boardTasks(boardId),
        (prev) => {
          if (!prev) return prev;
          return prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  columnId: destination.droppableId,
                  customStatusId,
                  customStatus: matchingStatus ?? null,
                }
              : t,
          );
        },
      );

      moveTask.mutate({
        taskId,
        columnId: destination.droppableId,
        customStatusId,
      });
    },
    [columns, customStatuses, boardId, moveTask, reorderColumns, queryClient],
  );

  const handleTaskCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(boardId) });
  }, [boardId, queryClient]);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 items-start overflow-x-auto px-4 pb-4 h-full">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn.get(column.id) ?? []}
            boardId={boardId}
            projectMembers={projectMembers}
            onTaskClick={onTaskClick}
            onTaskCreated={handleTaskCreated}
          />
        ))}

        <div ref={containerRef} className="w-72 shrink-0 relative">
          {isAdding ? (
            <form
              onSubmit={onSubmit}
              className="w-full p-3 rounded-lg border bg-background space-y-3 shadow-sm"
            >
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={columnName}
                  onChange={(e) => {
                    setColumnName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Column name (e.g. In review)..."
                  className="h-8 text-sm bg-background"
                />

                {/* Autocomplete Suggestions */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Map to Workspace Status
                    </p>
                    {filteredSuggestions.map((cs) => (
                      <button
                        key={cs.id}
                        type="button"
                        onClick={() => {
                          setColumnName(cs.name);
                          setShowSuggestions(false);
                          handleAddColumn(
                            cs.name,
                            cs.canonicalStatus || "TODO",
                          );
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted text-popover-foreground transition"
                      >
                        {cs.color && (
                          <span
                            className="h-3 w-3 shrink-0 rounded-sm border border-border"
                            style={{ backgroundColor: cs.color }}
                          />
                        )}
                        <span className="font-medium truncate">{cs.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                          {cs.canonicalStatus}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  disabled={createColumn.isPending}
                >
                  {createColumn.isPending ? "Adding..." : "Add column"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setIsAdding(false);
                    setColumnName("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => {
                setIsAdding(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-200/50 dark:bg-neutral-800/50 p-3 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80 hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add column
            </button>
          )}
        </div>
      </div>
    </DragDropContext>
  );
};
