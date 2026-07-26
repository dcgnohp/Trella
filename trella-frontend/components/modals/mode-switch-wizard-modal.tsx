"use client";

import React, { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Eye,
  Kanban,
  Layers,
  Layout,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";

import type { BoardPublic, CustomStatusEmbed } from "@/lib/client";

interface TaskItem {
  id: string;
  title: string;
  issueKey?: string;
  statusName?: string;
  canonicalStatus?: string;
  assigneeName?: string;
  boardId?: string | null;
}

export interface ModeSwitchWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentMode: "KANBAN" | "SCRUM";
  boards: BoardPublic[];
  customStatuses?: CustomStatusEmbed[];
  tasks?: TaskItem[];
  onSuccess: () => void;
}

export function ModeSwitchWizardModal({
  isOpen,
  onClose,
  workspaceId,
  currentMode,
  boards,
  customStatuses = [],
  tasks = [],
  onSuccess,
}: ModeSwitchWizardModalProps) {
  const queryClient = useQueryClient();
  const targetMode = currentMode === "SCRUM" ? "KANBAN" : "SCRUM";

  // Step indicator
  const [step, setStep] = useState<number>(1);

  const safeBoards = useMemo(() => (Array.isArray(boards) ? boards : []), [boards]);
  const safeTasks = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);

  // Direction A (KANBAN -> SCRUM) States
  const [primaryBoardId, setPrimaryBoardId] = useState<string>("");
  const [boardActions, setBoardActions] = useState<
    Record<string, "KEEP" | "DELETE">
  >({});

  // Direction B (SCRUM -> KANBAN) States
  const [activeBoardList, setActiveBoardList] = useState<
    { id: string; title: string; isNew?: boolean }[]
  >([]);
  const [newBoardName, setNewBoardName] = useState("");
  const [taskMappings, setTaskMappings] = useState<Record<string, string>>({});
  const [previewBoardTab, setPreviewBoardTab] = useState<string>("");

  const effectivePrimaryBoardId = primaryBoardId || safeBoards[0]?.id || "";

  const prevIsOpen = React.useRef(false);

  // Sync initial state ONLY when modal transitions from closed to open
  React.useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setStep(1);
      const firstBoardId = safeBoards[0]?.id || "";
      setPrimaryBoardId(firstBoardId);
      setPreviewBoardTab(firstBoardId);
      setActiveBoardList(safeBoards.map((b) => ({ id: b.id, title: b.title })));

      const initialActions: Record<string, "KEEP" | "DELETE"> = {};
      safeBoards.forEach((b, idx) => {
        if (idx !== 0) initialActions[b.id] = "KEEP";
      });
      setBoardActions(initialActions);

      const initialMap: Record<string, string> = {};
      safeTasks.forEach((t) => {
        initialMap[t.id] = t.boardId || firstBoardId;
      });
      setTaskMappings(initialMap);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, safeBoards, safeTasks]);

  const switchMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to switch mode");
      return res.json();
    },
    onSuccess: () => {
      toast.success(
        targetMode === "SCRUM"
          ? "Switched workspace to Scrum mode!"
          : "Switched workspace to Kanban mode!"
      );
      // Sync localStorage so WorkspaceHeader renders the correct tab set on reload
      window.localStorage.setItem(
        `trella:projectType:${workspaceId}`,
        targetMode === "SCRUM" ? "scrum" : "kanban"
      );
      queryClient.invalidateQueries({ queryKey: ["workspace-mode", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace-boards", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace-backlog", workspaceId] });
      onSuccess();
      window.location.reload();
    },
    onError: () => toast.error("Failed to switch workspace mode"),
  });

  if (!isOpen) return null;

  const handleAddBoard = () => {
    if (!newBoardName.trim()) return;
    const tempId = `new_${Date.now()}`;
    const updated = [...activeBoardList, { id: tempId, title: newBoardName.trim(), isNew: true }];
    setActiveBoardList(updated);
    if (!previewBoardTab) setPreviewBoardTab(tempId);
    setNewBoardName("");
  };

  const handleRemoveNewBoard = (id: string) => {
    setActiveBoardList((prev) => prev.filter((b) => b.id !== id));
  };

  // Bulk Mapping Handlers
  const handleBulkAssignAll = (boardId: string) => {
    const updated: Record<string, string> = {};
    tasks.forEach((t) => {
      updated[t.id] = boardId;
    });
    setTaskMappings(updated);
    toast.success("Assigned all tasks to selected board");
  };

  const handleBulkAssignByStatus = () => {
    if (activeBoardList.length < 2) return;
    const updated = { ...taskMappings };
    tasks.forEach((t, idx) => {
      const targetBoard = activeBoardList[idx % activeBoardList.length].id;
      updated[t.id] = targetBoard;
    });
    setTaskMappings(updated);
    toast.success("Distributed tasks across boards by status");
  };

  const handleFinalSubmit = () => {
    if (targetMode === "SCRUM") {
      const deleteIds = Object.entries(boardActions)
        .filter(([id, action]) => id !== primaryBoardId && action === "DELETE")
        .map(([id]) => id);

      switchMutation.mutate({
        mode: "SCRUM",
        primaryBoardId,
        deleteBoardIds: deleteIds,
      });
    } else {
      const deleteIds = boards
        .filter((b) => !activeBoardList.some((ab) => ab.id === b.id))
        .map((b) => b.id);

      const mappingsPayload = Object.entries(taskMappings)
        .filter(([tId, bId]) => tId && bId && !bId.startsWith("new_"))
        .map(([tId, bId]) => ({ taskId: tId, boardId: bId }));

      const newBoardTitles = activeBoardList.filter((b) => b.isNew).map((b) => b.title);

      switchMutation.mutate({
        mode: "KANBAN",
        deleteBoardIds: deleteIds,
        taskBoardMappings: mappingsPayload,
        newBoards: newBoardTitles,
      });
    }
  };

  const hasDeleteAction = Object.values(boardActions).includes("DELETE");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden z-10">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              {targetMode === "SCRUM" ? <Layers className="w-5 h-5" /> : <Kanban className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                Switch Mode: {currentMode} <ArrowRight className="w-4 h-4 text-muted-foreground" /> {targetMode}
              </h2>
              <p className="text-xs text-muted-foreground">
                {targetMode === "SCRUM"
                  ? "Consolidate boards into a Primary Scrum Board + Backlog"
                  : "Organize tasks into flexible Multi-Board Kanban workflows"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 py-3 border-b border-border bg-muted/10 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {targetMode === "SCRUM" ? (
            <>
              <StepPill num={1} label="Impact & Action" active={step === 1} done={step > 1} />
              <ChevronRight className="w-3.5 h-3.5" />
              <StepPill num={2} label="Live Scrum Preview" active={step === 2} done={step > 2} />
            </>
          ) : (
            <>
              <StepPill num={1} label="Board Setup" active={step === 1} done={step > 1} />
              <ChevronRight className="w-3.5 h-3.5" />
              <StepPill num={2} label="Task Mapping" active={step === 2} done={step > 2} />
              <ChevronRight className="w-3.5 h-3.5" />
              <StepPill num={3} label="Multi-Board Live Preview" active={step === 3} done={step > 3} />
            </>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {/* ============================================================ */}
          {/* DIRECTION A: KANBAN -> SCRUM */}
          {/* ============================================================ */}
          {targetMode === "SCRUM" && (
            <>
              {/* Step 1: Board selection & Actions */}
              {step === 1 && (
                <div className="flex flex-col gap-6">
                  {/* Summary banner */}
                  <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-sm text-foreground flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-600 dark:text-blue-400">
                        Scrum Mode Architecture
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        In Scrum, all tasks in the workspace will pool into the unified <strong>Backlog</strong>. Select one board below as your <strong>Primary Scrum Board</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Primary Board Radio Selector */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      1. Select Primary Scrum Board
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {safeBoards.map((b) => {
                        const isPrimary = b.id === effectivePrimaryBoardId;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setPrimaryBoardId(b.id)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              isPrimary
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border hover:bg-accent/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="primaryBoard"
                                checked={isPrimary}
                                onChange={() => setPrimaryBoardId(b.id)}
                                className="w-4 h-4 text-primary"
                              />
                              <div>
                                <p className="text-sm font-bold text-foreground">{b.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  ID: {b.id.slice(0, 8)}…
                                </p>
                              </div>
                            </div>
                            {isPrimary && (
                              <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-primary text-primary-foreground">
                                Primary Board
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Non-Primary Boards Action Selection */}
                  {safeBoards.filter((b) => b.id !== effectivePrimaryBoardId).length > 0 && (
                    <div className="flex flex-col gap-3 pt-4 border-t border-border">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        2. Manage Extra Boards
                      </label>
                      <div className="flex flex-col gap-2">
                        {safeBoards
                          .filter((b) => b.id !== effectivePrimaryBoardId)
                          .map((b) => {
                            const action = boardActions[b.id] || "KEEP";
                            return (
                              <div
                                key={b.id}
                                className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between gap-4"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{b.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Secondary board
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBoardActions({ ...boardActions, [b.id]: "KEEP" })
                                    }
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                      action === "KEEP"
                                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : "border-border text-muted-foreground hover:bg-accent"
                                    }`}
                                  >
                                    🟢 Keep Archived
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBoardActions({ ...boardActions, [b.id]: "DELETE" })
                                    }
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                      action === "DELETE"
                                        ? "border-destructive bg-destructive/10 text-destructive"
                                        : "border-border text-muted-foreground hover:bg-accent"
                                    }`}
                                  >
                                    🔴 Delete Board
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Red Destructive Action Warning Box */}
                  {hasDeleteAction && (
                    <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-3 animate-pulse">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">⚠️ Warning: Permanent Board Deletion</p>
                        <p className="mt-1 leading-relaxed text-destructive/90">
                          You selected to permanently delete one or more boards. The board layout metadata will be deleted from the database. <strong>Your task cards are safe</strong> and will be preserved in the Scrum Backlog.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Live Scrum Preview */}
              {step === 2 && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" /> Live Scrum Preview
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Review how your tasks will look in Scrum mode before confirming.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">
                      {safeTasks.length} Total Tasks
                    </span>
                  </div>

                  {/* Mock Backlog & Board view */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Scrum Backlog Box */}
                    <div className="p-4 rounded-xl border border-border bg-muted/20 flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                          Scrum Backlog (Unassigned)
                        </span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          {safeTasks.length} items
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                        {safeTasks.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic py-2">No tasks in backlog</p>
                        ) : (
                          safeTasks.map((t) => (
                            <div
                              key={t.id}
                              className="p-2.5 rounded-lg border border-border bg-background text-xs flex items-center justify-between"
                            >
                              <span className="font-semibold text-foreground truncate max-w-[180px]">
                                {t.title}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-accent font-medium">
                                {t.statusName || "To Do"}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Primary Scrum Board Box */}
                    <div className="p-4 rounded-xl border border-border bg-muted/20 flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">
                          Primary Board ({safeBoards.find((b) => b.id === effectivePrimaryBoardId)?.title || "Primary Board"})
                        </span>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                          Active Sprint 1
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded bg-background border border-border">
                          <p className="font-bold text-foreground">To Do</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {safeTasks.filter((t) => t.canonicalStatus === "TODO").length}
                          </p>
                        </div>
                        <div className="p-2 rounded bg-background border border-border">
                          <p className="font-bold text-blue-500">In Progress</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {safeTasks.filter((t) => t.canonicalStatus === "IN_PROGRESS").length}
                          </p>
                        </div>
                        <div className="p-2 rounded bg-background border border-border">
                          <p className="font-bold text-emerald-500">Done</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {safeTasks.filter((t) => t.canonicalStatus === "DONE").length}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ============================================================ */}
          {/* DIRECTION B: SCRUM -> KANBAN */}
          {/* ============================================================ */}
          {targetMode === "KANBAN" && (
            <>
              {/* Step 1: Board Setup */}
              {step === 1 && (
                <div className="flex flex-col gap-6">
                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm text-foreground flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                        Kanban Multi-Board Setup
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        In Kanban mode, you can have multiple dedicated boards (e.g. Frontend Board, Backend Board). Manage your target boards below.
                      </p>
                    </div>
                  </div>

                  {/* List of Boards */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Active Kanban Boards ({activeBoardList.length})
                    </label>
                    <div className="flex flex-col gap-2">
                      {activeBoardList.map((b) => (
                        <div
                          key={b.id}
                          className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between"
                        >
                          <span className="text-sm font-bold text-foreground">{b.title}</span>
                          {activeBoardList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveNewBoard(b.id)}
                              className="text-xs text-destructive hover:underline p-1"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add New Board Form */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      placeholder="e.g. Mobile Board, QA Board..."
                      className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddBoard}
                      className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Add Board
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Task Mapping */}
              {step === 2 && (
                <div className="flex flex-col gap-6">
                  {/* Bulk Rules Controls */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20 flex flex-col gap-3">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      ⚡ Quick Bulk Mapping Rules
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {activeBoardList.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleBulkAssignAll(b.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-accent bg-background text-foreground transition-colors"
                        >
                          Assign All Tasks ➔ {b.title}
                        </button>
                      ))}
                      {activeBoardList.length > 1 && (
                        <button
                          type="button"
                          onClick={handleBulkAssignByStatus}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          Distribute Tasks Evenly Across Boards
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Manual Task Table */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Task Board Assignments ({safeTasks.length} Tasks)
                    </label>
                    <div className="border border-border rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground uppercase font-bold border-b border-border">
                          <tr>
                            <th className="px-3 py-2">Task Title</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Target Board</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {safeTasks.map((t) => (
                            <tr key={t.id} className="hover:bg-accent/30">
                              <td className="px-3 py-2 font-semibold text-foreground truncate max-w-[200px]">
                                {t.title}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {t.statusName || "To Do"}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={taskMappings[t.id] || activeBoardList[0]?.id || ""}
                                  onChange={(e) =>
                                    setTaskMappings({ ...taskMappings, [t.id]: e.target.value })
                                  }
                                  className="px-2 py-1 border border-border rounded bg-background text-foreground text-xs outline-none"
                                >
                                  {activeBoardList.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.title}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Multi-Board Live Preview */}
              {step === 3 && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" /> Live Multi-Board Preview
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Click tabs to preview how each Kanban Board will appear.
                      </p>
                    </div>
                  </div>

                  {/* Board Tabs */}
                  <div className="flex gap-2 border-b border-border">
                    {activeBoardList.map((b) => {
                      const count = Object.values(taskMappings).filter((id) => id === b.id).length;
                      const isActive = (previewBoardTab || activeBoardList[0]?.id) === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setPreviewBoardTab(b.id)}
                          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                            isActive
                              ? "border-primary text-primary"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {b.title}
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-accent font-semibold">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Board Column Preview */}
                  {(() => {
                    const currentBoardId = previewBoardTab || activeBoardList[0]?.id;
                    const boardTasks = safeTasks.filter(
                      (t) => (taskMappings[t.id] || activeBoardList[0]?.id) === currentBoardId
                    );
                    return (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl border border-border bg-muted/20 flex flex-col gap-2">
                          <span className="text-xs font-bold text-foreground uppercase border-b border-border pb-1">
                            To Do ({boardTasks.filter((t) => t.canonicalStatus === "TODO").length})
                          </span>
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                            {boardTasks
                              .filter((t) => t.canonicalStatus === "TODO")
                              .map((t) => (
                                <div
                                  key={t.id}
                                  className="p-2 rounded border border-border bg-background text-xs text-foreground truncate"
                                >
                                  {t.title}
                                </div>
                              ))}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border border-border bg-muted/20 flex flex-col gap-2">
                          <span className="text-xs font-bold text-blue-500 uppercase border-b border-border pb-1">
                            In Progress (
                            {boardTasks.filter((t) => t.canonicalStatus === "IN_PROGRESS").length})
                          </span>
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                            {boardTasks
                              .filter((t) => t.canonicalStatus === "IN_PROGRESS")
                              .map((t) => (
                                <div
                                  key={t.id}
                                  className="p-2 rounded border border-border bg-background text-xs text-foreground truncate"
                                >
                                  {t.title}
                                </div>
                              ))}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border border-border bg-muted/20 flex flex-col gap-2">
                          <span className="text-xs font-bold text-emerald-500 uppercase border-b border-border pb-1">
                            Done ({boardTasks.filter((t) => t.canonicalStatus === "DONE").length})
                          </span>
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                            {boardTasks
                              .filter((t) => t.canonicalStatus === "DONE")
                              .map((t) => (
                                <div
                                  key={t.id}
                                  className="p-2 rounded border border-border bg-background text-xs text-foreground truncate"
                                >
                                  {t.title}
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              if (step > 1) setStep(step - 1);
              else onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-accent transition-colors"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {targetMode === "SCRUM" && step < 2 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
              >
                Next: Live Preview <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {targetMode === "KANBAN" && step < 3 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
              >
                Next Step <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {((targetMode === "SCRUM" && step === 2) || (targetMode === "KANBAN" && step === 3)) && (
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={switchMutation.isPending}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {switchMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Confirm & Apply Switch
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPill({
  num,
  label,
  active,
  done,
}: {
  num: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 transition-colors ${
        active
          ? "text-primary font-bold"
          : done
          ? "text-foreground font-medium"
          : "text-muted-foreground/60"
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
          active
            ? "bg-primary text-primary-foreground"
            : done
            ? "bg-emerald-500 text-white"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? "✓" : num}
      </span>
      <span>{label}</span>
    </div>
  );
}
