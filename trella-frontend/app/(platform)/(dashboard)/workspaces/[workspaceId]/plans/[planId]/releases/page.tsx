import { ComingSoon } from '../_components/coming-soon';

export const metadata = { title: 'Plan Releases' };

export default function PlanReleasesPage() {
  return (
    <ComingSoon
      icon="releases"
      title="Releases"
      description="Group epics into releases to track ship dates across boards."
    />
  );
}
