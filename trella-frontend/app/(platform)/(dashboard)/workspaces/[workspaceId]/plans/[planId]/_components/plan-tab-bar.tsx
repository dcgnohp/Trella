'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { token } from '@atlaskit/tokens';
import { Inline, Text } from '@atlaskit/primitives';
import BoardsIcon from '@atlaskit/icon/core/boards';
import ShareIcon from '@atlaskit/icon/core/share';
import CommentIcon from '@atlaskit/icon/core/comment';
import MoreIcon from '@atlaskit/icon/core/show-more-horizontal';
import { Save, RotateCcw, AlertTriangle, X } from 'lucide-react';
import {
  PlansService,
  SprintsService,
  CustomStatusesService,
  OrganizationsService,
  type PlanStatus,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { usePlanStaging } from '../_hooks/use-plan-staging';

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
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const planQuery = useQuery({
    queryKey: queryKeys.plan(planId),
    queryFn: () => PlansService.Plans_plansGetPlan({ planId }),
  });
  const planName = planQuery.data?.name ?? '…';
  const planStatus = (planQuery.data?.status ?? 'PLANNING') as PlanStatus;

  // Plan lifecycle status
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const updateStatusMutation = useMutation({
    mutationFn: (status: PlanStatus) =>
      PlansService.Plans_plansUpdatePlan({ planId, requestBody: { status } }),
    onSuccess: () => {
      toast.success('Plan status updated');
      queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans(workspaceId) });
    },
    onError: () => toast.error('Failed to update plan status'),
  });

  const orgsQuery = useQuery({
    queryKey: ['organizations-list'],
    queryFn: () => OrganizationsService.Organizations_organizationsListOrganizations(),
  });
  const workspaceName = useMemo(() => {
    if (!mounted) return 'Workspace';
    const org = orgsQuery.data?.find(o => o.id === workspaceId);
    return org?.name ?? 'Workspace';
  }, [orgsQuery.data, workspaceId, mounted]);

  // Staging store
  const { stagedCount, changes, saveAll, discardAll, isSaving } = usePlanStaging();
  const [pendingNavSegment, setPendingNavSegment] = useState<string | null>(null);

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

  const handleTabClick = (e: React.MouseEvent, segment: string) => {
    // If there are unsaved staged changes, intercept navigation and prompt modal
    if (stagedCount > 0 && !pathname.includes(`/${segment}`)) {
      e.preventDefault();
      setPendingNavSegment(segment);
    }
  };

  const handleConfirmSaveAndSwitch = async () => {
    if (pendingNavSegment) {
      const targetSegment = pendingNavSegment;
      await saveAll();
      setPendingNavSegment(null);
      router.push(`/workspaces/${workspaceId}/plans/${planId}/${targetSegment}`);
    }
  };

  const handleConfirmDiscardAndSwitch = () => {
    if (pendingNavSegment) {
      const targetSegment = pendingNavSegment;
      discardAll();
      setPendingNavSegment(null);
      router.push(`/workspaces/${workspaceId}/plans/${planId}/${targetSegment}`);
    }
  };

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
      <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: token('color.text.subtle') }}>
        <Link href={`/workspaces/${workspaceId}/boards`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
            {workspaceName}
          </span>
        </Link>
        <span>/</span>
        <Link href={`/workspaces/${workspaceId}/plans`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
            Plans
          </span>
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
          {/* Plan lifecycle status */}
          <PlanStatusControl
            status={planStatus}
            isOpen={isStatusOpen}
            setIsOpen={setIsStatusOpen}
            onChange={(next) => {
              setIsStatusOpen(false);
              if (next !== planStatus) updateStatusMutation.mutate(next);
            }}
          />
          {/* "..." menu */}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: token('color.icon'), borderRadius: 3, flexShrink: 0 }} aria-label="More options">
            <MoreIcon label="More options" size="small" />
          </button>
        </div>

        {/* Right action buttons (Blue unsaved button removed as requested, using yellow inline banner + nav guard modal) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <IconButton label="Share" icon={<ShareIcon label="Share" size="small" />} />
          <IconButton label="Comment" icon={<CommentIcon label="Comment" size="small" />} />
        </div>
      </div>

      {/* Tab bar + "+" */}
      <div style={{ display: 'flex', alignItems: 'center', paddingInline: 16, marginTop: 2 }}>
        {visibleTabs.map(tab => {
          const active = pathname.includes(`/${tab.segment}`);
          const isRemovable = tab.segment !== 'summary' && tab.segment !== 'timeline';
          return (
            <TabItem
              key={tab.label}
              tab={tab}
              active={active}
              workspaceId={workspaceId}
              planId={planId}
              isRemovable={isRemovable}
              onClickTab={(e) => handleTabClick(e, tab.segment)}
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

      {/* Tab Navigation Safeguard Modal when switching tabs with unsaved changes */}
      {pendingNavSegment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPendingNavSegment(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--trella-surface-overlay, #FFFFFF)',
              borderRadius: 12,
              border: '1px solid var(--trella-border, #E2E8F0)',
              boxShadow: 'var(--trella-shadow-overlay, 0 20px 40px rgba(0,0,0,0.15))',
              width: 460,
              maxWidth: '100%',
              padding: 24,
              animation: 'fadeScaleIn 160ms ease-out forwards',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={20} color="var(--trella-warning, #D97706)" />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--trella-text, #1E293B)', margin: 0 }}>Unsaved changes in plan</h3>
              </div>
              <button onClick={() => setPendingNavSegment(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--trella-text-subtle, #64748B)' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--trella-text-subtle, #475569)', margin: '0 0 16px', lineHeight: 1.5 }}>
              You have <strong>{stagedCount} unsaved staged change{stagedCount > 1 ? 's' : ''}</strong> in this plan. How would you like to proceed before switching tabs?
            </p>

            {/* List of staged changes */}
            <div style={{ backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 120, overflowY: 'auto', fontSize: 12 }}>
              {changes.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i === changes.length - 1 ? 'none' : '1px solid var(--trella-border-subtle, #F1F5F9)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--trella-text, #1E293B)' }}>{c.issueKey || c.title}</span>
                  <span style={{ color: 'var(--trella-brand, #2563EB)', fontWeight: 500 }}>
                    {c.fields.startDate && `Start: ${c.fields.startDate}`} {c.fields.dueDate && `Due: ${c.fields.dueDate}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPendingNavSegment(null)}
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--trella-text-subtle, #64748B)',
                  backgroundColor: 'var(--trella-surface-hover, #F1F5F9)',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmDiscardAndSwitch}
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#DC2626',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RotateCcw size={13} /> Discard & Switch
              </button>

              <button
                onClick={handleConfirmSaveAndSwitch}
                disabled={isSaving}
                style={{
                  padding: '7px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  backgroundColor: '#2563EB',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
                }}
              >
                <Save size={13} /> {isSaving ? 'Saving...' : 'Save & Switch'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function TabItem({
  tab,
  active,
  workspaceId,
  planId,
  isRemovable,
  onClickTab,
  onRemove,
}: {
  tab: typeof TABS[0];
  active: boolean;
  workspaceId: string;
  planId: string;
  isRemovable: boolean;
  onClickTab: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Link
      href={`/workspaces/${workspaceId}/plans/${planId}/${tab.segment}`}
      onClick={onClickTab}
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

// Plan lifecycle stages
const PLAN_STATUSES: { value: PlanStatus; bg: string; color: string }[] = [
  { value: 'PLANNING', bg: '#EFF6FF', color: '#2563EB' },
  { value: 'ACTIVE', bg: '#F3E8FF', color: '#7C3AED' },
  { value: 'IN PROGRESS', bg: '#FEF3C7', color: '#D97706' },
  { value: 'ON HOLD', bg: '#F1F5F9', color: '#64748B' },
  { value: 'COMPLETED', bg: '#DCFCE7', color: '#15803D' },
];

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const cfg = PLAN_STATUSES.find(s => s.value === status) ?? PLAN_STATUSES[0];
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700,
      backgroundColor: cfg.bg, color: cfg.color,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function PlanStatusControl({
  status,
  isOpen,
  setIsOpen,
  onChange,
}: {
  status: PlanStatus;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onChange: (next: PlanStatus) => void;
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Change plan status"
        aria-label="Change plan status"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <PlanStatusBadge status={status} />
        <span style={{ fontSize: 10, color: token('color.text.subtle') }}>▾</span>
      </button>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setIsOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
            background: token('elevation.surface.overlay'),
            border: `1px solid ${token('color.border')}`,
            borderRadius: 6, boxShadow: '0 8px 20px rgba(9,30,66,0.15)',
            padding: '6px 0', minWidth: 160,
          }}>
            <div style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, color: token('color.text.subtlest'), textTransform: 'uppercase' }}>
              Change status
            </div>
            {PLAN_STATUSES.map(({ value }) => (
              <button
                key={value}
                onClick={() => onChange(value)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
                  background: value === status ? token('color.background.neutral.hovered') : 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = token('color.background.neutral.hovered'))}
                onMouseLeave={e => (e.currentTarget.style.background = value === status ? token('color.background.neutral.hovered') : 'none')}
              >
                <PlanStatusBadge status={value} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
