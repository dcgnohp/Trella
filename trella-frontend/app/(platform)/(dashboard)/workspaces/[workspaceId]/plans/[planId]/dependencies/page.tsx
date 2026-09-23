import { ComingSoon } from '../_components/coming-soon';

export const metadata = { title: 'Plan Dependencies' };

export default function PlanDependenciesPage() {
  return (
    <ComingSoon
      icon="dependencies"
      title="Dependencies"
      description="Visualize blocking relationships between epics across boards."
    />
  );
}
