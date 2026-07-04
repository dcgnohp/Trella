"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ColumnsService,
  TasksService,
  type ColumnPublic,
  type CustomStatusEmbed,
  type TaskPublic,
  type ProjectMemberPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";

import { KanbanColumn } from "./kanban-column";

interface KanbanBoardProps {
  boardId: string;
  workspaceId: string;
  columns: ColumnPublic[];
  tasks: TaskPublic[];
  subtasksByParent: Map<string, TaskPublic[]>;
  customStatuses: CustomStatusEmbed[];
  projectMembers: ProjectMemberPublic[];
  onTaskClick: (task: TaskPublic) => void;
  isScrum?: boolean;
  boardIsEmpty?: boolean;
}

export const KanbanBoard = ({
  boardId,
  workspaceId,
  columns,
  tasks,
  subtasksByParent,
  customStatuses,
  projectMembers,
  onTaskClick,
  isScrum,
  boardIsEmpty,
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
      customStatusId: string | undefined;
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.customStatuses(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardTasks(boardId),
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
        statusKey = "UNMAPPED"; // Fallback
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

      // Column-drives-status: match by name first (covers unmapped and custom statuses matching the column name), then fallback to matching by canonicalStatus key
      const matchingStatus =
        customStatuses.find(
          (cs) => cs.name && cs.name.toLowerCase() === destColumn.name.toLowerCase(),
        ) ||
        customStatuses.find(
          (cs) => cs.canonicalStatus && cs.canonicalStatus === destColumn.statusKey,
        );
      // Only send customStatusId when we have a match; undefined leaves the field out of the request
      const customStatusId = matchingStatus?.id ?? undefined;

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
                  customStatusId: customStatusId ?? null,
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
      <Droppable droppableId="board" type="COLUMN" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              overflowX: 'auto',
              padding: '0 4px 16px',
              height: '100%',
              minHeight: 0,
            }}
          >
            {columns.map((column, index) => (
              <Draggable key={column.id} draggableId={column.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    style={{
                      ...dragProvided.draggableProps.style,
                      opacity: dragSnapshot.isDragging ? 0.85 : 1,
                    }}
                  >
                    <KanbanColumn
                      column={column}
                      tasks={tasksByColumn.get(column.id) ?? []}
                      subtasksByParent={subtasksByParent}
                      boardId={boardId}
                      workspaceId={workspaceId}
                      projectMembers={projectMembers}
                      dragHandleProps={dragProvided.dragHandleProps}
                      onTaskClick={onTaskClick}
                      onTaskCreated={handleTaskCreated}
                      isScrum={isScrum}
                      boardIsEmpty={boardIsEmpty}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            <div ref={containerRef} style={{ width: 272, flexShrink: 0, position: 'relative' }}>
          {isAdding ? (
            <form
              onSubmit={onSubmit}
              style={{
                width: '100%', padding: 12, borderRadius: 6,
                border: '1px solid var(--trella-border)',
                backgroundColor: 'var(--trella-surface)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  value={columnName}
                  onChange={(e) => { setColumnName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Column name (e.g. In review)..."
                  style={{
                    width: '100%', height: 32, padding: '0 10px', borderRadius: 4,
                    border: '1px solid var(--trella-border)',
                    backgroundColor: 'var(--trella-surface-raised)',
                    color: 'var(--trella-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />

                {/* Autocomplete Suggestions */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, marginTop: 4,
                    maxHeight: 192, overflowY: 'auto', borderRadius: 6,
                    border: '1px solid var(--trella-border)',
                    backgroundColor: 'var(--trella-surface)',
                    padding: '4px 0',
                    boxShadow: '0 4px 16px rgba(9,30,66,0.15)',
                  }}>
                    <p style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      Map to Workspace Status
                    </p>
                    {filteredSuggestions.map((cs) => (
                      <button
                        key={cs.id}
                        type="button"
                        onClick={() => {
                          setColumnName(cs.name);
                          setShowSuggestions(false);
                          handleAddColumn(cs.name, cs.canonicalStatus || "TODO");
                        }}
                        style={{
                          display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                          padding: '6px 10px', background: 'none', border: 'none',
                          cursor: 'pointer', fontSize: 12, color: 'var(--trella-text)', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {cs.color && (
                          <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 3, border: '1px solid rgba(0,0,0,0.1)', backgroundColor: cs.color, display: 'inline-block' }} />
                        )}
                        <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cs.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase' }}>{cs.canonicalStatus}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="submit"
                  disabled={createColumn.isPending}
                  style={{
                    height: 28, padding: '0 12px', borderRadius: 4, border: 'none',
                    backgroundColor: '#0052CC', color: 'white', fontSize: 12, fontWeight: 500,
                    cursor: createColumn.isPending ? 'not-allowed' : 'pointer', opacity: createColumn.isPending ? 0.6 : 1,
                  }}
                >
                  {createColumn.isPending ? "Adding..." : "Add column"}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAdding(false); setColumnName(""); }}
                  style={{
                    height: 28, width: 28, borderRadius: 4, border: '1px solid var(--trella-border)',
                    backgroundColor: 'transparent', color: 'var(--trella-text-subtle)', fontSize: 16, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                borderRadius: 6, border: '1px dashed var(--trella-border)',
                backgroundColor: 'var(--trella-surface-sunken)', padding: 12,
                fontSize: 13, color: 'var(--trella-text-subtlest)', cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--trella-surface-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--trella-text-subtle)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--trella-surface-sunken)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--trella-text-subtlest)'; }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Add column
            </button>
          )}
        </div>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};
