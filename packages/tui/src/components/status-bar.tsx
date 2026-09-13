import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';

export interface StatusBarProps {
  sessionCount: number;
  hint?: string;
}

export function StatusBar({ sessionCount, hint }: StatusBarProps): JSX.Element {
  return (
    <Box
      borderStyle="single"
      borderTop={true}
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text color={theme.muted} dimColor>{sessionCount} sessions</Text>
      <Text color={theme.muted} dimColor>
        {hint ? (
          <Text color={theme.primary}>{hint}</Text>
        ) : (
          <>
            ctrl-c quit · /help
          </>
        )}
      </Text>
    </Box>
  );
}
