'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { StepTemplate } from './step-template';
import { StepName } from './step-name';
import { StepSetup } from './step-setup';
import { StepInvite } from './step-invite';

export type ProjectType = 'kanban' | 'scrum' | 'project-management';

export interface WorkTypeItem {
  key: string;
  name: string;
}

export interface StatusItem {
  name: string;
}

export interface OnboardingData {
  projectType: ProjectType;
  name: string;
  workTypes: WorkTypeItem[];
  statuses: StatusItem[];
  sampleItems?: boolean;
}

export function OnboardingWizard() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('orgId');

  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    projectType: 'scrum',
    name: '',
    workTypes: [
      { key: 'TASK', name: 'Task' },
      { key: 'STORY', name: 'Story' },
      { key: 'FEATURE', name: 'Feature' },
      { key: 'BUG', name: 'Bug' },
    ],
    statuses: [
      { name: 'To Do' },
      { name: 'In Progress' },
      { name: 'In Review' },
      { name: 'Done' },
    ],
    sampleItems: false,
  });

  const update = (partial: Partial<OnboardingData>) =>
    setData(prev => ({ ...prev, ...partial }));

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1a1f2e',
    }}>
      {step === 0 && (
        <StepTemplate
          value={data.projectType}
          onChange={v => update({ projectType: v })}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <StepName
          value={data.name}
          projectType={data.projectType}
          onChange={v => update({ name: v })}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <StepSetup
          data={data}
          onUpdate={update}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepInvite
          data={data}
          orgId={orgId}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}
