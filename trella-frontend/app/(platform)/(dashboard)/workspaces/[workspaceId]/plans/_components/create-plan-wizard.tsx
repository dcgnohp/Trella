'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { token } from '@atlaskit/tokens';
import Button from '@atlaskit/button/new';
import TextField from '@atlaskit/textfield';
import Select from '@atlaskit/select';
import { Stack, Text, Inline } from '@atlaskit/primitives';
import BoardsIcon from '@atlaskit/icon/core/boards';
import CrossIcon from '@atlaskit/icon/core/close';
import { BoardsService, PlansService, OrganizationsService, type PlanWithBoardsPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { PlanOnboarding } from './plan-onboarding';

interface CreatePlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

type BoardOption = { label: string; value: string };
type WorkType = 'Board';

export function CreatePlanWizard({ isOpen, onClose, workspaceId }: CreatePlanWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [workType] = useState<WorkType>('Board');
  const [selectedBoards, setSelectedBoards] = useState<BoardOption[]>([]);
  const [createdPlan, setCreatedPlan] = useState<PlanWithBoardsPublic | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>(workspaceId);

  const workspacesQuery = useQuery({
    queryKey: ['organizations-list'],
    queryFn: () => OrganizationsService.Organizations_organizationsListOrganizations(),
    enabled: isOpen,
  });
  const workspaceOptions = (workspacesQuery.data ?? []).map(org => ({ label: org.name, value: org.id }));

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(filterWorkspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: filterWorkspaceId }),
    enabled: isOpen && !!filterWorkspaceId,
  });
  const boardOptions: BoardOption[] = (boardsQuery.data ?? []).map(b => ({ label: b.title, value: b.id }));

  // Deduplicate and combine board options to retain selected boards across workspace filters
  const allBoardOptions = React.useMemo(() => {
    const map = new Map<string, BoardOption>();
    boardOptions.forEach(opt => map.set(opt.value, opt));
    selectedBoards.forEach(opt => {
      if (!map.has(opt.value)) {
        map.set(opt.value, opt);
      }
    });
    return Array.from(map.values());
  }, [boardOptions, selectedBoards]);

  const reset = () => {
    setName('');
    setSelectedBoards([]);
    setCreatedPlan(null);
    setShowOnboarding(false);
    setFilterWorkspaceId(workspaceId);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: () =>
      PlansService.Plans_plansCreatePlan({
        workspaceId,
        requestBody: {
          name,
          boardIds: selectedBoards.map(b => b.value),
        },
      }),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plans(workspaceId) });
      toast.success('Plan successfully created');
      setCreatedPlan(plan);
      setShowOnboarding(true);
    },
    onError: () => toast.error('Failed to create plan'),
  });

  if (!isOpen) return null;

  // After creation — show onboarding overlay
  if (showOnboarding && createdPlan) {
    return (
      <PlanOnboarding
        plan={createdPlan}
        workspaceId={workspaceId}
        onFinish={() => {
          handleClose();
          router.push(`/workspaces/${workspaceId}/plans/${createdPlan.id}/summary`);
        }}
        onSkip={() => {
          handleClose();
          router.push(`/workspaces/${workspaceId}/plans/${createdPlan.id}/summary`);
        }}
      />
    );
  }

  const canCreate = name.trim().length > 0;
  const epicCount = selectedBoards.length * 4; // preview hint

  return (
    // Fullscreen overlay
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(9,30,66,0.54)',
      display: 'flex',
    }}>
      {/* Left panel — form */}
      <div style={{
        width: 480,
        flexShrink: 0,
        background: token('elevation.surface'),
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 36px',
        borderRight: `1px solid ${token('color.border')}`,
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: 'none', cursor: 'pointer', color: token('color.icon'), padding: 4, borderRadius: 4 }}
          aria-label="Close"
        >
          <CrossIcon label="Close" size="small" />
        </button>

        {/* Jira logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, background: token('color.background.brand.bold'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BoardsIcon label="" size="small" color={token('color.icon.inverse')} />
          </div>
          <Text weight="bold" color="color.text">Trella</Text>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 6 }}>
            <Text size="large" weight="bold" color="color.text">Create your plan</Text>
          </div>
          <Text color="color.text.subtle">Visualize, plan, track, and report on work across multiple boards.</Text>
        </div>

        <Text size="small" color="color.text.subtle">Required fields are marked with an asterisk *</Text>

        <div style={{ height: 20 }} />

        <Stack space="space.200">
          {/* Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text'), display: 'block', marginBottom: 4 }}>
              Name <span style={{ color: token('color.text.danger') }}>*</span>
            </label>
            <TextField
              value={name}
              onChange={e => setName(e.currentTarget.value)}
              placeholder="Enter a plan name"
              autoFocus
            />
          </div>

          {/* Add work */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <Text weight="semibold" color="color.text">Add work</Text>
            </div>
            <Text size="small" color="color.text.subtle">Include work items from multiple boards.</Text>
          </div>

          {/* Workspace Selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text'), display: 'block', marginBottom: 4 }}>
              Workspace
            </label>
            <Select
              options={workspaceOptions}
              value={workspaceOptions.find(o => o.value === filterWorkspaceId)}
              onChange={opt => setFilterWorkspaceId((opt as { value: string })?.value ?? workspaceId)}
              isLoading={workspacesQuery.isLoading}
              placeholder="Select workspace"
              menuPlacement="auto"
            />
          </div>

          {/* Work row: type + board picker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text'), display: 'block', marginBottom: 4 }}>
              Work <span style={{ color: token('color.text.danger') }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Work type — Board only, displayed as static pill */}
              <div style={{
                width: 110, flexShrink: 0,
                border: `1px solid ${token('color.border')}`,
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 14,
                color: token('color.text'),
                background: token('elevation.surface'),
                display: 'flex', alignItems: 'center',
              }}>
                Board
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  isMulti
                  options={allBoardOptions}
                  value={selectedBoards}
                  onChange={opts => setSelectedBoards((opts as BoardOption[]) ?? [])}
                  isLoading={boardsQuery.isLoading}
                  placeholder="Enter board name"
                  menuPlacement="auto"
                />
              </div>
            </div>
          </div>

          {/* Add more work — static row */}
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, color: token('color.link'), fontSize: 14 }}
            onClick={() => {/* ponytail: multi-source work not in backend yet */}}
          >
            + Add more work
          </button>
        </Stack>

        <div style={{ flex: 1 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 24 }}>
          <Button
            appearance="primary"
            isDisabled={!canCreate}
            isLoading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </div>
      </div>

      {/* Right panel — live preview */}
      <div style={{
        flex: 1,
        background: token('color.background.neutral.subtle'),
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 48px',
      }}>
        <PlanPreview name={name} boards={selectedBoards} />
      </div>
    </div>
  );
}

function PlanPreview({ name, boards }: { name: string; boards: BoardOption[] }) {
  return (
    <div style={{
      width: '100%',
      maxWidth: 700,
      background: token('elevation.surface'),
      borderRadius: 8,
      border: `1px solid ${token('color.border')}`,
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(9,30,66,0.25)',
    }}>
      {/* Plan header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${token('color.border')}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ color: token('color.icon.brand') }}>
            <BoardsIcon label="" size="small" />
          </div>
          <Text weight="bold" color="color.text">{name || '——————————'}</Text>
          {boards.length > 0 && (
            <Text size="small" color="color.text.subtle">· {boards.length * 3} work items</Text>
          )}
        </div>
        {/* Preview tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {['Summary', 'Timeline', 'Program', 'Calendar', 'Teams', 'Dependencies'].map((t, i) => (
            <div key={t} style={{
              padding: '6px 12px', fontSize: 13,
              color: i === 1 ? token('color.text') : token('color.text.subtle'),
              borderBottom: i === 1 ? `2px solid ${token('color.border.brand')}` : '2px solid transparent',
              fontWeight: i === 1 ? 500 : 400,
            }}>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline preview rows */}
      <div style={{ padding: '16px 20px' }}>
        {boards.length === 0 ? (
          <PreviewSkeletonRows count={6} />
        ) : (
          boards.map(board => (
            <div key={board.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 8 }}>
                <div style={{ width: 16, height: 16, borderRadius: 3, background: token('color.background.brand.bold'), flexShrink: 0 }} />
                <Text size="small" weight="semibold" color="color.text">{board.label}</Text>
              </div>
              <PreviewSkeletonRows count={3} indent />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewSkeletonRows({ count, indent }: { count: number; indent?: boolean }) {
  const COLORS = [
    token('color.background.success.bold'),
    token('color.background.brand.bold'),
    '#a855f7',
    token('color.background.warning.bold'),
  ];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingLeft: indent ? 20 : 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: token('color.background.neutral.hovered'), flexShrink: 0 }} />
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: token('color.background.neutral.hovered') }} />
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: token('color.background.neutral.pressed'), flexShrink: 0 }} />
          <div style={{
            width: `${50 + (i * 23) % 80}px`, height: 10, borderRadius: 4,
            background: COLORS[i % COLORS.length], flexShrink: 0,
          }} />
        </div>
      ))}
    </>
  );
}
