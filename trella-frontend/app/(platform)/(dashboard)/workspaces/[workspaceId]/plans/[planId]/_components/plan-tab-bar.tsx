'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { token } from '@atlaskit/tokens';
import { Inline, Text } from '@atlaskit/primitives';
import BoardsIcon from '@atlaskit/icon/core/boards';
import ShareIcon from '@atlaskit/icon/core/share';
import CommentIcon from '@atlaskit/icon/core/comment';
import MoreIcon from '@atlaskit/icon/core/show-more-horizontal';
import {
  PlansService,
  SprintsService,
  CustomStatusesService,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { usePlanStaging } from '../_hooks/use-plan-staging';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';

const TABS = [
  { label: 'Summary', segment: 'summary' },
  { label: 'Timeline', segment: 'timeline' },
  { label: 'Program', segment: 'program' },
  { label: 'Calendar', segment: 'calendar' },
  { label: 'Teams', segment: 'teams' },
  { label: 'Releases', segment: 'releases' },
  { label: 'Dependencies', segment: 'dependencies' },
  { label: 'Members', segment: 'members' },
];

interface PlanTabBarProps {
  planId: string;
  workspaceId: string;
}

export function PlanTabBar({ planId, workspaceId }: PlanTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const planQuery = useQuery({
    queryKey: queryKeys.plan(planId),
    queryFn: () => PlansService.Plans_plansGetPlan({ planId }),
  });
  const planName = planQuery.data?.name ?? '…';

  // Staging store — drives the "Unsaved changes N" button + review dialog.
  const { stagedCount } = usePlanStaging();
  const [isUnsavedOpen, setIsUnsavedOpen] = useState(false);

  // Name maps for the review dialog (id → human label).
  const sprintsQuery = useQuery({
    queryKey: ['workspace-sprints', workspaceId],
    queryFn: () => SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
  });
  const sprintNameById = useMemo(() => {
    const m: Record<string, string> = {};
    (sprintsQuery.data ?? []).forEach(s => { m[s.id] = s.name; });
    return m;
  }, [sprintsQuery.data]);

  const statusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });
  const statusNameById = useMemo(() => {
    const m: Record<string, string> = {};
    (statusesQuery.data ?? []).forEach(s => { m[s.id] = s.name; });
    return m;
  }, [statusesQuery.data]);

  const [visibleSegments, setVisibleSegments] = useState<string[]>(TABS.map(t => t.segment));
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // Load visible tabs on mount
  useEffect(() => {
    const saved = localStorage.getItem(`plan_tabs_${planId}`);
    if (saved) {
      try {
        setVisibleSegments(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse visible tabs from localStorage', e);
      }
    }
  }, [planId]);

  const handleRemoveTab = (e: React.MouseEvent, segment: string) => {
    e.preventDefault();
    e.stopPropagation();
    const nextVisible = visibleSegments.filter(s => s !== segment);
    setVisibleSegments(nextVisible);
    localStorage.setItem(`plan_tabs_${planId}`, JSON.stringify(nextVisible));

    if (pathname.includes(`/${segment}`)) {
      router.push(`/workspaces/${workspaceId}/plans/${planId}/summary`);
    }
  };

  const handleAddTab = (segment: string) => {
    const nextVisible = [...visibleSegments, segment];
    setVisibleSegments(nextVisible);
    localStorage.setItem(`plan_tabs_${planId}`, JSON.stringify(nextVisible));
    setIsAddMenuOpen(false);
  };

  const visibleTabs = TABS.filter(tab => visibleSegments.includes(tab.segment));
  const hiddenTabs = TABS.filter(tab => !visibleSegments.includes(tab.segment));

  return (
    <div style={{
      backgroundColor: token('elevation.surface'),
      borderBottom: `1px solid ${token('color.border')}`,
      flexShrink: 0,
    }}>
      {/* Breadcrumb */}
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Link href={`/workspaces/${workspaceId}/plans`} style={{ textDecoration: 'none' }}>
          <Text size="small" color="color.text.subtle">Plans</Text>
        </Link>
      </div>

      {/* Plan title row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '4px 24px 0',
        gap: 8,
      }}>
        {/* Icon + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ color: token('color.icon.brand'), flexShrink: 0 }}>
            <BoardsIcon label="" size="small" />
          </div>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: token('color.text'),
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {planName}
          </span>
          {/* "..." menu */}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: token('color.icon'), borderRadius: 3, flexShrink: 0 }} aria-label="More options">
            <MoreIcon label="More options" size="small" />
          </button>
        </div>

        {/* Right action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <IconButton label="Share" icon={<ShareIcon label="Share" size="small" />} />
          <IconButton label="Comment" icon={<CommentIcon label="Comment" size="small" />} />
          {stagedCount > 0 && (
            <button
              onClick={() => setIsUnsavedOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: token('color.background.brand.bold'),
                color: token('color.text.inverse'),
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Unsaved changes
              <span style={{
                background: token('color.background.warning.bold'),
                color: token('color.text.inverse'),
                borderRadius: 3,
                padding: '0 6px',
                fontSize: 12,
                fontWeight: 700,
              }}>
                {stagedCount}
              </span>
            </button>
          )}
        </div>
      </div>

      <UnsavedChangesDialog
        isOpen={isUnsavedOpen}
        onClose={() => setIsUnsavedOpen(false)}
        sprintNameById={sprintNameById}
        statusNameById={statusNameById}
      />

      {/* Tab bar + "+" */}
      <div style={{ display: 'flex', alignItems: 'center', paddingInline: 16, marginTop: 2 }}>
        {visibleTabs.map(tab => {
          const active = pathname.includes(`/${tab.segment}`);
          // Allow removing any tab except Summary and Timeline
          const isRemovable = tab.segment !== 'summary' && tab.segment !== 'timeline';
          return (
            <TabItem
              key={tab.label}
              tab={tab}
              active={active}
              workspaceId={workspaceId}
              planId={planId}
              isRemovable={isRemovable}
              onRemove={(e) => handleRemoveTab(e, tab.segment)}
            />
          );
        })}

        {/* + tab dropdown */}
        {hiddenTabs.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsAddMenuOpen(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 10px',
                color: token('color.text.subtle'),
                fontSize: 16,
                lineHeight: 1,
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Add tab"
            >
              +
            </button>
            {isAddMenuOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 100,
                background: token('elevation.surface.overlay'),
                border: `1px solid ${token('color.border')}`,
                borderRadius: 4,
                boxShadow: '0 4px 12px rgba(9,30,66,0.15)',
                padding: '4px 0',
                minWidth: 140,
              }}>
                {hiddenTabs.map(t => (
                  <button
                    key={t.segment}
                    onClick={() => handleAddTab(t.segment)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px 12px',
                      fontSize: 13,
                      color: token('color.text'),
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = token('color.background.neutral.hovered'))}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabItem({
  tab,
  active,
  workspaceId,
  planId,
  isRemovable,
  onRemove,
}: {
  tab: typeof TABS[0];
  active: boolean;
  workspaceId: string;
  planId: string;
  isRemovable: boolean;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Link
      href={`/workspaces/${workspaceId}/plans/${planId}/${tab.segment}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: active ? 500 : 400,
          color: active ? token('color.text') : token('color.text.subtle'),
          borderBottom: active ? `2px solid ${token('color.border.brand')}` : '2px solid transparent',
          marginBottom: -1,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          position: 'relative',
          height: 36,
        }}
      >
        <span>{tab.label}</span>
        {isRemovable && isHovered && (
          <button
            onClick={onRemove}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 10,
              color: token('color.text.danger'),
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              width: 14,
              height: 14,
            }}
            title="Remove tab"
            aria-label={`Remove ${tab.label} tab`}
          >
            ✕
          </button>
        )}
      </div>
    </Link>
  );
}

function IconButton({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      style={{
        background: 'none',
        border: `1px solid ${token('color.border')}`,
        borderRadius: 4,
        cursor: 'pointer',
        padding: '4px 8px',
        color: token('color.icon'),
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon}
    </button>
  );
}
