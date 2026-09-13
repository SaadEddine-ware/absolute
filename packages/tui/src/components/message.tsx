import { Box, Text } from 'ink';
import type { ChatMessage } from '../types.js';
import { theme } from '../styles/theme.js';

const ROLE_PREFIX: Record<ChatMessage['role'], string> = {
  user: 'you: ',
  assistant: 'absolute: ',
  system: '',
};

const ROLE_COLOR: Record<ChatMessage['role'], string> = {
  user: theme.accent,
  assistant: theme.accent,
  system: theme.muted,
};

export function Message({ message }: { message: ChatMessage }): JSX.Element {
  const prefix = ROLE_PREFIX[message.role];
  const color = ROLE_COLOR[message.role];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        {prefix ? <Text color={color}>{prefix}</Text> : null}
        <Text color={message.role === 'system' ? theme.muted : theme.text}>
          {message.text}
        </Text>
      </Text>
    </Box>
  );
}
