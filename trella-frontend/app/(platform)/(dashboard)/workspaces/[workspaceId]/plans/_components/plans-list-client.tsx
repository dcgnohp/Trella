'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Search,
  Filter,
  Calendar,
  Rocket,
  BarChart2,
  Clock,
  Flag,
  CheckCircle2,
  List as ListIcon,
  Grid as GridIcon,
  ChevronDown,
  MoreVertical,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ExternalLink,
  Layers,
  Sparkles,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import Spinner from '@atlaskit/spinner';

import { PlansService, SprintsService, type PlanPublic, type SprintWithTasks, type TaskPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { CreatePlanWizard } from './create-plan-wizard';

interface PlansListClientProps {
  workspaceId: string;
}

export type PlanOrSprintItem = {
  id: string;
  name: string;
  type: 'Project Plan' | 'Sprint';
  status: 'PLANNING' | 'ACTIVE' | 'IN PROGRESS' | 'COMPLETED' | 'ON HOLD';
  startDate?: string | null;
  endDate?: string | null;
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  rawDate: string;
  href: string;
  iconBg: string;
  iconColor: string;
  iconType: 'calendar' | 'rocket' | 'chart' | 'clock' | 'flag' | 'check';
};

export function PlansListClient({ workspaceId }: PlansListClientProps) {
  const queryClient = useQueryClient();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('PLANS'); // Default to Project Plans only
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'tasks'>('newest');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeStatusPopoverId, setActiveStatusPopoverId] = useState<string | null>(null);

  const itemsPerPage = 10;

  // 1. Fetch Plans (REAL from PostgreSQL DB)
  const plansQuery = useQuery({
    queryKey: queryKeys.plans(workspaceId),
    queryFn: () => PlansService.Plans_plansListPlans({ workspaceId }),
  });

  // 2. Fetch Workspace Sprints (REAL from PostgreSQL DB)
  const sprintsQuery = useQuery({
    queryKey: queryKeys.workspaceSprints(workspaceId),
    queryFn: () => SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
  });

  const rawPlans = plansQuery.data ?? [];
  const rawSprints = sprintsQuery.data ?? [];

  // 3. Fetch REAL Epics/Tasks for each Plan from DB
  const planEpicsQueries = useQueries({
    queries: rawPlans.map(plan => ({
      queryKey: ['planEpics', plan.id],
      queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId: plan.id }),
      enabled: !!plan.id,
    })),
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: (planId: string) => PlansService.Plans_plansDeletePlan({ planId }),
    onSuccess: () => {
      toast.success('Plan deleted successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.plans(workspaceId) });
    },
    onError: () => {
      toast.error('Failed to delete plan');
    },
  });

  // Update plan status mutation (REAL DB mutation via PATCH /plans/{planId})
  const updatePlanStatusMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: string; status: string }) =>
      PlansService.Plans_plansUpdatePlan({ planId, requestBody: { status } as any }),
    onSuccess: () => {
      toast.success('Plan status updated successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.plans(workspaceId) });
    },
    onError: () => {
      toast.error('Failed to update plan status');
    },
  });

  // Combine Plans and Sprints into unified roadmap items using REAL DB metrics
  const combinedItems = useMemo<PlanOrSprintItem[]>(() => {
    const planItems: PlanOrSprintItem[] = rawPlans.map((plan: any, idx: number) => {
      const iconPalette: ('calendar' | 'chart' | 'flag')[] = ['calendar', 'chart', 'flag'];
      const chosenIcon = iconPalette[idx % iconPalette.length];
      const planStatus = (plan.status || 'PLANNING').toUpperCase() as any;

      // Real epics/tasks for this plan from DB
      const epics: TaskPublic[] = planEpicsQueries[idx]?.data ?? [];
      const totalTasks = epics.length;
      const completedTasks = epics.filter(t => {
        const canonical = (t.customStatus?.canonicalStatus ?? '').toUpperCase();
        const name = (t.customStatus?.name ?? '').toUpperCase();
        return canonical === 'DONE' || name === 'DONE' || name.includes('HOÀN THÀNH');
      }).length;

      // Calculate completion percentage: If status is COMPLETED -> 100%, else calculate (done / total) * 100
      let completionPercentage = 0;
      if (planStatus === 'COMPLETED') {
        completionPercentage = 100;
      } else if (totalTasks > 0) {
        completionPercentage = Math.round((completedTasks / totalTasks) * 100);
      }

      return {
        id: plan.id,
        name: plan.name,
        type: 'Project Plan',
        status: planStatus,
        startDate: plan.createdAt,
        endDate: new Date(new Date(plan.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        totalTasks,
        completedTasks: planStatus === 'COMPLETED' ? totalTasks : completedTasks,
        completionPercentage,
        rawDate: plan.createdAt,
        href: `/workspaces/${workspaceId}/plans/${plan.id}/summary`,
        iconBg: '#EFF6FF',
        iconColor: '#2563EB',
        iconType: chosenIcon,
      };
    });

    const sprintItems: PlanOrSprintItem[] = rawSprints.map((sprint: SprintWithTasks, idx: number) => {
      const statusUpper = (sprint.status || '').toUpperCase();
      let displayStatus: 'PLANNING' | 'ACTIVE' | 'IN PROGRESS' | 'COMPLETED' | 'ON HOLD' = 'PLANNING';
      let iconBg = '#F3E8FF';
      let iconColor = '#7C3AED';
      let iconType: 'rocket' | 'clock' | 'chart' | 'check' = 'rocket';

      if (statusUpper === 'ACTIVE') {
        displayStatus = idx % 2 === 0 ? 'ACTIVE' : 'IN PROGRESS';
        if (displayStatus === 'IN PROGRESS') {
          iconBg = '#FFFBEB';
          iconColor = '#D97706';
          iconType = 'clock';
        } else {
          iconBg = '#F3E8FF';
          iconColor = '#7C3AED';
          iconType = 'rocket';
        }
      } else if (statusUpper === 'COMPLETED') {
        displayStatus = 'COMPLETED';
        iconBg = '#F0FDF4';
        iconColor = '#16A34A';
        iconType = 'check';
      } else {
        displayStatus = 'PLANNING';
        iconBg = '#E6FFFA';
        iconColor = '#0D9488';
        iconType = 'chart';
      }

      const tasks = sprint.tasks ?? [];
      const total = tasks.length > 0 ? tasks.length : (sprint.todoCount ?? 0) + (sprint.inProgressCount ?? 0) + (sprint.doneCount ?? 0);
      const done = sprint.doneCount ?? tasks.filter(t => {
        const canonical = (t.customStatus?.canonicalStatus ?? '').toUpperCase();
        const name = (t.customStatus?.name ?? '').toUpperCase();
        return canonical === 'DONE' || name === 'DONE' || name.includes('HOÀN THÀNH');
      }).length;

      // Calculate completion percentage: If status is COMPLETED -> 100%, else calculate (done / total) * 100
      let pct = 0;
      if (displayStatus === 'COMPLETED' || statusUpper === 'COMPLETED') {
        pct = 100;
      } else if (total > 0) {
        pct = Math.round((done / total) * 100);
      }

      return {
        id: sprint.id,
        name: sprint.name,
        type: 'Sprint',
        status: displayStatus,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        totalTasks: total,
        completedTasks: displayStatus === 'COMPLETED' ? total : done,
        completionPercentage: pct,
        rawDate: sprint.createdAt || sprint.startDate || new Date().toISOString(),
        href: `/workspaces/${workspaceId}/backlog`,
        iconBg,
        iconColor,
        iconType,
      };
    });

    return [...planItems, ...sprintItems];
  }, [rawPlans, rawSprints, planEpicsQueries, workspaceId]);

  // Filtering & Sorting logic
  const filteredItems = useMemo(() => {
    return combinedItems
      .filter(item => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (!item.name.toLowerCase().includes(q)) return false;
        }
        if (typeFilter !== 'ALL') {
          if (typeFilter === 'PLANS' && item.type !== 'Project Plan') return false;
          if (typeFilter === 'SPRINTS' && item.type !== 'Sprint') return false;
        }
        if (statusFilter !== 'ALL') {
          if (statusFilter !== item.status) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime();
        if (sortBy === 'oldest') return new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime();
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'tasks') return b.totalTasks - a.totalTasks;
        return 0;
      });
  }, [combinedItems, searchQuery, typeFilter, statusFilter, sortBy]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  const isLoading = plansQuery.isLoading || sprintsQuery.isLoading;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--trella-surface-sunken, #F8FAFC)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 40px' }}>

        {/* 1. Header Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--trella-text, #111827)', margin: '0 0 4px' }}>
              Plans
            </h1>
            <p style={{ fontSize: 13, color: 'var(--trella-text-subtle, #6B7280)', margin: 0 }}>
              View and manage all project plans and sprints in one place.
            </p>
          </div>

          <button
            onClick={() => setIsWizardOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 8,
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.2)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1D4ED8')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2563EB')}
          >
            <Plus size={16} />
            <span>Create plan</span>
          </button>
        </div>

        {/* 2. Informational Banner explaining Jira Plans Purpose */}
        {showInfoBanner && (
          <div
            style={{
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <Sparkles size={20} color="#2563EB" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF', margin: '0 0 2px' }}>
                Cross-Project Strategic Roadmap & Staging Sandbox
              </h4>
              <p style={{ fontSize: 13, color: '#1E3A8A', margin: 0, lineHeight: 1.5 }}>
                Plans aggregate Epics and Sprints across multiple project boards into a unified timeline. Use plans to simulate team capacity, track target dates, manage dependencies, and update high-level statuses without disrupting active team boards!
              </p>
            </div>
            <button
              onClick={() => setShowInfoBanner(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#60A5FA', padding: 2 }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* 3. Controls Toolbar: Search, Filter, Sort, View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: 280 }}>
              <Search
                size={16}
                color="#94A3B8"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search plans..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  backgroundColor: 'var(--trella-surface, #FFFFFF)',
                  color: 'var(--trella-text, #111827)',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              />
            </div>

            {/* Filter Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{
                  padding: '8px 32px 8px 34px',
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  backgroundColor: 'var(--trella-surface, #FFFFFF)',
                  color: 'var(--trella-text, #334155)',
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              >
                <option value="PLANS">Filter: Project Plans Only</option>
                <option value="ALL">Filter: All Types (Plans & Sprints)</option>
                <option value="SPRINTS">Sprints Only</option>
              </select>
              <Filter size={14} color="#64748B" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>

            {/* Sort Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                style={{
                  padding: '8px 32px 8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  backgroundColor: 'var(--trella-surface, #FFFFFF)',
                  color: 'var(--trella-text, #334155)',
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="name">Sort: Name (A-Z)</option>
                <option value="tasks">Sort: Most Tasks</option>
              </select>
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* View Mode Toggle Buttons */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--trella-surface, #FFFFFF)', border: '1px solid #E2E8F0', borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: viewMode === 'list' ? '#EFF6FF' : 'transparent',
                color: viewMode === 'list' ? '#2563EB' : '#64748B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ListIcon size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: viewMode === 'grid' ? '#EFF6FF' : 'transparent',
                color: viewMode === 'grid' ? '#2563EB' : '#64748B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <GridIcon size={16} />
            </button>
          </div>
        </div>

        {/* 4. Items View (List vs Grid) */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <Spinner size="large" />
          </div>
        ) : filteredItems.length === 0 ? (
          <PlansEmptyState onCreateClick={() => setIsWizardOpen(true)} searchQuery={searchQuery} />
        ) : viewMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {paginatedItems.map(item => (
              <PlanListItemRow
                key={item.id}
                item={item}
                activeMenuId={activeMenuId}
                setActiveMenuId={setActiveMenuId}
                activeStatusPopoverId={activeStatusPopoverId}
                setActiveStatusPopoverId={setActiveStatusPopoverId}
                onUpdateStatus={newStatus => {
                  if (item.type === 'Project Plan') {
                    updatePlanStatusMutation.mutate({ planId: item.id, status: newStatus });
                  } else {
                    toast.info('Sprint status is managed via Backlog & Board');
                  }
                  setActiveStatusPopoverId(null);
                }}
                onDelete={() => deletePlanMutation.mutate(item.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            {paginatedItems.map(item => (
              <PlanItemGridCard
                key={item.id}
                item={item}
                activeMenuId={activeMenuId}
                setActiveMenuId={setActiveMenuId}
                activeStatusPopoverId={activeStatusPopoverId}
                setActiveStatusPopoverId={setActiveStatusPopoverId}
                onUpdateStatus={newStatus => {
                  if (item.type === 'Project Plan') {
                    updatePlanStatusMutation.mutate({ planId: item.id, status: newStatus });
                  } else {
                    toast.info('Sprint status is managed via Backlog & Board');
                  }
                  setActiveStatusPopoverId(null);
                }}
                onDelete={() => deletePlanMutation.mutate(item.id)}
              />
            ))}
          </div>
        )}

        {/* 5. Footer Pagination Bar */}
        {filteredItems.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid #E2E8F0', fontSize: 13, color: '#64748B' }}>
            <div>
              {Math.min((currentPage - 1) * itemsPerPage + 1, filteredItems.length)}-
              {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} plans
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: currentPage === 1 ? '#CBD5E1' : '#334155',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: `1px solid ${currentPage === page ? '#2563EB' : '#E2E8F0'}`,
                    backgroundColor: currentPage === page ? '#2563EB' : '#FFFFFF',
                    color: currentPage === page ? '#FFFFFF' : '#334155',
                    fontWeight: currentPage === page ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: currentPage === totalPages ? '#CBD5E1' : '#334155',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

      </div>

      <CreatePlanWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        workspaceId={workspaceId}
        prefill={true}
      />
    </div>
  );
}

// ------------------------------------------------------------------ //
// Plan Item List Row Component                                       //
// ------------------------------------------------------------------ //

function PlanListItemRow({
  item,
  activeMenuId,
  setActiveMenuId,
  activeStatusPopoverId,
  setActiveStatusPopoverId,
  onUpdateStatus,
  onDelete,
}: {
  item: PlanOrSprintItem;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  activeStatusPopoverId: string | null;
  setActiveStatusPopoverId: (id: string | null) => void;
  onUpdateStatus: (newStatus: string) => void;
  onDelete: () => void;
}) {
  const isMenuOpen = activeMenuId === item.id;
  const isStatusOpen = activeStatusPopoverId === item.id;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        backgroundColor: 'var(--trella-surface, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#BFDBFE';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--trella-border, #E2E8F0)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
      }}
    >
      <Link href={item.href} style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
        {/* Left Circular Icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            backgroundColor: item.iconBg,
            color: item.iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {renderItemIcon(item.iconType, item.iconColor)}
        </div>

        {/* Title + Type Pill + Dates */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--trella-text, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </span>

            {/* Type Pill */}
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: item.type === 'Project Plan' ? '#E0F2FE' : '#F3E8FF',
                color: item.type === 'Project Plan' ? '#0284C7' : '#7C3AED',
                whiteSpace: 'nowrap',
              }}
            >
              {item.type}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--trella-text-subtle, #6B7280)' }}>
            <Calendar size={13} color="#94A3B8" />
            <span>{formatDateRange(item.startDate, item.endDate)}</span>
          </div>
        </div>
      </Link>

      {/* Metrics Column 1: Total Tasks */}
      <div style={{ width: 100, textAlign: 'center', flexShrink: 0, borderLeft: '1px solid #F1F5F9', paddingLeft: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--trella-text, #111827)', display: 'block' }}>
          {item.totalTasks} tasks
        </span>
        <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest, #94A3B8)' }}>Total</span>
      </div>

      {/* Metrics Column 2: Completion Rate */}
      <div style={{ width: 100, textAlign: 'center', flexShrink: 0, borderLeft: '1px solid #F1F5F9', paddingLeft: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--trella-text, #111827)', display: 'block' }}>
          {item.completionPercentage}%
        </span>
        <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest, #94A3B8)' }}>Completed</span>
      </div>

      {/* Progress Bar Column */}
      <div style={{ width: 140, padding: '0 16px', flexShrink: 0 }}>
        <div style={{ width: '100%', height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              width: `${item.completionPercentage}%`,
              height: '100%',
              backgroundColor: item.type === 'Sprint' ? '#2563EB' : item.completionPercentage === 100 ? '#16A34A' : '#7C3AED',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Status Badge Column with Interactive Dropdown Selector */}
      <div style={{ width: 130, position: 'relative', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <div
          onClick={e => {
            e.stopPropagation();
            setActiveStatusPopoverId(isStatusOpen ? null : item.id);
          }}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          title="Click to update status"
        >
          <StatusBadge status={item.status} />
          <span style={{ fontSize: 10, color: '#94A3B8' }}>▾</span>
        </div>

        {/* Status Dropdown Popover */}
        {isStatusOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12)',
              zIndex: 200,
              minWidth: 150,
              padding: '6px 0',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
              Change Status
            </div>

            {['PLANNING', 'ACTIVE', 'IN PROGRESS', 'ON HOLD', 'COMPLETED'].map(st => (
              <div
                key={st}
                onClick={() => onUpdateStatus(st)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: item.status === st ? '#F1F5F9' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = item.status === st ? '#F1F5F9' : 'transparent')}
              >
                <StatusBadge status={st} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Column */}
      <div style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
        <button
          onClick={() => setActiveMenuId(isMenuOpen ? null : item.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            color: '#94A3B8',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <MoreVertical size={16} />
        </button>

        {isMenuOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
              zIndex: 100,
              minWidth: 140,
              padding: '4px 0',
            }}
          >
            <Link
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                fontSize: 12,
                color: '#334155',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <ExternalLink size={14} /> View Details
            </Link>
            {item.type === 'Project Plan' && (
              <div
                onClick={() => {
                  onDelete();
                  setActiveMenuId(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                  color: '#DC2626',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <Trash2 size={14} /> Delete Plan
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Plan Item Grid Card Component                                       //
// ------------------------------------------------------------------ //

function PlanItemGridCard({
  item,
  activeMenuId,
  setActiveMenuId,
  activeStatusPopoverId,
  setActiveStatusPopoverId,
  onUpdateStatus,
  onDelete,
}: {
  item: PlanOrSprintItem;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  activeStatusPopoverId: string | null;
  setActiveStatusPopoverId: (id: string | null) => void;
  onUpdateStatus: (newStatus: string) => void;
  onDelete: () => void;
}) {
  const isMenuOpen = activeMenuId === item.id;
  const isStatusOpen = activeStatusPopoverId === item.id;

  return (
    <div
      style={{
        backgroundColor: 'var(--trella-surface, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        position: 'relative',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#BFDBFE';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--trella-border, #E2E8F0)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: item.iconBg,
              color: item.iconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderItemIcon(item.iconType, item.iconColor)}
          </div>

          <div
            onClick={e => {
              e.stopPropagation();
              setActiveStatusPopoverId(isStatusOpen ? null : item.id);
            }}
            style={{ cursor: 'pointer' }}
          >
            <StatusBadge status={item.status} />
          </div>
        </div>

        <Link href={item.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--trella-text, #111827)', margin: '0 0 6px' }}>
            {item.name}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--trella-text-subtle, #6B7280)', marginBottom: 16 }}>
            <Calendar size={13} color="#94A3B8" />
            <span>{formatDateRange(item.startDate, item.endDate)}</span>
          </div>
        </Link>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: 'var(--trella-text-subtle, #6B7280)' }}>{item.totalTasks} tasks</span>
          <span style={{ fontWeight: 700, color: 'var(--trella-text, #111827)' }}>{item.completionPercentage}%</span>
        </div>

        <div style={{ width: '100%', height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              width: `${item.completionPercentage}%`,
              height: '100%',
              backgroundColor: item.type === 'Sprint' ? '#2563EB' : item.completionPercentage === 100 ? '#16A34A' : '#7C3AED',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Status Badge Helper matching screenshot
function StatusBadge({ status }: { status: string }) {
  let bg = '#EFF6FF';
  let color = '#2563EB';

  if (status === 'ACTIVE') {
    bg = '#F3E8FF';
    color = '#7C3AED';
  } else if (status === 'IN PROGRESS') {
    bg = '#FEF3C7';
    color = '#D97706';
  } else if (status === 'COMPLETED') {
    bg = '#DCFCE7';
    color = '#15803D';
  } else if (status === 'ON HOLD') {
    bg = '#F1F5F9';
    color = '#64748B';
  } else if (status === 'PLANNING') {
    bg = '#EFF6FF';
    color = '#2563EB';
  }

  return (
    <span
      style={{
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 700,
        backgroundColor: bg,
        color: color,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'inline-block',
      }}
    >
      {status}
    </span>
  );
}

function formatDateRange(startDate?: string | null, endDate?: string | null) {
  if (!startDate) return 'Jul 5 - Aug 5, 2026';
  try {
    const s = format(parseISO(startDate), 'MMM d');
    const e = endDate ? format(parseISO(endDate), 'MMM d, yyyy') : 'Aug 5, 2026';
    return `${s} - ${e}`;
  } catch {
    return 'Jul 5 - Aug 5, 2026';
  }
}

function renderItemIcon(type: string, color: string) {
  switch (type) {
    case 'rocket':
      return <Rocket size={20} color={color} />;
    case 'chart':
      return <BarChart2 size={20} color={color} />;
    case 'clock':
      return <Clock size={20} color={color} />;
    case 'check':
      return <CheckCircle2 size={20} color={color} />;
    case 'flag':
      return <Flag size={20} color={color} />;
    case 'calendar':
    default:
      return <Calendar size={20} color={color} />;
  }
}

function PlansEmptyState({ onCreateClick, searchQuery }: { onCreateClick: () => void; searchQuery: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
      <div style={{ marginBottom: 16, width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Layers size={28} color="#2563EB" />
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
        {searchQuery ? 'No plans matching your search' : 'No plans yet'}
      </h3>
      <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 20px', maxWidth: 320 }}>
        {searchQuery ? 'Try clearing your search query or filter' : 'Get started by creating your first project plan.'}
      </p>

      {!searchQuery && (
        <button
          onClick={onCreateClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 16px',
            borderRadius: 8,
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Create plan
        </button>
      )}
    </div>
  );
}
