'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { token } from '@atlaskit/tokens';
import PageHeader from '@atlaskit/page-header';
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import { toast } from 'sonner';
import { WorkspaceMembersService, PlansService, NotificationsService, type WorkspaceMemberPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { AddWorkspaceMemberDialog } from '../../../settings/members/_components/add-workspace-member-dialog';

interface PlanMembersPageProps {
  params: { workspaceId: string; planId: string };
}

export default function PlanMembersPage({ params }: PlanMembersPageProps) {
  const { workspaceId, planId } = params;
  const queryClient = useQueryClient();

  const [planMembers, setPlanMembers] = useState<WorkspaceMemberPublic[]>([]);

  // Fetch plan details
  const planQuery = useQuery({
    queryKey: queryKeys.plan(planId),
    queryFn: () => PlansService.Plans_plansGetPlan({ planId }),
  });
  const planName = planQuery.data?.name ?? 'Plan';

  // Fetch workspace members
  const workspaceMembersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });
  const workspaceMembers = workspaceMembersQuery.data ?? [];

  // Load plan members from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`plan_members_${planId}`);
    if (saved) {
      try {
        setPlanMembers(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load plan members', e);
      }
    } else if (workspaceMembers.length > 0) {
      // Default to the first workspace member (or workspace owner) if nothing is saved yet
      const defaultMembers = workspaceMembers.slice(0, 1);
      setPlanMembers(defaultMembers);
      localStorage.setItem(`plan_members_${planId}`, JSON.stringify(defaultMembers));
    }
  }, [planId, workspaceMembers]);

  // Mutation to send invitation notification
  const sendNotificationMutation = useMutation({
    mutationFn: (recipientId: string) =>
      NotificationsService.Notifications_notificationsSendNotification({
        requestBody: {
          recipientId,
          type: 'PLAN_INVITATION',
          title: 'Added to Plan',
          content: `You have been added to the plan "${planName}"`,
        },
      }),
    onSuccess: () => {
      toast.success('Member notified successfully');
    },
    onError: () => {
      toast.error('Failed to send notification to member');
    },
  });

  const handleAddMember = (member: WorkspaceMemberPublic) => {
    if (planMembers.some(m => m.userId === member.userId)) {
      toast.error('Member is already in the plan');
      return;
    }
    const updated = [...planMembers, member];
    setPlanMembers(updated);
    localStorage.setItem(`plan_members_${planId}`, JSON.stringify(updated));

    // Send notification
    sendNotificationMutation.mutate(member.userId);
    toast.success(`${member.fullName ?? member.email} added to the plan`);
  };

  const handleRemoveMember = (userId: string) => {
    const updated = planMembers.filter(m => m.userId !== userId);
    setPlanMembers(updated);
    localStorage.setItem(`plan_members_${planId}`, JSON.stringify(updated));
    toast.success('Member removed from the plan');
  };

  // Filter out members who are already in the plan
  const addableMembers = workspaceMembers.filter(
    wm => !planMembers.some(pm => pm.userId === wm.userId)
  );

  const memberOptions = addableMembers.map(m => ({
    label: `${m.fullName ?? m.email} (${m.role})`,
    value: m,
  }));

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: `${token('space.300')} ${token('space.500')}`, flexShrink: 0 }}>
        <PageHeader>Plan Members</PageHeader>
      </div>

      <div style={{ padding: `0 ${token('space.500')} ${token('space.500')}`, maxWidth: 650 }}>
        <div style={{
          background: token('elevation.surface'),
          border: `1px solid ${token('color.border')}`,
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 1px 3px rgba(9,30,66,0.12)',
        }}>
          {/* Add member section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: token('color.text'), marginBottom: 8 }}>Add member to plan</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <Select
                  options={memberOptions}
                  onChange={(opt) => {
                    if (opt) {
                      handleAddMember((opt as { value: WorkspaceMemberPublic }).value);
                    }
                  }}
                  placeholder="Select a workspace member..."
                  isLoading={workspaceMembersQuery.isLoading}
                  value={null}
                  menuPlacement="auto"
                />
              </div>
              <AddWorkspaceMemberDialog workspaceId={workspaceId} existingUserIds={new Set()} />
            </div>
            <p style={{ fontSize: 12, color: token('color.text.subtlest'), marginTop: 6 }}>
              Only members of this workspace can be added to the plan.
            </p>
          </div>

          <div style={{ height: 1, background: token('color.border'), margin: '20px 0' }} />

          {/* Members list */}
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: token('color.text'), marginBottom: 12 }}>
              Active Members ({planMembers.length})
            </h3>

            {planMembers.length === 0 ? (
              <p style={{ fontSize: 13, color: token('color.text.subtlest') }}>No members assigned to this plan yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {planMembers.map(member => (
                  <div
                    key={member.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 6,
                      background: token('color.background.neutral.subtle'),
                      border: `1px solid ${token('color.border')}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Avatar placeholder */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#0052CC,#6554C0)',
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600,
                      }}>
                        {(member.fullName ?? member.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: token('color.text') }}>
                          {member.fullName || 'Workspace Member'}
                        </div>
                        <div style={{ fontSize: 12, color: token('color.text.subtle') }}>
                          {member.email} · <span style={{ textTransform: 'lowercase' }}>{member.role}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: token('color.text.danger'),
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        padding: '4px 8px',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
