import { Box, Text } from 'ink';
import type { ChatMessage } from '../types.js';
import { theme } from '../styles/theme.js';

const ROLE_LABEL: Record<ChatMessage['role'], string> = {
  user: 'you',
  assistant: 'ai',
  system: 'sys',
};

const ROLE_COLOR: Record<ChatMessage['role'], string> = {
  user: theme.user,
  assistant: theme.assistant,
  system: theme.system,
};

export function Message({ message }: { message: ChatMessage }): JSX.Element {
  const label = ROLE_LABEL[message.role];
  const color = ROLE_COLOR[message.role];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {label}
        </Text>
        <Text color={theme.muted}>{'  ' + message.ts.slice(11, 19)}</Text>
      </Box>
      <Box flexDirection="column">
        {message.text.split('\n').map((line, i) => (
          <Text key={i} color={theme.text}>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}