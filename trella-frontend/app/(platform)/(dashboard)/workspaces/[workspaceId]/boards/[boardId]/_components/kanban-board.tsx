"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ColumnsService,
  TasksService,
  ApiError,
  WorkflowsService,
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

  // Fetch active workflow and its transitions
  const workflowsQuery = useQuery({
    queryKey: ["workflows", workspaceId],
    queryFn: () => WorkflowsService.Workflows_workflowsListWorkflows({ workspaceId }),
    enabled: !!isScrum && !!workspaceId,
  });

  const activeWorkflow = useMemo(() => {
    return workflowsQuery.data?.find((w) => w.isActive) || workflowsQuery.data?.[0];
  }, [workflowsQuery.data]);

  const workflowDetailQuery = useQuery({
    queryKey: ["workflow", activeWorkflow?.id],
    queryFn: () => WorkflowsService.Workflows_workflowsGetWorkflow({ workflowId: activeWorkflow!.id }),
    enabled: !!isScrum && !!activeWorkflow?.id,
  });

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const getColumnStatus = useCallback((col: ColumnPublic) => {
    return (
      customStatuses.find(
        (cs) => cs.name && cs.name.toLowerCase() === col.name.toLowerCase(),
      ) ||
      customStatuses.find(
        (cs) => cs.canonicalStatus && cs.canonicalStatus === col.statusKey,
      )
    );
  }, [customStatuses]);

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
      transitionComment,
    }: {
      taskId: string;
      columnId: string;
      customStatusId: string | undefined;
      transitionComment?: string;
    }) =>
      TasksService.Tasks_tasksUpdateTask({
        taskId,
        requestBody: { columnId, customStatusId, transitionComment },
      }),
    onError: (error: any, variables) => {
      let msg = "Không thể chuyển trạng thái công việc";
      if (error instanceof ApiError) {
        const body = error.body as { detail?: string } | undefined;
        if (typeof body?.detail === "string") {
          msg = body.detail;
        }
      }

      const taskObj = tasks.find((t) => t.id === variables.taskId);
      const currentStatus = customStatuses.find((s) => s.id === taskObj?.customStatusId)?.name || "Không rõ";
      const targetStatus = customStatuses.find((s) => s.id === variables.customStatusId)?.name || "Không rõ";

      if (msg === "Invalid workflow transition path" && taskObj) {
        const transitions = workflowDetailQuery.data?.transitions || [];
        const validDestIds = transitions
          .filter((t) => t.fromStatusId === taskObj.customStatusId || t.fromStatusId === null)
          .map((t) => t.toStatusId);
        const validStatuses = customStatuses
          .filter((s) => validDestIds.includes(s.id))
          .map((s) => s.name);

        const validListStr = validStatuses.length > 0 ? validStatuses.join(", ") : "không có trạng thái nào";
        msg = `Không thể chuyển trạng thái từ "${currentStatus}" sang "${targetStatus}". Theo quy trình làm việc (Workflow) của dự án, từ "${currentStatus}" bạn chỉ có thể chuyển sang: ${validListStr}.`;
      }

      // If a comment is required, prompt the user directly via prompt dialog
      if (msg.includes("comment is required") || msg.toLowerCase().includes("bình luận")) {
        const comment = window.prompt("Quy trình Scrum yêu cầu viết bình luận giải trình để chuyển sang trạng thái này:");
        if (comment !== null && comment.trim() !== "") {
          // Retry mutation with comment
          moveTask.mutate({
            taskId: variables.taskId,
            columnId: variables.columnId,
            customStatusId: variables.customStatusId,
            transitionComment: comment,
          });
          return;
        }
      }

      toast.error(msg);
      // Revert optimistic update
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

  const onDragStart = useCallback((start: any) => {
    if (start.type === "COLUMN") return;
    setDraggingTaskId(start.draggableId);
  }, []);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      setDraggingTaskId(null);
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
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
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
            {columns.map((column, index) => {
              const colStatus = getColumnStatus(column);
              const draggingTask = draggingTaskId ? tasks.find((t) => t.id === draggingTaskId) : null;

              let isDimmed = false;
              let isValidTarget = false;

              if (isScrum && draggingTask && colStatus && workflowDetailQuery.data) {
                if (colStatus.id === draggingTask.customStatusId) {
                  isDimmed = false;
                  isValidTarget = false;
                } else {
                  const transitions = workflowDetailQuery.data.transitions || [];
                  const hasTransition = transitions.some((t) =>
                    (t.fromStatusId === draggingTask.customStatusId && t.toStatusId === colStatus.id) ||
                    (t.fromStatusId === null && t.toStatusId === colStatus.id)
                  );
                  isDimmed = !hasTransition;
                  isValidTarget = hasTransition;
                }
              }

              return (
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
                        isDimmed={isDimmed}
                        isValidTarget={isValidTarget}
                        isDraggingTask={!!draggingTaskId}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
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

                  {/* Quick Setup: spawn 4 default columns in one click */}
                  {columns.length === 0 && (
                    <QuickSetupButton boardId={boardId} workspaceId={workspaceId} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

/* ── Quick Setup: premium button + customizable modal ── */
const DEFAULT_COLUMNS_TEMPLATE = [
  { name: 'To Do', statusKey: 'TODO', color: '#4C9AFF' },
  { name: 'In Progress', statusKey: 'IN_PROGRESS', color: '#FFC400' },
  { name: 'Review', statusKey: 'PENDING', color: '#8777D9' },
  { name: 'Done', statusKey: 'DONE', color: '#36B37E' },
];

const STATUS_KEY_OPTIONS = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'PENDING', label: 'Pending / Review' },
  { value: 'DONE', label: 'Done' },
  { value: 'UNMAPPED', label: 'Custom' },
];

const STATUS_COLORS: Record<string, string> = {
  TODO: '#4C9AFF',
  IN_PROGRESS: '#FFC400',
  PENDING: '#8777D9',
  DONE: '#36B37E',
  UNMAPPED: '#97A0AF',
};

interface EditableColumn {
  id: string;
  name: string;
  statusKey: string;
}

function QuickSetupButton({ boardId, workspaceId }: { boardId: string; workspaceId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cols, setCols] = useState<EditableColumn[]>(() =>
    DEFAULT_COLUMNS_TEMPLATE.map((c, i) => ({ id: `col-${i}`, name: c.name, statusKey: c.statusKey })),
  );

  const resetAndOpen = () => {
    setCols(DEFAULT_COLUMNS_TEMPLATE.map((c, i) => ({ id: `col-${i}`, name: c.name, statusKey: c.statusKey })));
    setOpen(true);
  };

  const updateCol = (id: string, field: 'name' | 'statusKey', value: string) => {
    setCols(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeCol = (id: string) => {
    setCols(prev => prev.filter(c => c.id !== id));
  };

  const addCol = () => {
    setCols(prev => [...prev, { id: `col-${Date.now()}`, name: '', statusKey: 'UNMAPPED' }]);
  };

  const moveCol = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= cols.length) return;
    const next = [...cols];
    [next[index], next[target]] = [next[target], next[index]];
    setCols(next);
  };

  const handleConfirm = async () => {
    const valid = cols.filter(c => c.name.trim());
    if (valid.length === 0) return;
    setLoading(true);
    try {
      for (const col of valid) {
        await ColumnsService.Columns_columnsCreateColumn({
          boardId,
          requestBody: { name: col.name.trim(), statusKey: col.statusKey },
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.boardColumns(boardId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customStatuses(workspaceId) });
      toast.success(`${valid.length} columns created!`);
      setOpen(false);
    } catch {
      toast.error('Failed to create columns');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={resetAndOpen}
        style={{
          display: 'flex', width: '100%', alignItems: 'center', gap: 10,
          borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, #0052CC 0%, #6554C0 100%)',
          padding: '12px 14px',
          fontSize: 13, color: '#fff', cursor: 'pointer',
          fontWeight: 600, letterSpacing: '0.01em',
          transition: 'transform 0.12s, box-shadow 0.2s',
          boxShadow: '0 2px 8px rgba(0,82,204,0.25)',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,82,204,0.35)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,82,204,0.25)'; }}
      >
        <span style={{ fontSize: 18 }}>⚡</span>
        <span>Quick Setup</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={() => !loading && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(9,30,66,0.54)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 520, maxHeight: '85vh', overflowY: 'auto',
              backgroundColor: 'var(--trella-surface, #fff)',
              borderRadius: 12,
              boxShadow: '0 16px 48px rgba(9,30,66,0.25)',
              padding: 0,
              animation: 'slideUp 0.2s ease',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--trella-border)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'linear-gradient(135deg, #0052CC, #6554C0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>⚡</div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--trella-text)' }}>
                  Quick Board Setup
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--trella-text-subtle)' }}>
                  Customize your columns below, then hit Create
                </p>
              </div>
              <button
                onClick={() => !loading && setOpen(false)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 20, color: 'var(--trella-text-subtlest)', lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>

            {/* Live preview */}
            <div style={{ padding: '16px 24px 8px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                Preview
              </p>
              <div style={{
                display: 'flex', gap: 6, padding: '12px 14px',
                backgroundColor: 'var(--trella-surface-sunken, #F4F5F7)',
                borderRadius: 8, overflowX: 'auto',
              }}>
                {cols.filter(c => c.name.trim()).map(c => (
                  <div key={c.id} style={{
                    flex: '1 0 0', minWidth: 80, padding: '10px 8px',
                    backgroundColor: 'var(--trella-surface, #fff)',
                    borderRadius: 6, textAlign: 'center',
                    borderTop: `3px solid ${STATUS_COLORS[c.statusKey] || '#97A0AF'}`,
                    boxShadow: '0 1px 3px rgba(9,30,66,0.08)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--trella-text-subtlest)', marginTop: 3 }}>
                      {STATUS_KEY_OPTIONS.find(o => o.value === c.statusKey)?.label || c.statusKey}
                    </div>
                  </div>
                ))}
                {cols.filter(c => c.name.trim()).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', padding: 12, textAlign: 'center', width: '100%' }}>
                    Add at least one column
                  </div>
                )}
              </div>
            </div>

            {/* Editable column list */}
            <div style={{ padding: '12px 24px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
                Columns ({cols.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cols.map((col, idx) => (
                  <div key={col.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 6,
                    border: '1px solid var(--trella-border)',
                    backgroundColor: 'var(--trella-surface)',
                  }}>
                    {/* Color dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: STATUS_COLORS[col.statusKey] || '#97A0AF',
                    }} />

                    {/* Name input */}
                    <input
                      value={col.name}
                      onChange={e => updateCol(col.id, 'name', e.target.value)}
                      placeholder="Column name..."
                      style={{
                        flex: 1, border: 'none', outline: 'none',
                        fontSize: 13, fontWeight: 500,
                        color: 'var(--trella-text)',
                        backgroundColor: 'transparent',
                        minWidth: 0,
                      }}
                    />

                    {/* Status key select */}
                    <select
                      value={col.statusKey}
                      onChange={e => updateCol(col.id, 'statusKey', e.target.value)}
                      style={{
                        border: '1px solid var(--trella-border)', borderRadius: 4,
                        fontSize: 11, padding: '2px 4px', color: 'var(--trella-text-subtle)',
                        backgroundColor: 'var(--trella-surface)', cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      {STATUS_KEY_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    {/* Move up/down */}
                    <button onClick={() => moveCol(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--trella-border)' : 'var(--trella-text-subtle)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>↑</button>
                    <button onClick={() => moveCol(idx, 1)} disabled={idx === cols.length - 1} style={{ background: 'none', border: 'none', cursor: idx === cols.length - 1 ? 'default' : 'pointer', color: idx === cols.length - 1 ? 'var(--trella-border)' : 'var(--trella-text-subtle)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>↓</button>

                    {/* Remove */}
                    <button
                      onClick={() => removeCol(col.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5630', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>

              {/* Add column */}
              <button
                onClick={addCol}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                  background: 'none', border: '1px dashed var(--trella-border)', borderRadius: 6,
                  padding: '8px 12px', fontSize: 12, color: 'var(--trella-text-subtle)',
                  cursor: 'pointer', width: '100%', justifyContent: 'center',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                + Add another column
              </button>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--trella-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                style={{
                  height: 36, padding: '0 16px', borderRadius: 6,
                  border: '1px solid var(--trella-border)',
                  backgroundColor: 'transparent', color: 'var(--trella-text-subtle)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={handleConfirm}
                disabled={loading || cols.filter(c => c.name.trim()).length === 0}
                style={{
                  height: 36, padding: '0 20px', borderRadius: 6,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0052CC, #6554C0)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading || cols.filter(c => c.name.trim()).length === 0 ? 0.5 : 1,
                  transition: 'opacity 0.12s',
                }}
              >
                {loading ? 'Creating...' : `Create ${cols.filter(c => c.name.trim()).length} Columns`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
