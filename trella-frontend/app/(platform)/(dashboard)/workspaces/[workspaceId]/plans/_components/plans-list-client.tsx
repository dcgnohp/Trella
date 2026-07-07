'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { token } from '@atlaskit/tokens';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import Button from '@atlaskit/button/new';
import Spinner from '@atlaskit/spinner';
import BoardsIcon from '@atlaskit/icon/core/boards';
import { PlansService, type PlanPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { CreatePlanWizard } from './create-plan-wizard';

interface PlansListClientProps {
  workspaceId: string;
}

export function PlansListClient({ workspaceId }: PlansListClientProps) {
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const plansQuery = useQuery({
    queryKey: queryKeys.plans(workspaceId),
    queryFn: () => PlansService.Plans_plansListPlans({ workspaceId }),
  });

  const plans = plansQuery.data ?? [];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: token('color.background.neutral') }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px' }}>

        {/* Header row — only shown when plans exist */}
        {plans.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <Text size="large" weight="bold" color="color.text">Plans</Text>
            <Button appearance="primary" onClick={() => setIsWizardOpen(true)}>
              Create plan
            </Button>
          </div>
        )}

        {plansQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Spinner size="large" />
          </div>
        ) : plans.length === 0 ? (
          <PlansEmptyState onCreateClick={() => setIsWizardOpen(true)} />
        ) : (
          <Stack space="space.150">
            {plans.map(plan => (
              <PlanCard key={plan.id} plan={plan} workspaceId={workspaceId} />
            ))}
          </Stack>
        )}
      </div>

      <CreatePlanWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function PlansEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
      {/* Illustration */}
      <div style={{ marginBottom: 24, opacity: 0.85 }}>
        <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="20" width="100" height="65" rx="6" fill={token('color.background.neutral.hovered')} />
          <rect x="10" y="20" width="100" height="65" rx="6" stroke={token('color.border')} strokeWidth="1.5" />
          <rect x="22" y="36" width="40" height="6" rx="3" fill={token('color.background.brand.bold')} />
          <rect x="22" y="48" width="60" height="4" rx="2" fill={token('color.background.neutral.pressed')} />
          <rect x="22" y="57" width="48" height="4" rx="2" fill={token('color.background.neutral.pressed')} />
          <rect x="22" y="66" width="55" height="4" rx="2" fill={token('color.background.neutral.pressed')} />
          <circle cx="95" cy="22" r="12" fill={token('color.background.success.bold')} />
          <path d="M89 22l4 4 6-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{ marginBottom: 8 }}>
        <Text size="large" weight="bold" color="color.text">No plans yet</Text>
      </div>
      <div style={{ marginBottom: 8, maxWidth: 320 }}>
        <Text color="color.text.subtle">Get started by making your first plan.</Text>
      </div>
      <div style={{ marginBottom: 24, maxWidth: 360 }}>
        <Text color="color.text.subtle" size="small">
          For tips on making the best plans, check out the{' '}
          <span style={{ color: token('color.link') }}>Get Started with Plans</span> guide.
        </Text>
      </div>

      <Button appearance="primary" onClick={onCreateClick}>
        Create plan
      </Button>
    </div>
  );
}

function PlanCard({ plan, workspaceId }: { plan: PlanPublic; workspaceId: string }) {
  return (
    <Link href={`/workspaces/${workspaceId}/plans/${plan.id}/summary`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: token('color.background.neutral.subtle'),
        border: `1px solid ${token('color.border')}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = token('color.background.neutral.hovered'))}
        onMouseLeave={e => (e.currentTarget.style.background = token('color.background.neutral.subtle'))}
      >
        {/* Plan icon */}
        <div style={{ color: token('color.icon.brand'), flexShrink: 0 }}>
          <BoardsIcon label="" size="small" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Text weight="medium" color="color.text">{plan.name}</Text>
          {plan.description && (
            <div style={{ marginTop: 2 }}>
              <Text size="small" color="color.text.subtle">{plan.description}</Text>
            </div>
          )}
        </div>

        <Text size="small" color="color.text.subtlest">
          {new Date(plan.updatedAt).toLocaleDateString()}
        </Text>
      </div>
    </Link>
  );
}
