import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';
import { MemoryBadge } from './memory-badge.js';

export interface StatusBarProps {
  mode: string;
  sessionLabel: string;
  memoryCount: number;
  memoryTokens: number;
  sessionCount: number;
}

export function StatusBar({
  mode,
  sessionLabel,
  memoryCount,
  memoryTokens,
  sessionCount,
}: StatusBarProps): JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text color={theme.primary}>
        absolute{': '}
        <Text color={theme.text}>{sessionLabel}</Text>
      </Text>
      <Text color={theme.muted}>
        <Text color={theme.statusOk}>{mode}</Text>
        {'  '}
        <MemoryBadge count={memoryCount} tokensEst={memoryTokens} />
        {'  '}
        <Text color={theme.muted}>sess {sessionCount}</Text>
        {'  '}
        <Text color={theme.muted}>
          [ctrl-c]{' '}
          <Text color={theme.border}>quit</Text>
          {'  '}
          <Text color={theme.border}>/new</Text>
        </Text>
      </Text>
    </Box>
  );
}