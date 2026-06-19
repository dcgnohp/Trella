"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DeleteInUseDialogProps {
  /** When non-null the dialog is open for the named status. */
  target: { name: string; referenceCount: number | null } | null
  onOpenChange: (open: boolean) => void
}

/**
 * Warning shown when a delete is refused because the custom status is still in
 * use (backend HTTP 409). It reports the reference count and performs no
 * deletion (Req 11.11).
 */
export function DeleteInUseDialog({
  target,
  onOpenChange,
}: DeleteInUseDialogProps) {
  const count = target?.referenceCount ?? null
  const usage =
    count === null
      ? "one or more tasks or columns"
      : `${count} task${count === 1 ? "" : "s"} or column${
          count === 1 ? "" : "s"
        }`

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 text-warning-foreground"
              strokeWidth={1.5}
            />
            Can&apos;t delete this status
          </DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">
                  {target.name}
                </span>{" "}
                is still used by{" "}
                <span className="tabular-nums">{usage}</span>. Reassign or remove
                those first, then try again.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
