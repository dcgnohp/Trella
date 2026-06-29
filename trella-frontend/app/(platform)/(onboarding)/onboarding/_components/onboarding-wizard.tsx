'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { StepTemplate } from './step-template';
import { StepName } from './step-name';
import { StepWorkTypes } from './step-work-types';
import { StepStatuses } from './step-statuses';
import { StepInvite } from './step-invite';

export type ProjectType = 'kanban' | 'scrum' | 'project-management';

export interface OnboardingData {
  projectType: ProjectType;
  name: string;
  workTypes: string[];
  statuses: string[];
}

export function OnboardingWizard() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('orgId');

  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    projectType: 'scrum',
    name: '',
    workTypes: ['Task', 'Story'],
    statuses: ['To Do', 'In Progress', 'In Review', 'Done'],
  });

  const update = (partial: Partial<OnboardingData>) =>
    setData(prev => ({ ...prev, ...partial }));

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: step === 0 ? 1320 : 980,
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        overflow: 'hidden',
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
          <StepWorkTypes
            value={data.workTypes}
            projectType={data.projectType}
            onChange={v => update({ workTypes: v })}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepStatuses
            value={data.statuses}
            projectType={data.projectType}
            onChange={v => update({ statuses: v })}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <StepInvite
            data={data}
            orgId={orgId}
            onBack={() => setStep(3)}
          />
        )}
      </div>
    </div>
  );
}
