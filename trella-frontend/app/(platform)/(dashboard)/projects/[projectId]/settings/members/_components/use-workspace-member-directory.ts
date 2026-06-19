"use client";

/**
 * Workspace-member directory for the "Add Member" autocomplete (Req 12.4).
 *
 * The autocomplete needs to search the *workspace* members who are not yet in
 * the project. The backend exposes that lookup under the `workspace_members`
 * domain, but the generated client (`@/lib/client`) does not yet ship a
 * "list workspace members" method (only invite / accept / decline / list-own-
 * invitations are generated today). Until that read endpoint is generated, this
 * hook returns `available: false` so the Add Member dialog can fall back to a
 * direct user-id entry while still driving the same `POST .../members` call.
 *
 * The shape is intentionally future-proof: when the directory endpoint lands,
 * only the body of this hook changes — every consumer keeps working.
 */

/** A workspace member candidate shown in the autocomplete. */
export interface WorkspaceMemberCandidate {
  userId: string;
  fullName: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface WorkspaceMemberDirectory {
  /** Candidates already filtered to exclude users present in the project. */
  candidates: WorkspaceMemberCandidate[];
  /** `true` once a real workspace-member listing endpoint is wired in. */
  available: boolean;
  isLoading: boolean;
}

/**
 * Resolve workspace-member candidates for a project, excluding the userIds that
 * already belong to (or are pending in) the project.
 */
export function useWorkspaceMemberDirectory(
  _projectId: string,
  _excludeUserIds: Set<string>,
): WorkspaceMemberDirectory {
  // No workspace-member listing endpoint is available on the generated client
  // yet, so the directory is empty and unavailable. Consumers degrade to manual
  // user-id entry (see AddMemberDialog).
  return {
    candidates: [],
    available: false,
    isLoading: false,
  };
}
