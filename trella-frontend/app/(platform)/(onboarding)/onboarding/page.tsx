import { Suspense } from 'react';
import { OnboardingWizard } from './_components/onboarding-wizard';

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingWizard />
    </Suspense>
  );
}
