'use client';

import { Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';
import PeopleGroupIcon from '@atlaskit/icon/core/people-group';
import ReleaseIcon from '@atlaskit/icon/core/release';
import BranchIcon from '@atlaskit/icon/core/branch';

const icons = {
  teams: PeopleGroupIcon,
  releases: ReleaseIcon,
  dependencies: BranchIcon,
};

interface ComingSoonProps {
  icon: keyof typeof icons;
  title: string;
  description: string;
}

// ponytail: shared stub for tabs with no backend support yet (Teams/Releases/Dependencies).
// icon is passed as a string key (not the component) since page.tsx is a server component
// and can't hand a function reference across the RSC boundary to this client component.
export function ComingSoon({ icon, title, description }: ComingSoonProps) {
  const Icon = icons[icon];
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: token('color.icon.subtle'), transform: 'scale(2)' }}>
          <Icon label="" size="medium" />
        </div>
        <Text weight="bold">{title}</Text>
        <div style={{ marginTop: 4 }}>
          <Text color="color.text.subtle">{description}</Text>
        </div>
      </div>
    </div>
  );
}
