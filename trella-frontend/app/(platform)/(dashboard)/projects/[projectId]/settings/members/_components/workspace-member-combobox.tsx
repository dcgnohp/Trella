"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { initialsFor } from "./project-roles";
import type { WorkspaceMemberCandidate } from "./use-workspace-member-directory";

interface WorkspaceMemberComboboxProps {
  candidates: WorkspaceMemberCandidate[];
  value: WorkspaceMemberCandidate | null;
  onSelect: (candidate: WorkspaceMemberCandidate) => void;
  disabled?: boolean;
}

/**
 * Searchable autocomplete over workspace members not already in the project
 * (Req 12.4). Built from Popover + Input + a filtered list since the UI kit has
 * no `Command` primitive.
 */
export const WorkspaceMemberCombobox = ({
  candidates,
  value,
  onSelect,
  disabled,
}: WorkspaceMemberComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return candidates;
    }
    return candidates.filter((candidate) => {
      const name = (candidate.fullName ?? "").toLowerCase();
      return name.includes(q) || candidate.email.toLowerCase().includes(q);
    });
  }, [candidates, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="truncate">
              {value.fullName?.trim() || value.email}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Search workspace members…
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="h-8 border-0 px-0 focus-visible:ring-0"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching workspace members.
            </p>
          ) : (
            filtered.map((candidate) => {
              const isSelected = value?.userId === candidate.userId;
              return (
                <button
                  key={candidate.userId}
                  type="button"
                  onClick={() => {
                    onSelect(candidate);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected && "bg-accent",
                  )}
                >
                  <Avatar className="h-7 w-7">
                    {candidate.avatarUrl ? (
                      <AvatarImage
                        src={candidate.avatarUrl}
                        alt={candidate.fullName ?? candidate.email}
                      />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {initialsFor(candidate.fullName, candidate.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {candidate.fullName?.trim() || candidate.email}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidate.email}
                    </span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
