"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DeleteIcon from "@atlaskit/icon/core/delete";
import PeopleGroupIcon from "@atlaskit/icon/core/people-group";
import SearchIcon from "@atlaskit/icon/core/search";
import ChevronDownIcon from "@atlaskit/icon/core/chevron-down";
import ShowMoreHorizontalIcon from "@atlaskit/icon/core/show-more-horizontal";
import Spinner from "@atlaskit/spinner";

import { WorkspaceMembersService, type WorkspaceMemberPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";

import { AddWorkspaceMemberDialog } from "./add-workspace-member-dialog";

interface WorkspaceMembersScreenProps {
  workspaceId: string;
}

function initialsFor(fullName: string | null | undefined, email: string): string {
  const name = fullName?.trim() || email;
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  ACTIVE:   { bg: '#E3FCEF', text: '#006644', border: '#57D9A3' },
  PENDING:  { bg: '#FFFAE6', text: '#974F0C', border: '#FFD60A' },
  DECLINED: { bg: 'var(--trella-surface-sunken)', text: 'var(--trella-text-subtle)', border: 'var(--trella-border-strong)' },
  REMOVED:  { bg: '#FFEBE6', text: '#BF2600', border: '#FF8F73' },
};

export const WorkspaceMembersScreen = ({ workspaceId }: WorkspaceMembersScreenProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersRemoveMember({ workspaceId, userId }),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    },
    onError: () => toast.error("Failed to remove member"),
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const existingUserIds = useMemo(() => new Set(members.map(m => m.userId)), [members]);

  const currentMembership = useMemo(() => members.find(m => m.userId === user?.id), [members, user?.id]);
  const isAdmin = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  const filtered = useMemo(() => members.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.email.toLowerCase().includes(q) || (m.fullName ?? '').toLowerCase().includes(q);
    const matchRole = !roleFilter || m.role === roleFilter;
    return matchSearch && matchRole;
  }), [members, search, roleFilter]);

  // Stat counts
  const total = members.length;
  const active = members.filter(m => m.status === 'ACTIVE').length;
  const admins = members.filter(m => m.role === 'OWNER' || m.role === 'ADMIN').length;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--trella-text)' }}>Users</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--trella-text-subtle)' }}>
            Manage who has access to this workspace.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAdmin && (
            <AddWorkspaceMemberDialog workspaceId={workspaceId} existingUserIds={existingUserIds} />
          )}
          <button style={{
            background: 'none', border: '1px solid var(--trella-border)', borderRadius: 4,
            padding: '0 12px', height: 32, cursor: 'pointer', color: 'var(--trella-text-subtle)',
            display: 'flex', alignItems: 'center',
          }}>
            <ShowMoreHorizontalIcon label="More" size="small" />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total users" count={total} />
        <StatCard label="Active users" count={active} />
        <StatCard label="Managed accounts" count={0} info />
        <StatCard label="Organization admins" count={admins} />
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--trella-border)', borderRadius: 4, padding: '0 10px', height: 32,
          backgroundColor: 'var(--trella-surface)',
        }}>
          <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex' }}><SearchIcon label="" size="small" /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email"
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--trella-text)', width: 180 }}
          />
        </div>

        <FilterDropdown
          label="Role"
          value={roleFilter}
          options={[
            { value: '', label: 'All roles' },
            { value: 'OWNER', label: 'Owner' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'MEMBER', label: 'Member' },
            { value: 'VIEWER', label: 'Viewer' },
          ]}
          onChange={setRoleFilter}
        />
      </div>

      {/* Results label */}
      <p style={{ fontSize: 13, color: 'var(--trella-text-subtle)', marginBottom: 12 }}>
        Showing results ({filtered.length})
      </p>

      {/* Table */}
      {membersQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size="medium" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <MembersTable
          members={filtered}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          removingUserId={removeMutation.isPending ? removeMutation.variables : undefined}
          onRemove={uid => removeMutation.mutate(uid)}
        />
      )}
    </div>
  );
};

function StatCard({ label, count, info }: { label: string; count: number; info?: boolean }) {
  return (
    <div style={{
      border: '1px solid var(--trella-border)', borderRadius: 6, padding: '16px 20px',
      backgroundColor: 'var(--trella-surface)',
    }}>
      <div style={{ fontSize: 13, color: 'var(--trella-text-subtle)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {info && <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest)', border: '1px solid var(--trella-border)', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }} title="Managed accounts are users whose accounts are owned by your organization.">i</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--trella-text)' }}>{count}</div>
    </div>
  );
}

function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', border: '1px solid var(--trella-border)', borderRadius: 4,
          padding: '0 32px 0 12px', height: 32, fontSize: 13, color: 'var(--trella-text)',
          backgroundColor: 'var(--trella-surface)', cursor: 'pointer', outline: 'none',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.value === '' ? label : o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--trella-text-subtle)', display: 'flex' }}>
        <ChevronDownIcon label="" size="small" />
      </span>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Organization admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

function MembersTable({ members, currentUserId, isAdmin, removingUserId, onRemove }: {
  members: WorkspaceMemberPublic[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  removingUserId: string | undefined;
  onRemove: (userId: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--trella-border)' }}>
          <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--trella-text-subtle)', fontWeight: 500 }}>User</th>
          <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--trella-text-subtle)', fontWeight: 500 }}>Status</th>
          <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--trella-text-subtle)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            Last seen
            <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest)', border: '1px solid var(--trella-border)', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }} title="Date the user last accessed this workspace">i</span>
          </th>
          <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--trella-text-subtle)', fontWeight: 500 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {members.map(member => {
          const label = member.fullName?.trim() || member.email;
          const isSelf = member.userId === currentUserId;
          const isRemoving = removingUserId === member.userId;
          const canRemove = isAdmin && !isSelf && member.status !== 'REMOVED';
          const statusStyle = STATUS_COLOR[member.status] ?? STATUS_COLOR.DECLINED;
          const initials = initialsFor(member.fullName, member.email);

          return (
            <tr key={member.id} style={{ borderBottom: '1px solid #F4F5F7' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--trella-surface-raised)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
            >
              {/* User col */}
              <td style={{ padding: '12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,#0052CC,#6554C0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 12, fontWeight: 700,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500, color: 'var(--trella-text)', fontSize: 14 }}>{label}</span>
                      {isSelf && <span style={{ fontSize: 11, color: 'var(--trella-text-subtle)', border: '1px solid var(--trella-border)', borderRadius: 3, padding: '0 5px' }}>You</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--trella-text-subtle)', marginTop: 1 }}>
                      {member.email} · {ROLE_LABEL[member.role] ?? member.role}
                    </div>
                  </div>
                </div>
              </td>

              {/* Status col */}
              <td style={{ padding: '12px 12px' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: statusStyle.text,
                  backgroundColor: statusStyle.bg,
                  border: `1px solid ${statusStyle.border}`,
                  padding: '2px 8px', borderRadius: 3,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {member.status}
                </span>
              </td>

              {/* Last seen col */}
              <td style={{ padding: '12px 12px', color: 'var(--trella-text-subtle)', fontSize: 13 }}>
                {formatDate(member.updatedAt)}
              </td>

              {/* Actions col */}
              <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                {canRemove ? (
                  <button
                    disabled={isRemoving}
                    onClick={() => onRemove(member.userId)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--trella-text-subtle)', padding: 4, borderRadius: 4,
                      display: 'inline-flex', alignItems: 'center',
                    }}
                    title="Remove member"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-selected)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {isRemoving ? <Spinner size="small" /> : <DeleteIcon label="Remove" size="small" />}
                  </button>
                ) : (
                  <button style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--trella-text-subtle)', padding: 4, borderRadius: 4,
                    display: 'inline-flex', alignItems: 'center',
                  }}>
                    <ShowMoreHorizontalIcon label="More" size="small" />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const EmptyState = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', border: '1px dashed var(--trella-border)', borderRadius: 6, textAlign: 'center' }}>
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: 'var(--trella-text-subtlest)' }}>
      <PeopleGroupIcon label="" size="medium" />
    </span>
    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--trella-text)' }}>No members yet</p>
    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--trella-text-subtle)' }}>Invite people to join this workspace.</p>
  </div>
);
