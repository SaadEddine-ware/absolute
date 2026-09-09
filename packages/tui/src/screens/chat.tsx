import { Box, Text, useStdout } from 'ink';
import type { ChatMessage } from '../types.js';
import { theme } from '../styles/theme.js';
import { Message } from '../components/message.js';
import { Input } from '../components/input.js';
import { StatusBar } from '../components/status-bar.js';

export interface ChatScreenProps {
  sessionLabel: string;
  mode: string;
  messages: ChatMessage[];
  isThinking: boolean;
  memoryCount: number;
  memoryTokens: number;
  sessionCount: number;
  onSubmit: (text: string) => void;
  onCommand: (command: string) => void;
}

export function ChatScreen({
  sessionLabel,
  mode,
  messages,
  isThinking,
  memoryCount,
  sessionCount,
  onSubmit,
  onCommand,
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

      <Input onSubmit={onSubmit} onCommand={onCommand} thinking={isThinking} />

      <StatusBar
        mode={mode}
        sessionLabel={sessionLabel}
        memoryCount={memoryCount}
        sessionCount={sessionCount}
      />
    </Box>
  );
}