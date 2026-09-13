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
  pendingConfirm?: { text: string; goal: Goal } | null;
  onAnswerConfirm?: (answer: boolean | null) => void;
  scrollOffset: number;
  onScroll: (delta: number) => void;
  onMaxOffset: (max: number) => void;
  overlayHeight?: number;
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

  const [reported, setReported] = useState(maxOffset);
  useEffect(() => {
    if (reported !== maxOffset) {
      setReported(maxOffset);
      onMaxOffset(maxOffset);
    }
  }, [maxOffset, reported, onMaxOffset]);

  const offset = Math.min(Math.max(0, scrollOffset), maxOffset);
  const visible = messages.slice(messages.length - windowSize - offset, messages.length - offset);

  const scrolled = offset > 0;

  return (
    <Box flexDirection="column" height={rows}>
      <Box paddingX={1} marginBottom={1}>
        <Text>
          <Text color={theme.primary}>
            ABSOLUTE
          </Text>
          {scrolled && (
            <Text color={theme.statusWarn} dimColor>
              {'  '}\u2191 scrolled
            </Text>
          )}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {visible.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  No messages yet. Say hello to start.'}
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
