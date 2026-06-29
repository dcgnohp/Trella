"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ColumnsService, type ColumnPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";

interface AddTaskFormProps {
  column: ColumnPublic;
  boardId: string;
  onTaskCreated: () => void;
}

export const AddTaskForm = ({ column, boardId, onTaskCreated }: AddTaskFormProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: (taskTitle: string) =>
      ColumnsService.Columns_columnsCreateTask({
        boardId,
        columnId: column.id,
        requestBody: { title: taskTitle },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(boardId) });
      setTitle("");
      setIsEditing(false);
      onTaskCreated();
    },
    onError: () => { toast.error("Failed to create task"); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate(trimmed);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => { setIsEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        style={{
          display: 'flex', width: '100%', alignItems: 'center', gap: 6,
          borderRadius: 4, padding: '6px 8px', background: 'none', border: 'none',
          fontSize: 13, color: '#97A0AF', cursor: 'pointer', transition: 'color 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#172B4D')}
        onMouseLeave={e => (e.currentTarget.style.color = '#97A0AF')}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        disabled={createTask.isPending}
        onKeyDown={(e) => { if (e.key === "Escape") { setIsEditing(false); setTitle(""); } }}
        style={{
          height: 30, padding: '0 8px', borderRadius: 4,
          border: '1px solid #DFE1E6',
          backgroundColor: '#FAFBFC',
          color: '#172B4D', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          disabled={!title.trim() || createTask.isPending}
          style={{
            height: 26, padding: '0 10px', borderRadius: 4, border: 'none',
            backgroundColor: '#0052CC', color: 'white', fontSize: 12, fontWeight: 500,
            cursor: (!title.trim() || createTask.isPending) ? 'not-allowed' : 'pointer',
            opacity: (!title.trim() || createTask.isPending) ? 0.5 : 1,
          }}
        >
          {createTask.isPending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => { setIsEditing(false); setTitle(""); }}
          style={{
            height: 26, width: 26, borderRadius: 4, border: '1px solid #DFE1E6',
            background: 'none', color: '#5E6C84', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>
    </form>
  );
};
