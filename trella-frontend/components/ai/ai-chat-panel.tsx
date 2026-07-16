'use client';

import { useEffect, useRef, useState } from 'react';

import Button, { IconButton } from '@atlaskit/button/new';
import AiSparkleIcon from '@atlaskit/icon/core/ai-sparkle';
import CloseIcon from '@atlaskit/icon/core/close';
import AddIcon from '@atlaskit/icon/core/add';
import SendIcon from '@atlaskit/icon/core/send';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Textarea from '@atlaskit/textarea';
import { token } from '@atlaskit/tokens';

import { StreamingRenderer } from '@/components/ai/streaming-renderer';
import { useConversationContext } from '@/lib/ai/conversation-context';
import { useChat } from '@/lib/ai/use-chat';

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
  const { messages, send, stop, isStreaming, error, clear } = useChat();
  const conversationContext = useConversationContext();

  const listEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest content as messages/stream grow.
  useEffect(() => {
    if (!isOpen) return;
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, isOpen]);

  // Only the final assistant message is "live" while streaming.
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    void send(text, conversationContext);
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
    if (lastUser) void send(lastUser.content, conversationContext);
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
                        <StreamingRenderer
                          content={message.content}
                          isStreaming={streamingThis}
                        />
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

const fabWrapperStyle: React.CSSProperties = {
  position: 'fixed',
  right: 24,
  bottom: 24,
  zIndex: 500,
};

const panelWrapperStyle: React.CSSProperties = {
  position: 'fixed',
  right: 0,
  top: 0,
  bottom: 0,
  width: PANEL_WIDTH,
  maxWidth: '100vw',
  zIndex: 500,
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
