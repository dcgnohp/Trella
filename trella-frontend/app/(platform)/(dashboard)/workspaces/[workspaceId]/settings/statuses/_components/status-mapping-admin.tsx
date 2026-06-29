"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import AddIcon from "@atlaskit/icon/core/add"
import DeleteIcon from "@atlaskit/icon/core/delete"

import { cn } from "@/lib/utils"
import type {
  CanonicalStatus,
  CustomStatusPublic,
  MappingSummary,
  TaskPublic,
} from "@/lib/client"
import { TaskCard } from "@/components/task-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { StatusFormDialog } from "./status-form-dialog"
import { DeleteInUseDialog } from "./delete-in-use-dialog"

/** Shape returned by `GET /api/workspaces/{workspaceId}/status-admin`. */
interface StatusAdminData {
  canManage: boolean
  statuses: CustomStatusPublic[]
  summary: MappingSummary
  canonicalStatuses: string[]
}

/** Sentinel `Select` value for the "Unmapped" option (Req 11.4). */
const UNMAPPED = "UNMAPPED"

const PERMISSION_TOAST = "You do not have permission to manage statuses"

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.error === "string") return data.error
  } catch {
    // ignore malformed body
  }
  return fallback
}

/** Recompute the summary card numbers from the (optimistic) status list. */
function computeSummary(
  statuses: CustomStatusPublic[],
  canonicalStatuses: string[],
): MappingSummary {
  const byCanonical: Record<string, number> = {}
  for (const c of canonicalStatuses) byCanonical[c] = 0
  let mapped = 0
  for (const s of statuses) {
    if (s.canonicalStatus) {
      mapped += 1
      byCanonical[s.canonicalStatus] = (byCanonical[s.canonicalStatus] ?? 0) + 1
    }
  }
  return {
    total: statuses.length,
    mapped,
    unmapped: statuses.length - mapped,
    byCanonical,
  }
}

/**
 * Build a throwaway Task whose `customStatus` carries the row's currently
 * selected canonical mapping, so the live `<TaskCard>` preview reflects the
 * resolved `getTaskDisplayStyle` immediately (Req 11.8).
 */
function makePreviewTask(status: CustomStatusPublic): TaskPublic {
  const now = new Date().toISOString()
  return {
    id: `preview-${status.id}`,
    projectId: "",
    boardId: "",
    columnId: "",
    title: "Sample task",
    description: null,
    priority: "",
    dueDate: null,
    assigneeId: null,
    customStatusId: status.id,
    customStatus: {
      id: status.id,
      name: status.name,
      color: status.color,
      canonicalStatus: status.canonicalStatus,
    },
    position: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function StatusMappingAdmin({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const queryKey = React.useMemo(
    () => ["status-admin", workspaceId] as const,
    [workspaceId],
  )

  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CustomStatusPublic | null>(null)
  const [inUseTarget, setInUseTarget] = React.useState<{
    name: string
    referenceCount: number | null
  } | null>(null)
  const guardFiredRef = React.useRef(false)

  const { data, isLoading, isError } = useQuery<StatusAdminData>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/status-admin`,
        { cache: "no-store" },
      )
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to load custom statuses"))
      }
      return (await res.json()) as StatusAdminData
    },
  })

  // ADMIN/OWNER-only guard: show inline message instead of redirecting to avoid
  // navigation loops when workspaceId changes.
  React.useEffect(() => {
    if (!data || data.canManage || guardFiredRef.current) return
    guardFiredRef.current = true
    toast.error(PERMISSION_TOAST)
  }, [data])

  const canonicalStatuses = data?.canonicalStatuses ?? [
    "TODO",
    "IN_PROGRESS",
    "PENDING",
    "DONE",
  ]

  const mappingMutation = useMutation<
    CustomStatusPublic,
    Error,
    { id: string; canonical: CanonicalStatus | null },
    { previous?: StatusAdminData }
  >({
    mutationFn: async ({ id, canonical }) => {
      const res = await fetch(`/api/custom-statuses/${id}/mapping`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalStatus: canonical }),
      })
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to update mapping"))
      }
      return (await res.json()) as CustomStatusPublic
    },
    onMutate: async ({ id, canonical }) => {
      // Optimistically update the cache + Display Preview right away (Req 11.5).
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<StatusAdminData>(queryKey)
      queryClient.setQueryData<StatusAdminData>(queryKey, (old) => {
        if (!old) return old
        const statuses = old.statuses.map((s) =>
          s.id === id ? { ...s, canonicalStatus: canonical } : s,
        )
        return {
          ...old,
          statuses,
          summary: computeSummary(statuses, old.canonicalStatuses),
        }
      })
      return { previous }
    },
    onError: (error, _vars, context) => {
      // Roll back the dropdown + preview to the previous value (Req 11.6).
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      toast.error(`Failed to update mapping: ${error.message}`)
    },
    onSuccess: () => {
      toast.success("Status mapping updated")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
      // Req 14.2: every TaskCard derives its DisplayStyle from the task's
      // denormalized `custom_status`. Invalidate the task-list/task buckets
      // (prefix match across all boards/tasks) so cards showing tasks with this
      // custom status re-render with the new mapping within ~5s.
      queryClient.invalidateQueries({ queryKey: ["board-tasks"] })
      queryClient.invalidateQueries({ queryKey: ["task"] })
    },
  })

  const deleteMutation = useMutation<
    void,
    Error & { inUse?: boolean; referenceCount?: number | null },
    CustomStatusPublic
  >({
    mutationFn: async (status) => {
      const res = await fetch(`/api/custom-statuses/${status.id}`, {
        method: "DELETE",
      })
      if (res.status === 204) return
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        referenceCount?: number | null
      }
      const error = new Error(
        body.error ?? "Failed to delete custom status",
      ) as Error & { inUse?: boolean; referenceCount?: number | null }
      if (res.status === 409) {
        error.inUse = true
        error.referenceCount = body.referenceCount ?? null
      }
      throw error
    },
    onSuccess: () => {
      toast.success("Custom status deleted")
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error, status) => {
      // Still-in-use → warning dialog with the reference count, no delete
      // (Req 11.11). Any other failure → toast.
      if (error.inUse) {
        setInUseTarget({
          name: status.name,
          referenceCount: error.referenceCount ?? null,
        })
        return
      }
      toast.error(error.message)
    },
  })

  // Loading → skeleton rows (design §8.5.8A).
  if (isLoading) {
    return <StatusAdminSkeleton />
  }

  // While the guard redirects a non-admin away, render nothing.
  if (data && !data.canManage) {
    return null
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <p className="text-sm text-destructive">
          Couldn&apos;t load custom statuses. Please try again.
        </p>
      </div>
    )
  }

  const { statuses, summary } = data

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* Editorial header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Status mapping
          </h1>
          <p className="text-sm text-muted-foreground">
            Map each custom status to a canonical status so tasks render with
            the right styling everywhere.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <span style={{ display: 'flex', alignItems: 'center' }}><AddIcon label="" size="small" /></span>
          Add Custom Status
        </Button>
      </div>

      {/* Summary cards (Req 11.10) */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <SummaryCard label="Total" value={summary.total} tone="muted" />
        <SummaryCard label="Mapped" value={summary.mapped} tone="success" />
        <SummaryCard
          label="Unmapped"
          value={summary.unmapped}
          tone="warning"
        />
      </div>

      {/* Table (Req 11.3) */}
      <div className="mt-8 overflow-hidden rounded-lg border border-border">
        {statuses.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Color</th>
                <th className="px-4 py-3 font-medium">Mapped Canonical</th>
                <th className="px-4 py-3 font-medium">Display Preview</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {statuses.map((status) => {
                const selectValue = status.canonicalStatus ?? UNMAPPED
                return (
                  <tr key={status.id} className="align-middle">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {status.name}
                    </td>
                    <td className="px-4 py-3">
                      {status.color ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded-sm border border-border"
                            style={{ backgroundColor: status.color }}
                            aria-hidden="true"
                          />
                          <span className="font-mono text-xs text-muted-foreground">
                            {status.color}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={selectValue}
                        onValueChange={(value) =>
                          mappingMutation.mutate({
                            id: status.id,
                            canonical:
                              value === UNMAPPED
                                ? null
                                : (value as CanonicalStatus),
                          })
                        }
                      >
                        <SelectTrigger className="h-9 w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED}>Unmapped</SelectItem>
                          {canonicalStatuses.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-[220px] h-fit">
                        <TaskCard task={makePreviewTask(status)} className="h-fit" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(status)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${status.name}`}
                          disabled={
                            deleteMutation.isPending &&
                            deleteMutation.variables?.id === status.id
                          }
                          onClick={() => deleteMutation.mutate(status)}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', color: '#5E6C84' }}><DeleteIcon label="Delete" size="small" /></span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <StatusFormDialog
        mode="create"
        workspaceId={workspaceId}
        queryKey={queryKey}
        canonicalStatuses={canonicalStatuses}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <StatusFormDialog
        mode="edit"
        workspaceId={workspaceId}
        queryKey={queryKey}
        canonicalStatuses={canonicalStatuses}
        status={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
      <DeleteInUseDialog
        target={inUseTarget}
        onOpenChange={(open) => {
          if (!open) setInUseTarget(null)
        }}
      />
    </div>
  )
}

const SUMMARY_TONE: Record<string, string> = {
  muted: "text-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "muted" | "success" | "warning"
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          SUMMARY_TONE[tone],
        )}
      >
        {value}
      </p>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <Badge variant="outline">No custom statuses yet</Badge>
      <p className="max-w-sm text-sm text-muted-foreground">
        Create a custom status to start mapping your workspace&apos;s workflow
        to canonical statuses.
      </p>
      <Button onClick={onAdd}>
        <span style={{ display: 'flex', alignItems: 'center' }}><AddIcon label="" size="small" /></span>
        Add Custom Status
      </Button>
    </div>
  )
}

function StatusAdminSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <div className="mt-8 space-y-px rounded-lg border border-border p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
