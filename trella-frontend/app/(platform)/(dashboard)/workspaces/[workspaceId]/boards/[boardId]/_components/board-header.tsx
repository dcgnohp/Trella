"use client";

import Link from "next/link";
import { Users, MoreHorizontal, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBoard } from "@/actions/delete-board";
import { useAction } from "@/hooks/use-action";
import type { BoardPublic } from "@/lib/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface BoardHeaderProps {
  board: BoardPublic;
  workspaceId: string;
}

export const BoardHeader = ({ board, workspaceId }: BoardHeaderProps) => {
  const { execute, isLoading } = useAction(deleteBoard, {
    onError: (error) => {
      toast.error(error);
    }
  });

  const onDelete = () => {
    execute({ id: board.id, orgId: workspaceId });
  };

  return (
    <div className="flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
      <h1 className="text-lg font-semibold truncate">{board.title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link
            href={`/projects/${workspaceId}/boards/${board.id}/members`}
          >
            <Users className="h-4 w-4 mr-1.5" />
            Members
          </Link>
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="px-0 pt-3 pb-3 w-56" 
            side="bottom" 
            align="end"
          >
            <div className="text-sm font-medium text-center text-neutral-600 pb-4">
              Board actions
            </div>
            <PopoverClose asChild>
              <Button 
                className="h-auto w-auto p-2 absolute top-2 right-2 text-neutral-600"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </PopoverClose>
            <Button
              variant="ghost"
              onClick={onDelete}
              disabled={isLoading}
              className="rounded-none w-full h-auto p-2 px-5 justify-start font-normal text-sm text-destructive hover:text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete this board
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
