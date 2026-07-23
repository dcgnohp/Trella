'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import Button, { IconButton } from '@atlaskit/button/new';
import Link from '@atlaskit/link';
import PageIcon from '@atlaskit/icon/core/page';
import { Checkbox } from '@atlaskit/checkbox';
import AiSparkleIcon from '@atlaskit/icon/core/ai-sparkle';
import CloseIcon from '@atlaskit/icon/core/close';
import AddIcon from '@atlaskit/icon/core/add';
import SendIcon from '@atlaskit/icon/core/send';
import Lozenge from '@atlaskit/lozenge';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import Textarea from '@atlaskit/textarea';
import { token } from '@atlaskit/tokens';

import { StreamingRenderer } from '@/components/ai/streaming-renderer';
import { citationRoute } from '@/lib/ai/citation-route';
import { useConversationContext, useConversationScope } from '@/lib/ai/conversation-context';
import { useChat, type Citation, type PendingPlan } from '@/lib/ai/use-chat';

const PANEL_WIDTH = 380;

/**
 * Floating, dockable AI chat (P4-F3). Purely client-side conversation via
 * `useChat`. Context of the page the user is viewing is supplied by
 * `useConversationContext()` (payload-mode) — the panel stays presentation-only
 * and never fetches domain data or learns how context is collected.
 */
export function AiChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const {
    messages,
    send,
    stop,
    isStreaming,
    error,
    clear,
    activity,
    dataSources,
    citations,
    pendingPlan,
    actionResults,
    isExecuting,
    executeActions,
    dismissPlan,
  } = useChat();
  const conversationContext = useConversationContext();
  const conversationScope = useConversationScope();
  const router = useRouter();

  // Open a cited entity. Documents fall back to the doc page (the preview
  // drawer is page-local); tasks route to their board (or backlog) with a
  // ?task= deep link that opens the TaskDetailDrawer; sprints route to the
  // workspace backlog. The global panel stays mounted across this in-workspace
  // navigation, so the chat remains visible.
  const openSource = (c: Citation) => {
    router.push(citationRoute(c));
  };

  const listEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest content as messages/stream grow.
  useEffect(() => {
    if (!isOpen) return;
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, activity, dataSources, citations, isOpen]);

  // Only the final assistant message is "live" while streaming.
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    // Scope ids (workspace/project/sprint/task the user is viewing) enable the
    // backend reasoning engine to call data-access tools; omitted keys fall back.
    void send(text, conversationContext, conversationScope);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleRetry = () => {
    if (isStreaming) return;
    // ponytail: resend the most recent user turn verbatim. It appends a fresh
    // user message rather than mutating history — simplest correct retry.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) void send(lastUser.content, conversationContext, conversationScope);
  };

  if (!isOpen) {
    return (
      <div style={fabWrapperStyle}>
        <IconButton
          icon={(iconProps) => <AiSparkleIcon {...iconProps} />}
          label="Open AI assistant"
          appearance="primary"
          shape="circle"
          onClick={() => setIsOpen(true)}
          testId="ai-chat-fab"
        />
      </div>
    );
  }

  return (
    <div style={panelWrapperStyle} data-testid="ai-chat-panel">
      <Box xcss={panelStyles}>
        <Box xcss={columnStyles}>
          {/* Header */}
          <Box xcss={headerStyles}>
            <Inline spread="space-between" alignBlock="center">
              <Inline space="space.100" alignBlock="center">
                <AiSparkleIcon label="" color={token('color.icon.brand')} />
                <strong>AI assistant</strong>
              </Inline>
              <Inline space="space.050" alignBlock="center">
                <IconButton
                  icon={AddIcon}
                  label="New chat"
                  appearance="subtle"
                  spacing="compact"
                  isDisabled={messages.length === 0 && !error}
                  onClick={clear}
                  testId="ai-chat-clear"
                />
                <IconButton
                  icon={CloseIcon}
                  label="Close AI assistant"
                  appearance="subtle"
                  spacing="compact"
                  onClick={() => setIsOpen(false)}
                  testId="ai-chat-close"
                />
              </Inline>
            </Inline>
          </Box>

          {/* Message list */}
          <Box xcss={listStyles} testId="ai-chat-messages">
            <Stack space="space.150">
              {messages.length === 0 ? (
                <Box xcss={emptyStyles}>
                  Ask anything to get started. Your conversation stays on this page.
                </Box>
              ) : null}

              {messages.map((message, index) => {
                if (message.role !== 'user' && message.role !== 'assistant') return null;
                const isUser = message.role === 'user';
                const streamingThis = isStreaming && index === lastAssistantIndex;
                return (
                  <Box
                    key={message.id}
                    xcss={isUser ? userRowStyles : assistantRowStyles}
                  >
                    <Box xcss={isUser ? userBubbleStyles : assistantBubbleStyles}>
                      {isUser ? (
                        <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
                      ) : (
                        <Stack space="space.100">
                          <StreamingRenderer
                            content={message.content}
                            isStreaming={streamingThis}
                          />
                          {/* Live activity indicator: latest reasoning step + a few recent labels. */}
                          {streamingThis && activity.length > 0 ? (
                            <Box xcss={activityStyles} testId="ai-chat-activity">
                              <Inline space="space.075" alignBlock="center">
                                <Spinner size="small" label="" />
                                <span>{`${activity[activity.length - 1].label}\u2026`}</span>
                              </Inline>
                            </Box>
                          ) : null}
                          {/* Data sources used: rendered after the turn on the final assistant bubble. */}
                          {!streamingThis &&
                          index === lastAssistantIndex &&
                          dataSources.length > 0 ? (
                            <Box testId="ai-chat-data-sources">
                              <Stack space="space.075">
                                <Box xcss={dataSourcesLabelStyles}>Data sources used</Box>
                                <Inline space="space.050" shouldWrap>
                                  {dataSources.map((source) => (
                                    <Lozenge key={source} appearance="new">
                                      {source}
                                    </Lozenge>
                                  ))}
                                </Inline>
                              </Stack>
                            </Box>
                          ) : null}
                          {/* Sources: cited documents from semantic retrieval,
                              a dedicated section below the answer. */}
                          {!streamingThis &&
                          index === lastAssistantIndex &&
                          citations.length > 0 ? (
                            <CitationSections citations={citations} onOpen={openSource} />
                          ) : null}
                        </Stack>
                      )}
                    </Box>
                  </Box>
                );
              })}

              {error ? (
                <SectionMessage appearance="error" title="Message failed">
                  <Stack space="space.100">
                    <span>{error}</span>
                    <Inline>
                      <Button
                        appearance="subtle"
                        onClick={handleRetry}
                        isDisabled={isStreaming}
                        testId="ai-chat-retry"
                      >
                        Try again
                      </Button>
                    </Inline>
                  </Stack>
                </SectionMessage>
              ) : null}

              {/* Approval card: proposed writes parked by the reasoning loop.
                  Shown once streaming settles so the user reviews a stable list. */}
              {pendingPlan && !isStreaming ? (
                <ApprovalCard
                  key={pendingPlan.planId}
                  plan={pendingPlan}
                  isExecuting={isExecuting}
                  onApprove={executeActions}
                  onReject={dismissPlan}
                />
              ) : null}

              {/* Execution results: one lozenge per attempted action. */}
              {actionResults.length > 0 ? (
                <Box testId="ai-chat-action-results">
                  <Stack space="space.075">
                    <Box xcss={dataSourcesLabelStyles}>Action results</Box>
                    {actionResults.map((result) => (
                      <Inline
                        key={result.actionId}
                        space="space.075"
                        alignBlock="center"
                        spread="space-between"
                      >
                        <span>{result.summary || result.toolName}</span>
                        <Lozenge appearance={statusAppearance(result.status)}>
                          {result.status}
                        </Lozenge>
                      </Inline>
                    ))}
                  </Stack>
                </Box>
              ) : null}

              <div ref={listEndRef} />
            </Stack>
          </Box>

          {/* Input row */}
          <Box xcss={inputStyles}>
            <Stack space="space.100">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder={'Ask the AI assistant\u2026'}
                resize="vertical"
                minimumRows={2}
                maxHeight="160px"
                testId="ai-chat-input"
              />
              <Inline spread="space-between" alignBlock="center">
                <Box xcss={hintStyles}>{'Enter to send \u00b7 Shift+Enter for newline'}</Box>
                {isStreaming ? (
                  <Button
                    appearance="warning"
                    onClick={stop}
                    testId="ai-chat-stop"
                  >
                    Stop generating
                  </Button>
                ) : (
                  <Button
                    appearance="primary"
                    iconAfter={SendIcon}
                    onClick={submit}
                    isDisabled={input.trim().length === 0}
                    testId="ai-chat-send"
                  >
                    Send
                  </Button>
                )}
              </Inline>
            </Stack>
          </Box>
        </Box>
      </Box>
    </div>
  );
}

/** Map an action status to a Lozenge appearance. */
function statusAppearance(status: string): 'success' | 'removed' | 'default' {
  if (status === 'executed') return 'success';
  if (status === 'denied' || status === 'failed') return 'removed';
  return 'default';
}

/**
 * Dedicated "Sources" section listing the documents cited by semantic
 * retrieval (Perplexity/ChatGPT style), rendered below the answer. Presentation
 * only: clicking a source calls `onOpen`. Designed to extend later (snippets,
 * matched passages, rerank/semantic badges, graph refs) without changing the
 * Citation contract — add fields + render them here.
 */
function CitationSections({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}) {
  const documents = citations.filter((c) => c.type === 'document');
  const related = citations.filter((c) => c.type === 'task' || c.type === 'sprint');
  return (
    <Stack space="space.150">
      {documents.length > 0 ? <SourcesSection citations={documents} onOpen={onOpen} /> : null}
      {related.length > 0 ? (
        <RelatedTasksSection citations={related} onOpen={onOpen} />
      ) : null}
    </Stack>
  );
}

/** "Sources": cited documents from semantic retrieval, rendered below the
 *  answer. Clicking a source calls `onOpen` (SPA nav). */
function SourcesSection({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}) {
  return (
    <Box testId="ai-chat-sources">
      <Stack space="space.075">
        <Box xcss={dataSourcesLabelStyles}>Sources</Box>
        <Stack space="space.050">
          {citations.map((citation) => (
            <Inline key={citation.id} space="space.075" alignBlock="center">
              <PageIcon label="" color={token('color.icon.subtle')} />
              <Link
                href={citationRoute(citation)}
                onClick={(e: React.MouseEvent) => {
                  // Keep the SPA/preview flow; avoid a full page reload.
                  e.preventDefault();
                  onOpen(citation);
                }}
                testId={`ai-chat-source-${citation.id}`}
              >
                {citation.title}
              </Link>
            </Inline>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

/** "Related tasks": task (and subtask) + sprint citations. Shows the issueKey
 *  as a Lozenge before the title when present. Clicking routes to the board +
 *  ?task= drawer (tasks) or the backlog (sprints) via `onOpen`. */
function RelatedTasksSection({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
}) {
  return (
    <Box testId="ai-chat-related">
      <Stack space="space.075">
        <Box xcss={dataSourcesLabelStyles}>Related tasks</Box>
        <Stack space="space.050">
          {citations.map((citation) => (
            <Inline
              key={`${citation.type}:${citation.id}`}
              space="space.075"
              alignBlock="center"
            >
              {/* ponytail: reuse PageIcon (the task's approved fallback) rather
                  than an unverified task/sprint core icon. Upgrade path: swap to
                  a dedicated ADS icon once confirmed available. */}
              <PageIcon label="" color={token('color.icon.subtle')} />
              {citation.issueKey ? (
                <Lozenge appearance="default">{citation.issueKey}</Lozenge>
              ) : null}
              <Link
                href={citationRoute(citation)}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  onOpen(citation);
                }}
                testId={`ai-chat-related-${citation.id}`}
              >
                {citation.title}
              </Link>
            </Inline>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Approval card for a parked plan (P8). Each proposal gets a checkbox (all
 * checked by default). Keyed by planId in the parent so its selection state
 * resets when a new plan arrives. Presentation-only — execution is delegated up.
 */
function ApprovalCard({
  plan,
  isExecuting,
  onApprove,
  onReject,
}: {
  plan: PendingPlan;
  isExecuting: boolean;
  onApprove: (opts: { approvedActionIds?: string[]; approveAll?: boolean }) => void;
  onReject: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(plan.proposals.map((p) => p.actionId)),
  );

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedIds = plan.proposals
    .map((p) => p.actionId)
    .filter((id) => checked.has(id));

  return (
    <Box testId="ai-chat-approval">
      <SectionMessage appearance="warning" title="Proposed actions — approval required">
        <Stack space="space.150">
          <Stack space="space.075">
            {plan.proposals.map((proposal) => (
              <Checkbox
                key={proposal.actionId}
                isChecked={checked.has(proposal.actionId)}
                onChange={() => toggle(proposal.actionId)}
                label={proposal.preview || proposal.toolName}
                isDisabled={isExecuting}
                testId={`ai-chat-approval-item-${proposal.actionId}`}
              />
            ))}
          </Stack>
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Button
              appearance="primary"
              onClick={() => onApprove({ approvedActionIds: selectedIds })}
              isDisabled={isExecuting || selectedIds.length === 0}
              testId="ai-chat-approve-selected"
            >
              Approve selected
            </Button>
            <Button
              appearance="default"
              onClick={() => onApprove({ approveAll: true })}
              isDisabled={isExecuting}
              testId="ai-chat-approve-all"
            >
              Approve all
            </Button>
            <Button
              appearance="subtle"
              onClick={onReject}
              isDisabled={isExecuting}
              testId="ai-chat-reject-all"
            >
              Reject all
            </Button>
            {isExecuting ? <Spinner size="small" label="" /> : null}
          </Inline>
        </Stack>
      </SectionMessage>
    </Box>
  );
}

const fabWrapperStyle: React.CSSProperties = {
  position: 'fixed',
  right: 24,
  bottom: 24,
  zIndex: 500,
};

const panelWrapperStyle: React.CSSProperties = {
  width: PANEL_WIDTH,
  height: '100%',
  flexShrink: 0,
  position: 'relative',
  zIndex: 10,
  borderLeft: '1px solid var(--trella-border, #e2e8f0)',
};

const panelStyles = xcss({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'elevation.surface.overlay',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  boxShadow: 'elevation.shadow.overlay',
});

const headerStyles = xcss({
  padding: 'space.200',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
  borderBottomColor: 'color.border',
  flexShrink: 0,
});

// Fills the column and scrolls independently. `minHeight: 0` is essential: a
// flex child won't shrink below its content height without it, which otherwise
// disables the overflow scroll (the list grows and pushes the input off-panel).
const columnStyles = xcss({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 'space.0',
});

const listStyles = xcss({
  flexGrow: 1,
  minHeight: 'space.0',
  overflowY: 'auto',
  padding: 'space.200',
});

const emptyStyles = xcss({
  color: 'color.text.subtlest',
  textAlign: 'center',
  paddingBlock: 'space.400',
});

const userRowStyles = xcss({
  display: 'flex',
  justifyContent: 'end',
});

const assistantRowStyles = xcss({
  display: 'flex',
  justifyContent: 'start',
});

const userBubbleStyles = xcss({
  maxWidth: '85%',
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'color.background.brand.bold',
  color: 'color.text.inverse',
});

const assistantBubbleStyles = xcss({
  maxWidth: '85%',
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'color.background.neutral',
  color: 'color.text',
});

const inputStyles = xcss({
  padding: 'space.200',
  borderTopWidth: 'border.width',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border',
  flexShrink: 0,
});

const hintStyles = xcss({
  color: 'color.text.subtlest',
  fontSize: '11px',
});

const activityStyles = xcss({
  color: 'color.text.subtle',
  fontSize: '12px',
});

const dataSourcesLabelStyles = xcss({
  color: 'color.text.subtlest',
  fontSize: '11px',
});
