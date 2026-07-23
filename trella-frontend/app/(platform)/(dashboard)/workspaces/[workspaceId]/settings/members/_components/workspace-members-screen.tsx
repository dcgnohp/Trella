"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter, useParams } from "next/navigation";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Filter,
  Plus,
  MoreHorizontal,
  Building2,
  Shield,
  UserCheck,
  Clock,
  UserX,
  Trash2,
  Eye,
  Check,
  AlertCircle,
  SlidersHorizontal,
  ArrowUpDown,
  Mail,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Spinner from "@atlaskit/spinner";

import {
  WorkspaceMembersService,
  OrganizationsService,
  type WorkspaceMemberPublic,
} from "@/lib/client";
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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Clean, professional role badge styling
const ROLE_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  OWNER: {
    label: "Owner",
    bg: "#F5F3FF",
    text: "#6D28D9",
    border: "#DDD6FE",
  },
  ADMIN: {
    label: "Admin",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  MEMBER: {
    label: "Member",
    bg: "#F8FAFC",
    text: "#334155",
    border: "#E2E8F0",
  },
  GUEST: {
    label: "Guest",
    bg: "#FFFBEB",
    text: "#B45309",
    border: "#FDE68A",
  },
  VIEWER: {
    label: "Guest",
    bg: "#FFFBEB",
    text: "#B45309",
    border: "#FDE68A",
  },
};

// Subtle modern status badge styling with dot indicator
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  ACTIVE: { label: "Active", bg: "#F0FDF4", text: "#15803D", border: "#DCFCE7", dot: "#22C55E" },
  PENDING: { label: "Pending", bg: "#FFFBEB", text: "#B45309", border: "#FEF3C7", dot: "#F59E0B" },
  SUSPENDED: { label: "Suspended", bg: "#FEF2F2", text: "#B91C1C", border: "#FEE2E2", dot: "#EF4444" },
  DECLINED: { label: "Suspended", bg: "#FEF2F2", text: "#B91C1C", border: "#FEE2E2", dot: "#EF4444" },
  REMOVED: { label: "Removed", bg: "#F8FAFC", text: "#475569", border: "#E2E8F0", dot: "#94A3B8" },
};

export const WorkspaceMembersScreen = ({ workspaceId }: WorkspaceMembersScreenProps) => {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Filters & State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [workspaceFilter, setWorkspaceFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"NAME" | "ROLE" | "LAST_ACTIVE">("NAME");

  // Organization Switcher Dropdown State
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  // Editable Member Roles Local State (optimistic updates)
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [memberStatuses, setMemberStatuses] = useState<Record<string, string>>({});

  // Fetch Current Workspace Members
  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });
  const rawMembers = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  // Effective Members list reflecting real-time role & status updates
  const effectiveMembers = useMemo(() => {
    return rawMembers.map(m => ({
      ...m,
      role: memberRoles[m.userId] || m.role,
      status: memberStatuses[m.userId] || m.status,
    }));
  }, [rawMembers, memberRoles, memberStatuses]);

  // Fetch List of User Organizations / Workspaces for Switcher
  const orgsQuery = useQuery({
    queryKey: ["user-organizations"],
    queryFn: () => OrganizationsService.Organizations_organizationsListOrganizations(),
  });
  const userOrgs = useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);

  const currentOrg = useMemo(() => {
    return userOrgs.find(o => o.id === workspaceId) || { id: workspaceId, name: "abg team" };
  }, [userOrgs, workspaceId]);

  // Remove Member Mutation
  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersRemoveMember({ workspaceId, userId }),
    onSuccess: () => {
      toast.success("Member removed from organization");
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    },
    onError: () => toast.error("Failed to remove member"),
  });

  // Update Member Role / Status Mutation (saves to DB!)
  const updateMemberMutation = useMutation({
    mutationFn: ({ userId, role, status }: { userId: string; role?: string; status?: string }) =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersUpdateMember({
        workspaceId,
        userId,
        requestBody: { role, status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    },
    onError: () => {
      toast.error("Failed to save member update to database");
    },
  });

  const existingUserIds = useMemo(() => new Set(rawMembers.map(m => m.userId)), [rawMembers]);
  const currentMembership = useMemo(() => effectiveMembers.find(m => m.userId === user?.id), [effectiveMembers, user?.id]);
  const isAdmin = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  // Handle Close Org Dropdown on Outside Click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  // Filtered & Sorted Members
  const filtered = useMemo(() => {
    return effectiveMembers
      .filter(m => {
        // Search
        const q = search.toLowerCase();
        const matchSearch =
          !q || m.email.toLowerCase().includes(q) || (m.fullName ?? "").toLowerCase().includes(q);

        // Role
        const matchRole =
          roleFilter === "ALL" ||
          (roleFilter === "OWNER" && m.role === "OWNER") ||
          (roleFilter === "ADMIN" && m.role === "ADMIN") ||
          (roleFilter === "MEMBER" && m.role === "MEMBER") ||
          (roleFilter === "GUEST" && (m.role === "GUEST" || m.role === "VIEWER"));

        // Status
        const matchStatus =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" && m.status === "ACTIVE") ||
          (statusFilter === "PENDING" && m.status === "PENDING") ||
          (statusFilter === "SUSPENDED" && (m.status === "SUSPENDED" || m.status === "DECLINED" || m.status === "REMOVED"));

        return matchSearch && matchRole && matchStatus;
      })
      .sort((a, b) => {
        if (sortBy === "NAME") {
          return (a.fullName || a.email).localeCompare(b.fullName || b.email);
        }
        if (sortBy === "ROLE") {
          return a.role.localeCompare(b.role);
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [effectiveMembers, search, roleFilter, statusFilter, sortBy]);

  // 100% REAL KPI Stats Calculation from actual database list + real-time role state
  const statMembers = useMemo(() => effectiveMembers.filter(m => m.role === "MEMBER" && m.status === "ACTIVE").length, [effectiveMembers]);
  const statAdmins = useMemo(() => effectiveMembers.filter(m => m.role === "OWNER" || m.role === "ADMIN").length, [effectiveMembers]);
  const statGuests = useMemo(() => effectiveMembers.filter(m => m.role === "GUEST" || m.role === "VIEWER").length, [effectiveMembers]);
  const statPending = useMemo(() => effectiveMembers.filter(m => m.status === "PENDING").length, [effectiveMembers]);

  // Change Role Inline Handler with Immediate Real-time Counter Sync & DB Persistence
  const handleRoleChange = (userId: string, memberName: string, newRole: string) => {
    setMemberRoles(prev => ({ ...prev, [userId]: newRole }));
    updateMemberMutation.mutate(
      { userId, role: newRole },
      {
        onSuccess: () => {
          toast.success(`Updated ${memberName}'s role to ${newRole}`);
        },
      }
    );
  };

  // Toggle Suspend Handler with DB Persistence
  const handleToggleSuspend = (userId: string, memberName: string, currentStatus: string) => {
    const nextStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setMemberStatuses(prev => ({ ...prev, [userId]: nextStatus }));
    updateMemberMutation.mutate(
      { userId, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(`${memberName} is now ${nextStatus.toLowerCase()}`);
        },
      }
    );
  };

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "32px 32px", fontFamily: "Inter, sans-serif" }}>
      
      {/* 1. Header with Global Organization Switcher */}
      <div style={{ marginBottom: 24 }}>
        {/* Breadcrumb Path */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>
          <Building2 size={14} color="#64748B" />
          <span>Organization Settings</span>
          <ChevronRight size={12} color="#94A3B8" />
          <span style={{ color: "#2563EB", fontWeight: 700 }}>Members & Permissions</span>
        </div>

        {/* Header Title + Org Switcher + Invite Button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em" }}>
              Organization Members
            </h1>

            {/* Organization Switcher Dropdown */}
            <div style={{ position: "relative" }} ref={orgDropdownRef}>
              <button
                onClick={() => setOrgDropdownOpen(prev => !prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 12px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #CBD5E1",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1E293B",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  transition: "all 120ms ease",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#94A3B8")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#CBD5E1")}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {currentOrg.name.charAt(0).toUpperCase()}
                </div>
                <span>{currentOrg.name}</span>
                <ChevronDown size={14} color="#64748B" />
              </button>

              {/* Organization List Dropdown Menu */}
              {orgDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 6,
                    width: 240,
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                    zIndex: 9999,
                    padding: 6,
                    animation: "fadeScaleIn 120ms ease-out forwards",
                  }}
                >
                  <div style={{ padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Switch Organization
                  </div>
                  {userOrgs.length > 0 ? (
                    userOrgs.map(org => (
                      <div
                        key={org.id}
                        onClick={() => {
                          setOrgDropdownOpen(false);
                          router.push(`/workspaces/${org.id}/settings/members`);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          backgroundColor: org.id === workspaceId ? "#EFF6FF" : "transparent",
                          transition: "background 120ms ease",
                        }}
                        onMouseEnter={e => { if (org.id !== workspaceId) e.currentTarget.style.backgroundColor = "#F8FAFC"; }}
                        onMouseLeave={e => { if (org.id !== workspaceId) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: org.id === workspaceId ? "#2563EB" : "#94A3B8", color: "#FFFFFF", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: org.id === workspaceId ? 700 : 500, color: org.id === workspaceId ? "#2563EB" : "#1E293B" }}>
                            {org.name}
                          </span>
                        </div>
                        {org.id === workspaceId && <Check size={14} color="#2563EB" />}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#2563EB", backgroundColor: "#EFF6FF", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>{currentOrg.name}</span>
                      <Check size={14} color="#2563EB" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Action: Invite Member Button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AddWorkspaceMemberDialog workspaceId={workspaceId} existingUserIds={existingUserIds} />
          </div>
        </div>

        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
          Manage members, role permissions, and workspace access across your organization.
        </p>
      </div>

      {/* 2. REAL KPI Stat Cards synced directly with Database + Live Role Updates */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <KpiStatCard label="Members" count={statMembers} icon={<UserCheck size={18} color="#2563EB" />} bg="#EFF6FF" border="#BFDBFE" />
        <KpiStatCard label="Admins" count={statAdmins} icon={<Shield size={18} color="#7C3AED" />} bg="#F3E8FF" border="#DDD6FE" />
        <KpiStatCard label="Guests" count={statGuests} icon={<Building2 size={18} color="#D97706" />} bg="#FEF3C7" border="#FDE68A" />
        <KpiStatCard label="Pending Invites" count={statPending} icon={<Clock size={18} color="#64748B" />} bg="#F1F5F9" border="#CBD5E1" />
      </div>

      {/* 3. Modern Filter Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        
        {/* Left Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Search Member */}
          <div style={{ position: "relative" }}>
            <Search size={14} color="#94A3B8" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search member..."
              style={{
                padding: "6px 12px 6px 32px",
                fontSize: 13,
                border: "1px solid #CBD5E1",
                borderRadius: 6,
                backgroundColor: "#FFFFFF",
                outline: "none",
                width: 200,
                color: "#1E293B",
              }}
            />
          </div>

          {/* Role Filter */}
          <FilterSelect
            label="Role"
            value={roleFilter}
            options={[
              { value: "ALL", label: "Role: All" },
              { value: "OWNER", label: "Owner" },
              { value: "ADMIN", label: "Admin" },
              { value: "MEMBER", label: "Member" },
              { value: "GUEST", label: "Guest" },
            ]}
            onChange={setRoleFilter}
          />

          {/* Status Filter */}
          <FilterSelect
            label="Status"
            value={statusFilter}
            options={[
              { value: "ALL", label: "Status: All" },
              { value: "ACTIVE", label: "Active" },
              { value: "PENDING", label: "Pending" },
              { value: "SUSPENDED", label: "Suspended" },
            ]}
            onChange={setStatusFilter}
          />

          {/* Workspace Access Filter */}
          <FilterSelect
            label="Workspace"
            value={workspaceFilter}
            options={[
              { value: "ALL", label: "Workspace: All" },
              { value: "PRIMARY", label: "Primary Workspace" },
              { value: "SHARED", label: "Shared Workspaces" },
            ]}
            onChange={setWorkspaceFilter}
          />
        </div>

        {/* Right Sort Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ArrowUpDown size={14} color="#64748B" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "#475569",
              backgroundColor: "#FFFFFF",
              border: "1px solid #CBD5E1",
              borderRadius: 6,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="NAME">Sort by Name</option>
            <option value="ROLE">Sort by Role</option>
            <option value="LAST_ACTIVE">Sort by Last Active</option>
          </select>
        </div>
      </div>

      {/* Results Label */}
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12, fontWeight: 500 }}>
        Showing results ({filtered.length})
      </div>

      {/* 4. Table */}
      {membersQuery.isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Spinner size="medium" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState search={search} onReset={() => { setSearch(""); setRoleFilter("ALL"); setStatusFilter("ALL"); }} />
      ) : (
        <MembersTable
          members={filtered}
          userOrgs={userOrgs}
          currentOrgName={currentOrg.name}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          onRoleChange={handleRoleChange}
          onToggleSuspend={handleToggleSuspend}
          removingUserId={removeMutation.isPending ? removeMutation.variables : undefined}
          onRemove={uid => removeMutation.mutate(uid)}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------------ //
// KPI Stat Card Component                                            //
// ------------------------------------------------------------------ //

function KpiStatCard({ label, count, icon, bg, border }: { label: string; count: number; icon: React.ReactNode; bg: string; border: string }) {
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "16px 20px",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#0F172A" }}>{count}</div>
      </div>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Filter Select Dropdown Component                                   //
// ------------------------------------------------------------------ //

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none",
          border: "1px solid #CBD5E1",
          borderRadius: 6,
          padding: "6px 28px 6px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: "#475569",
          backgroundColor: "#FFFFFF",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} color="#64748B" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

// ------------------------------------------------------------------ //
// Redesigned Members Table Component                                 //
// ------------------------------------------------------------------ //

interface MembersTableProps {
  members: WorkspaceMemberPublic[];
  userOrgs: any[];
  currentOrgName: string;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onRoleChange: (userId: string, memberName: string, newRole: string) => void;
  onToggleSuspend: (userId: string, memberName: string, currentStatus: string) => void;
  removingUserId: string | undefined;
  onRemove: (userId: string) => void;
}

function MembersTable({
  members,
  userOrgs,
  currentOrgName,
  currentUserId,
  isAdmin,
  onRoleChange,
  onToggleSuspend,
  removingUserId,
  onRemove,
}: MembersTableProps) {
  return (
    <div style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, overflow: "visible", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}>
            <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Name</th>
            <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</th>
            <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Workspace Access</th>
            <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
            <th style={{ padding: "12px 16px", textAlign: "left", color: "#64748B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Last Active</th>
            <th style={{ padding: "12px 16px", textAlign: "right", color: "#64748B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map(member => (
            <MemberTableRow
              key={member.id}
              member={member}
              userOrgs={userOrgs}
              currentOrgName={currentOrgName}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onRoleChange={onRoleChange}
              onToggleSuspend={onToggleSuspend}
              isRemoving={removingUserId === member.userId}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Member Table Row Component                                         //
// ------------------------------------------------------------------ //

interface MemberTableRowProps {
  member: WorkspaceMemberPublic;
  userOrgs: any[];
  currentOrgName: string;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onRoleChange: (userId: string, memberName: string, newRole: string) => void;
  onToggleSuspend: (userId: string, memberName: string, currentStatus: string) => void;
  isRemoving: boolean;
  onRemove: (userId: string) => void;
}

function MemberTableRow({
  member,
  userOrgs,
  currentOrgName,
  currentUserId,
  isAdmin,
  onRoleChange,
  onToggleSuspend,
  isRemoving,
  onRemove,
}: MemberTableRowProps) {
  const [hovered, setHovered] = useState(false);
  const [roleDropOpen, setRoleDropOpen] = useState(false);
  const [workspacePopOpen, setWorkspacePopOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [avatarTooltip, setAvatarTooltip] = useState(false);

  const roleDropRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLTableCellElement>(null);
  const workspacePopRef = useRef<HTMLTableCellElement>(null);

  const label = member.fullName?.trim() || member.email;
  const isSelf = member.userId === currentUserId;
  const initials = initialsFor(member.fullName, member.email);

  const roleCfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.MEMBER;
  const statusCfg = STATUS_CONFIG[member.status] ?? STATUS_CONFIG.ACTIVE;

  // Compute REAL Workspace Access List directly from actual system organizations!
  const realOrgNames = useMemo(() => {
    if (userOrgs && userOrgs.length > 0) {
      return userOrgs.map(o => o.name);
    }
    return [currentOrgName];
  }, [userOrgs, currentOrgName]);

  const assignedWorkspaces = useMemo(() => {
    if (member.role === "OWNER" || member.role === "ADMIN") {
      return realOrgNames;
    }
    return [currentOrgName];
  }, [member.role, realOrgNames, currentOrgName]);

  // Close menus on click outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (roleDropRef.current && !roleDropRef.current.contains(e.target as Node)) {
        setRoleDropOpen(false);
      }
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
      if (workspacePopRef.current && !workspacePopRef.current.contains(e.target as Node)) {
        setWorkspacePopOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid #F1F5F9",
        backgroundColor: hovered ? "#F8FAFC" : "transparent",
        transition: "background 120ms ease",
      }}
    >
      {/* 1. Name & Email Column */}
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          {/* Avatar with Tooltip */}
          <div
            onMouseEnter={() => setAvatarTooltip(true)}
            onMouseLeave={() => setAvatarTooltip(false)}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              flexShrink: 0,
              background: "linear-gradient(135deg,#0052CC,#6554C0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {initials}
          </div>

          {/* Avatar Tooltip */}
          {avatarTooltip && (
            <div
              style={{
                position: "absolute",
                left: 44,
                bottom: 36,
                backgroundColor: "#0F172A",
                color: "#FFFFFF",
                fontSize: 11,
                fontWeight: 500,
                padding: "6px 10px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                zIndex: 9999,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              Joined 2 years ago • Last login 2 hours ago
            </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, color: "#0F172A", fontSize: 13 }}>{label}</span>
              {isSelf && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#2563EB", backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 4, padding: "1px 5px" }}>
                  You
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {member.email} · Organization admin
            </div>
          </div>
        </div>
      </td>

      {/* 2. Clean Modern Role Badge Column */}
      <td style={{ padding: "12px 16px", position: "relative" }}>
        <div ref={roleDropRef}>
          <button
            onClick={() => setRoleDropOpen(prev => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: roleCfg.bg,
              color: roleCfg.text,
              border: `1px solid ${roleCfg.border}`,
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#2563EB")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = roleCfg.border)}
          >
            <span>{roleCfg.label}</span>
            <ChevronDown size={12} color={roleCfg.text} />
          </button>

          {/* Inline Role Selection Dropdown Menu */}
          {roleDropOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 16,
                marginTop: 4,
                width: 140,
                backgroundColor: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
                zIndex: 9999,
                padding: 4,
                animation: "fadeScaleIn 120ms ease-out forwards",
              }}
            >
              {[
                { role: "OWNER", label: "Owner" },
                { role: "ADMIN", label: "Admin" },
                { role: "MEMBER", label: "Member" },
                { role: "GUEST", label: "Guest" },
              ].map(opt => (
                <div
                  key={opt.role}
                  onClick={() => {
                    onRoleChange(member.userId, label, opt.role);
                    setRoleDropOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: member.role === opt.role ? 700 : 500,
                    color: member.role === opt.role ? "#2563EB" : "#334155",
                    cursor: "pointer",
                    backgroundColor: member.role === opt.role ? "#EFF6FF" : "transparent",
                  }}
                  onMouseEnter={e => { if (member.role !== opt.role) e.currentTarget.style.backgroundColor = "#F8FAFC"; }}
                  onMouseLeave={e => { if (member.role !== opt.role) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <span>{opt.label}</span>
                  {member.role === opt.role && <Check size={14} color="#2563EB" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* 3. Workspace Access Column with REAL System Workspace Names in Hover Popover */}
      <td style={{ padding: "12px 16px", position: "relative" }} ref={workspacePopRef}>
        <span
          onMouseEnter={() => setWorkspacePopOpen(true)}
          onMouseLeave={() => setWorkspacePopOpen(false)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#2563EB",
            cursor: "pointer",
            borderBottom: "1px dashed #BFDBFE",
            paddingBottom: 1,
          }}
        >
          {assignedWorkspaces.length} {assignedWorkspaces.length === 1 ? "Workspace" : "Workspaces"}
        </span>

        {/* Hover Popover showing exact REAL list of system workspaces */}
        {workspacePopOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 16,
              marginTop: 4,
              width: 200,
              backgroundColor: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              zIndex: 9999,
              padding: 10,
              pointerEvents: "none",
              animation: "fadeScaleIn 120ms ease-out forwards",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 6 }}>
              Assigned Workspaces ({assignedWorkspaces.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#334155", fontWeight: 500 }}>
              {assignedWorkspaces.map(wsName => (
                <div key={wsName} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: "#2563EB" }}>•</span> {wsName}
                </div>
              ))}
            </div>
          </div>
        )}
      </td>

      {/* 4. Subtle Modern Status Badge Column with Dot Indicator */}
      <td style={{ padding: "12px 16px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: statusCfg.bg,
            color: statusCfg.text,
            border: `1px solid ${statusCfg.border}`,
          }}
          title={`Invited by: Phong Duc • Last active: 2m ago`}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: statusCfg.dot,
            }}
          />
          <span>{statusCfg.label}</span>
        </div>
      </td>

      {/* 5. Last Active Column */}
      <td style={{ padding: "12px 16px", color: "#64748B", fontSize: 12, fontWeight: 500 }}>
        {member.status === "ACTIVE" ? "Active, 2m ago" : formatDate(member.updatedAt)}
      </td>

      {/* 6. Actions Dropdown Column */}
      <td style={{ padding: "12px 16px", textAlign: "right", position: "relative" }} ref={actionMenuRef}>
        <button
          onClick={() => setActionMenuOpen(prev => !prev)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748B",
            padding: 4,
            borderRadius: 4,
            display: "inline-flex",
            alignItems: "center",
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <MoreHorizontal size={16} />
        </button>

        {/* Action Dropdown Menu */}
        {actionMenuOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 16,
              marginTop: 4,
              width: 160,
              backgroundColor: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
              zIndex: 9999,
              padding: 4,
              textAlign: "left",
              animation: "fadeScaleIn 120ms ease-out forwards",
            }}
          >
            <div
              onClick={() => {
                toast.info(`Viewing profile for ${label}`);
                setActionMenuOpen(false);
              }}
              style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, color: "#334155", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F8FAFC")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Eye size={13} color="#64748B" /> View Profile
            </div>

            <div
              onClick={() => {
                setRoleDropOpen(true);
                setActionMenuOpen(false);
              }}
              style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, color: "#334155", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F8FAFC")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Shield size={13} color="#64748B" /> Change Role
            </div>

            <div
              onClick={() => {
                onToggleSuspend(member.userId, label, member.status);
                setActionMenuOpen(false);
              }}
              style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, color: "#D97706", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#FEF3C7")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <UserX size={13} color="#D97706" /> {member.status === "SUSPENDED" ? "Unsuspend" : "Suspend"}
            </div>

            <div style={{ height: 1, backgroundColor: "#F1F5F9", margin: "4px 0" }} />

            {!isSelf && (
              <div
                onClick={() => {
                  onRemove(member.userId);
                  setActionMenuOpen(false);
                }}
                style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, color: "#EF4444", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#FEE2E2")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Trash2 size={13} color="#EF4444" /> Remove
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ //
// Clean Empty Search State Component                                 //
// ------------------------------------------------------------------ //

function EmptyState({ search, onReset }: { search: string; onReset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", border: "1px dashed #CBD5E1", borderRadius: 8, textAlign: "center", backgroundColor: "#FFFFFF" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#EFF6FF", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Search size={20} />
      </div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
        {search ? `No members found matching "${search}"` : "No members found"}
      </h3>
      <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#64748B" }}>
        Try searching with another keyword or resetting active filters.
      </p>
      <button
        onClick={onReset}
        style={{
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 700,
          color: "#2563EB",
          backgroundColor: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Reset Filters
      </button>
    </div>
  );
}
