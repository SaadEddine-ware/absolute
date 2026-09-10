import { Box, Text, useStdout } from 'ink';
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
}: ChatScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const rows = stdout.rows > 0 ? stdout.rows : 24;
  const windowSize = Math.max(3, rows - 8);
  const visible = messages.slice(-windowSize);

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
        <Input onSubmit={onSubmit} onCommand={onCommand} thinking={isThinking} />
      )}

      <StatusBar sessionCount={sessionCount} />
    </Box>
  );
}