import { ComingSoon } from '../_components/coming-soon';

export const metadata = { title: 'Plan Teams' };

export default function PlanTeamsPage() {
  return (
    <ComingSoon
      icon="teams"
      title="Teams"
      description="Assign teams to this plan to track their capacity and workload."
    />
  );
}
