"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { Download, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AttachmentsService, type AttachmentPublic } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
  BLOCKED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  formatFileSize,
  getFileIcon,
  getInitials,
  taskAttachmentsKey,
} from "./shared";

interface AttachmentsTabProps {
  taskId: string;
}

/**
 * Attachments tab of the TaskDetailModal (Req 13.4-13.6).
 *
 * Lists a task's attachments (icon by mime type, name, formatted size,
 * uploader, date) with Download + Delete actions, and offers a drag-and-drop
 * upload zone. The 25 MiB ceiling and the blocked-mime guard run client-side
 * BEFORE any multipart request leaves the browser (Req 13.5). Download resolves
 * a short-lived signed URL and opens it in a new tab (Req 13.6).
 */
export function AttachmentsTab({ taskId }: AttachmentsTabProps) {
  const queryClient = useQueryClient();
  const queryKey = taskAttachmentsKey(taskId);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const {
    data: attachments,
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () =>
      AttachmentsService.Attachments_attachmentsListAttachments({ taskId }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      AttachmentsService.Attachments_attachmentsUploadAttachment({
        taskId,
        formData: { file },
      }),
    onSuccess: (created) => {
      // Newest-first ordering (Req 5.5) → prepend.
      queryClient.setQueryData<AttachmentPublic[]>(queryKey, (prev) =>
        prev ? [created, ...prev] : [created],
      );
      toast.success("File uploaded");
    },
    onError: () => {
      toast.error("Upload failed. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      AttachmentsService.Attachments_attachmentsDeleteAttachment({
        attachmentId,
      }),
    onSuccess: (_void, attachmentId) => {
      queryClient.setQueryData<AttachmentPublic[]>(queryKey, (prev) =>
        prev ? prev.filter((a) => a.id !== attachmentId) : prev,
      );
      toast.success("Attachment removed");
    },
    onError: () => {
      toast.error("Couldn't delete attachment. Please try again.");
    },
  });

  /** Client-side guards run BEFORE the API call (Req 13.5). */
  const validateFile = React.useCallback((file: File): boolean => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("File exceeds 25 MiB size limit");
      return false;
    }
    if (BLOCKED_MIME_TYPES.has(file.type)) {
      toast.error("File type is not allowed");
      return false;
    }
    return true;
  }, []);

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      Array.from(files).forEach((file) => {
        if (validateFile(file)) {
          uploadMutation.mutate(file);
        }
      });
    },
    [uploadMutation, validateFile],
  );

  const handleDownload = async (attachmentId: string) => {
    setDownloadingId(attachmentId);
    try {
      const res =
        await AttachmentsService.Attachments_attachmentsGetAttachmentDownloadUrl(
          { attachmentId },
        );
      const url = res?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Couldn't get a download link.");
      }
    } catch {
      toast.error("Couldn't get a download link.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Drag-and-drop upload zone (Req 13.5). */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload attachments"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        {uploadMutation.isPending ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
          />
        )}
        <p className="text-sm text-muted-foreground">
          Drag files here or{" "}
          <span className="font-medium text-foreground">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">Up to 25 MiB per file</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Attachment list. */}
      <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <AttachmentsSkeleton />
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Couldn&apos;t load attachments. Try reopening the task.
          </p>
        ) : !attachments || attachments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No attachments yet
          </p>
        ) : (
          attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              downloading={downloadingId === attachment.id}
              deleting={
                deleteMutation.isPending &&
                deleteMutation.variables === attachment.id
              }
              onDownload={() => handleDownload(attachment.id)}
              onDelete={() => deleteMutation.mutate(attachment.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface AttachmentRowProps {
  attachment: AttachmentPublic;
  downloading: boolean;
  deleting: boolean;
  onDownload: () => void;
  onDelete: () => void;
}

function AttachmentRow({
  attachment,
  downloading,
  deleting,
  onDownload,
  onDelete,
}: AttachmentRowProps) {
  const Icon = getFileIcon(attachment.mimeType);
  const uploadedAt = safeDate(attachment.createdAt);
  const uploaderName = attachment.uploader.fullName ?? "Deleted User";

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {attachment.fileName}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatFileSize(attachment.sizeBytes)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="font-medium">{getInitials(uploaderName)}</span>
            {uploaderName}
          </span>
          {uploadedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{uploadedAt}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Download ${attachment.fileName}`}
          disabled={downloading}
          onClick={onDownload}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" strokeWidth={1.75} />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label={`Delete ${attachment.fileName}`}
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          )}
        </Button>
      </div>
    </div>
  );
}

function AttachmentsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function safeDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "";
  }
}
