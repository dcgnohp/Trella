"use client"

import * as React from "react"
import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import { toast } from "sonner"

import type { CanonicalStatus, CustomStatusPublic } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** Sentinel `Select` value for the "Unmapped" option (Req 11.4, 11.9). */
const UNMAPPED = "UNMAPPED"

const DEFAULT_COLOR = "#64748B"

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.error === "string") return data.error
  } catch {
    // ignore malformed body
  }
  return fallback
}

interface StatusFormDialogProps {
  mode: "create" | "edit"
  workspaceId: string
  queryKey: QueryKey
  canonicalStatuses: string[]
  /** Required in `edit` mode: the status being edited. */
  status?: CustomStatusPublic | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Create / edit a CustomStatus (Req 11.9; edit backs the row "Edit" action).
 *
 * In `create` mode the canonical mapping defaults to "Unmapped". Submits via
 * the server-side route handlers; the backend enforces RBAC + validation and
 * any error is surfaced as a toast.
 */
export function StatusFormDialog({
  mode,
  workspaceId,
  queryKey,
  canonicalStatuses,
  status,
  open,
  onOpenChange,
}: StatusFormDialogProps) {
  const queryClient = useQueryClient()

  const [name, setName] = React.useState("")
  const [useColor, setUseColor] = React.useState(false)
  const [color, setColor] = React.useState(DEFAULT_COLOR)
  const [canonical, setCanonical] = React.useState<string>(UNMAPPED)

  // Seed the form whenever the dialog opens (or the edited row changes).
  React.useEffect(() => {
    if (!open) return
    if (mode === "edit" && status) {
      setName(status.name)
      setUseColor(Boolean(status.color))
      setColor(status.color ?? DEFAULT_COLOR)
      setCanonical(status.canonicalStatus ?? UNMAPPED)
    } else {
      setName("")
      setUseColor(false)
      setColor(DEFAULT_COLOR)
      setCanonical(UNMAPPED)
    }
  }, [open, mode, status])

  const mutation = useMutation<CustomStatusPublic, Error, void>({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        color: useColor ? color : null,
        canonicalStatus:
          canonical === UNMAPPED ? null : (canonical as CanonicalStatus),
      }
      const url =
        mode === "create"
          ? `/api/workspaces/${workspaceId}/custom-statuses`
          : `/api/custom-statuses/${status?.id}`
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(
          await readError(
            res,
            mode === "create"
              ? "Failed to create custom status"
              : "Failed to update custom status",
          ),
        )
      }
      return (await res.json()) as CustomStatusPublic
    },
    onSuccess: () => {
      toast.success(
        mode === "create" ? "Custom status created" : "Custom status updated",
      )
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ["custom-statuses", workspaceId] })
      queryClient.invalidateQueries({ queryKey: ["board-tasks"] })
      queryClient.invalidateQueries({ queryKey: ["task"] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const submitDisabled = name.trim().length === 0 || mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add custom status" : "Edit custom status"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a workspace status and optionally map it to a canonical status."
              : "Update this status' name, color, or canonical mapping."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!submitDisabled) mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="status-name">Name</Label>
            <Input
              id="status-name"
              value={name}
              maxLength={50}
              placeholder="e.g. In Review"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="status-use-color"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={useColor}
                onChange={(e) => setUseColor(e.target.checked)}
              />
              <Label htmlFor="status-use-color">Custom color</Label>
            </div>
            {useColor ? (
              <div className="flex items-center gap-3">
                <input
                  aria-label="Pick color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded-sm border border-border bg-background p-1"
                />
                <Input
                  aria-label="Hex color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#RRGGBB"
                  className="font-mono"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Mapped canonical</Label>
            <Select value={canonical} onValueChange={setCanonical}>
              <SelectTrigger>
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
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {mode === "create" ? "Create" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
