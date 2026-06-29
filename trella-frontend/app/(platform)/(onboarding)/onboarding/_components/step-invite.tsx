'use client';

import React, { useState } from 'react';
import { Box, Stack, Inline, Text } from '@atlaskit/primitives';
import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import TextField from '@atlaskit/textfield';
import { token } from '@atlaskit/tokens';
import { useRouter } from 'next/navigation';
import type { OnboardingData } from './onboarding-wizard';
import { BoardPreview } from './board-preview';
import { BoardsService, ColumnsService } from '@/lib/client';

interface StepInviteProps {
  data: OnboardingData;
  orgId: string | null;
  onBack: () => void;
}

// Map status name → canonical key
function toStatusKey(name: string): string {
  const n = name.toLowerCase().trim();
  if (n === 'to do' || n === 'todo') return 'TODO';
  if (n === 'in progress') return 'IN_PROGRESS';
  if (n === 'in review' || n === 'pending') return 'PENDING';
  if (n === 'done' || n === 'complete' || n === 'completed') return 'DONE';
  return 'TODO';
}

export function StepInvite({ data, orgId, onBack }: StepInviteProps) {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleStart = async () => {
    if (!orgId) { router.push('/organization'); return; }
    setLoading(true);
    try {
      // Persist projectType client-side (BE has no projectType field yet)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`trella:projectType:${orgId}`, data.projectType);
        window.localStorage.setItem(`trella:onboarding:${orgId}`, JSON.stringify({
          name: data.name, workTypes: data.workTypes, statuses: data.statuses,
        }));
      }

      // Create a board for the new workspace
      const boardTitle = data.name || 'My Project';
      const board = await BoardsService.Boards_boardsCreateBoard({
        requestBody: { orgId, title: boardTitle },
      });

      // Create columns from the statuses the user defined
      const statuses = data.statuses.length > 0 ? data.statuses : ['To Do', 'In Progress', 'Done'];
      await Promise.all(
        statuses.map((name, i) =>
          ColumnsService.Columns_columnsCreateColumn({
            boardId: board.id,
            requestBody: { name, statusKey: toStatusKey(name), position: i },
          })
        )
      );

      router.push(`/workspaces/${orgId}/boards/${board.id}`);
    } catch {
      // ponytail: fallback if board creation fails — just go to org page
      router.push(`/organization/${orgId}`);
    } finally {
      setLoading(false);
    }
  };

  const inviteLink = orgId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${orgId}`
    : 'https://trella.app/invite/xxxxx';

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', minHeight: 460 }}>
      <Box padding="space.500" style={{ flex: 1 }}>
        <Stack space="space.400">
          <Stack space="space.100">
            <Heading as="h2" size="large">Trella is better when used together</Heading>
            <Text color="color.text.subtle">
              Trella works better with your team onboard. Invite a teammate to try it out with you.
            </Text>
          </Stack>

          <Stack space="space.200">
            <Stack space="space.075">
              <Text size="small" weight="medium">Share via link</Text>
              <Inline space="space.100">
                <div style={{ flex: 1 }}>
                  <TextField id="invite-link" value={inviteLink} isReadOnly />
                </div>
                <Button appearance="subtle" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
              </Inline>
            </Stack>

            <Stack space="space.075">
              <Text size="small" weight="medium">Invite via email</Text>
              <TextField
                id="invite-email"
                value={email}
                onChange={e => setEmail((e.target as HTMLInputElement).value)}
                placeholder="e.g. maria@company.com"
              />
            </Stack>
          </Stack>

          <Inline space="space.100">
            <Button appearance="subtle" onClick={onBack}>Back</Button>
            <Button appearance="subtle" onClick={handleStart}>Do this later</Button>
            <Button appearance="primary" onClick={handleStart} isLoading={loading}>
              Go to Trella
            </Button>
          </Inline>
        </Stack>
      </Box>

      {/* Right: visual */}
      <Box style={{
        flex: 1,
        backgroundColor: token('color.background.brand.bold'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: token('space.400'),
      }}>
        <BoardPreview
          name={data.name || 'My Software Team'}
          projectType={data.projectType}
          activeTab="Board"
          statuses={data.statuses}
          showAvatars
        />
      </Box>
    </div>
  );
}
