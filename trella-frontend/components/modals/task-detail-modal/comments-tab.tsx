"use client";

import * as React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Loader2, SendHorizonal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  CommentsService,
  ProjectMembersService,
  type CommentPublic,
  type ProjectMemberPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { getInitials, taskCommentsKey } from "./shared";

/** Max comment length enforced by the backend. */
const MAX_COMMENT_LENGTH = 5000;

const MENTION_RE = /@([\w][\w\s]{0,48}[\w]|[\w])$/;

interface CommentsTabProps {
  taskId: string;
  projectId?: string;
}

export function CommentsTab({ taskId, projectId }: CommentsTabProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState("");
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionStart, setMentionStart] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const queryKey = taskCommentsKey(taskId);

  const {
    data: comments,
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () =>
      CommentsService.Comments_commentsListComments({ taskId, limit: 100 }),
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(projectId ?? ""),
    queryFn: () =>
      ProjectMembersService.ProjectMembers_projectMembersListMembers({
        projectId: projectId ?? "",
      }),
    enabled: !!projectId && mentionQuery !== null,
    staleTime: 60_000,
  });

  const mentionCandidates: ProjectMemberPublic[] = React.useMemo(() => {
    if (mentionQuery === null || !membersQuery.data) return [];
    const lower = mentionQuery.toLowerCase();
    return membersQuery.data.filter(
      (m) =>
        m.status === "ACTIVE" &&
        (m.fullName?.toLowerCase().includes(lower) ||
          m.email.toLowerCase().includes(lower)),
    );
  }, [mentionQuery, membersQuery.data]);

  const createComment = useMutation({
    mutationFn: (text: string) =>
      CommentsService.Comments_commentsCreateComment({
        taskId,
        requestBody: { content: text },
      }),
    onSuccess: (created) => {
      queryClient.setQueryData<CommentPublic[]>(queryKey, (prev) =>
        prev ? [...prev, created] : [created],
      );
      setContent("");
      setMentionQuery(null);
    },
  });

  const trimmed = content.trim();
  const tooLong = content.length > MAX_COMMENT_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !createComment.isPending;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = MENTION_RE.exec(textBeforeCursor);
    if (match) {
      setMentionQuery(match[1] ?? "");
      setMentionStart(match.index);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (member: ProjectMemberPublic) => {
    const name = member.fullName?.trim() || member.email;
    const before = content.slice(0, mentionStart);
    const after = content.slice(
      textareaRef.current?.selectionStart ?? content.length,
    );
    const newContent = `${before}@${name} ${after}`;
    setContent(newContent);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) createComment.mutate(trimmed);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    createComment.mutate(trimmed);
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(@[\w][\w\s]{0,48}[\w]|@[\w])/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="font-medium text-primary">
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-[42vh] space-y-4 overflow-y-auto pr-1">
        {isLoading ? (
          <CommentsSkeleton />
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Couldn&apos;t load comments. Try reopening the task.
          </p>
        ) : !comments || comments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Be the first to comment
          </p>
        ) : (
          comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} renderContent={renderContent} />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="relative space-y-2">
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full mb-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
            {mentionCandidates.slice(0, 6).map((m) => (
              <button
                key={m.userId}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(m.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate font-medium">
                  {m.fullName?.trim() || m.email}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {m.email}
                </span>
              </button>
            ))}
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment… use @Name to mention someone"
          aria-label="Write a comment"
          className="min-h-[72px] resize-y"
          disabled={createComment.isPending}
        />
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "text-xs",
              tooLong ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {createComment.isError
              ? "Couldn't post your comment. Please try again."
              : tooLong
                ? `Comment exceeds ${MAX_COMMENT_LENGTH.toLocaleString()} characters`
                : ""}
          </p>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {createComment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" strokeWidth={1.75} />
            )}
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

function CommentRow({
  comment,
  renderContent,
}: {
  comment: CommentPublic;
  renderContent: (text: string) => React.ReactNode;
}) {
  const { author } = comment;
  const created = safeRelativeTime(comment.createdAt);

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        {author.avatarUrl ? (
          <AvatarImage src={author.avatarUrl} alt={author.fullName ?? "User"} />
        ) : null}
        <AvatarFallback className="text-[11px] font-medium">
          {getInitials(author.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {author.fullName ?? "Deleted User"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {created}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
          {renderContent(comment.content)}
        </p>
      </div>
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
