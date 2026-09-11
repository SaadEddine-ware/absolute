import { Box, Text, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import type { Goal } from '@absolute/core';
import type { ChatMessage } from '../types.js';
import { theme } from '../styles/theme.js';
import { Message } from '../components/message.js';
import { Input } from '../components/input.js';
import { ConfirmPrompt } from '../components/confirm-prompt.js';
import { StatusBar } from '../components/status-bar.js';

export interface ChatScreenProps {
  sessionLabel: string;
  messages: ChatMessage[];
  isThinking: boolean;
  memoryCount: number;
  memoryTokens: number;
  sessionCount: number;
  onSubmit: (text: string) => void;
  onCommand: (command: string) => void;
  /** Phase 8: non-null while send() awaits a topic-change confirmation. */
  pendingConfirm?: { text: string; goal: Goal } | null;
  onAnswerConfirm?: (answer: boolean | null) => void;
  /** Phase 9 scrollback: offset from the tail in messages (0 = follow). */
  scrollOffset: number;
  onScroll: (delta: number) => void;
  /** Report how far the window can scroll so App can clamp. */
  onMaxOffset: (max: number) => void;
  /** Vertical space currently reserved above the screen by an overlay. */
  overlayHeight?: number;
  /** Which-key hint shown in the status bar while a chord is pending. */
  pendingChordHint?: string;
}

export function ChatScreen({
  sessionLabel,
  messages,
  isThinking,
  memoryCount,
  memoryTokens,
  sessionCount,
  onSubmit,
  onCommand,
  pendingConfirm = null,
  onAnswerConfirm,
  scrollOffset,
  onScroll,
  onMaxOffset,
  overlayHeight = 0,
  pendingChordHint,
}: ChatScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const totalRows = stdout.rows > 0 ? stdout.rows : 24;
  const rows = Math.max(6, totalRows - overlayHeight);
  const windowSize = Math.max(3, rows - 8);
  const maxOffset = Math.max(0, messages.length - windowSize);

  // Keep App's scroll clamp in sync with the computed window.
  const [reported, setReported] = useState(maxOffset);
  useEffect(() => {
    if (reported !== maxOffset) {
      setReported(maxOffset);
      onMaxOffset(maxOffset);
    }
  }, [maxOffset, reported, onMaxOffset]);

  // Display clamp (App's stored offset may be stale after a message count
  // change); the window follows the tail when offset is 0.
  const offset = Math.min(Math.max(0, scrollOffset), maxOffset);
  const visible = messages.slice(messages.length - windowSize - offset, messages.length - offset);

  const scrolled = offset > 0;

  return (
    <Box flexDirection="column" height={rows}>
      <Box paddingX={1} marginBottom={1}>
        <Text>
          <Text color={theme.primary} bold>
            ABSOLUTE
          </Text>
          <Text color={theme.header}>
            {' '}
            — neural memory CLI
          </Text>
          {scrolled && (
            <Text color={theme.statusWarn}>
              {'  '}↑ scrolled (pgdn to follow)
            </Text>
          )}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {visible.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  No messages yet. Say hello to start the session.'}
          </Text>
        ) : (
          visible.map((msg) => <Message key={msg.id} message={msg} />)
        )}
      </Box>

      {pendingConfirm && onAnswerConfirm ? (
        <ConfirmPrompt prompt={pendingConfirm.text} onAnswer={onAnswerConfirm} />
      ) : (
        <Input
          onSubmit={onSubmit}
          onCommand={onCommand}
          thinking={isThinking}
          isEnabled={overlayHeight === 0}
        />
      )}

      <StatusBar sessionCount={sessionCount} hint={pendingChordHint} />
    </Box>
  );
}