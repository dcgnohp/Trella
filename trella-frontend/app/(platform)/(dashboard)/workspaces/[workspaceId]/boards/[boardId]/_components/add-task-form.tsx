"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { ColumnsService, type ColumnPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddTaskFormProps {
  column: ColumnPublic;
  boardId: string;
  onTaskCreated: () => void;
}

export const AddTaskForm = ({
  column,
  boardId,
  onTaskCreated,
}: AddTaskFormProps) => {
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardTasks(boardId),
      });
      setTitle("");
      setIsEditing(false);
      onTaskCreated();
    },
    onError: () => {
      toast.error("Failed to create task");
    },
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
        onClick={() => {
          setIsEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80 hover:text-foreground transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        disabled={createTask.isPending}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsEditing(false);
            setTitle("");
          }
        }}
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-1">
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || createTask.isPending}
          className="h-7 px-3 text-xs"
        >
          {createTask.isPending ? "Adding…" : "Add"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            setIsEditing(false);
            setTitle("");
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
};
