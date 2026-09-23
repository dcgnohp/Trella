'use client';
import { type ReactNode, useState } from 'react';

import { IconButton } from '@atlaskit/button/new';
import Badge from '@atlaskit/badge';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';

interface InsightSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

/** Collapsible insight section: header row with a toggle + optional count/right slot. */
export function InsightSection({
  title,
  count,
  defaultOpen = true,
  headerRight,
  children,
}: InsightSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Stack space="space.150">
      <Inline spread="space-between" alignBlock="center" space="space.100">
        <Inline space="space.100" alignBlock="center">
          <IconButton
            appearance="subtle"
            spacing="compact"
            icon={open ? ChevronDownIcon : ChevronRightIcon}
            label={open ? 'Collapse section' : 'Expand section'}
            onClick={() => setOpen((v) => !v)}
          />
          <Text weight="bold">{title}</Text>
          {typeof count === 'number' ? (
            <Badge appearance="default">{count}</Badge>
          ) : null}
        </Inline>
        {headerRight ? <Box>{headerRight}</Box> : null}
      </Inline>
      {open ? <Box>{children}</Box> : null}
    </Stack>
  );
}
