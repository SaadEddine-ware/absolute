import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';

export interface StatusBarProps {
  sessionCount: number;
  /** Which-key hint shown while a chord (e.g. ctrl+x) is pending. */
  hint?: string;
}

// Minimal bottom bar: session count + exit/new key hints. Session label, mode,
// memory and token usage moved to the right technical sidebar (sidebar-info.tsx)
// so nothing is duplicated across the two bars.
export function StatusBar({ sessionCount, hint }: StatusBarProps): JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text color={theme.muted}>sess {sessionCount}</Text>
      <Text color={theme.muted}>
        {hint ? (
          <Text color={theme.accent}>{hint}</Text>
        ) : (
          <>
            <Text color={theme.border}>[ctrl-c]</Text> quit
            {'  '}
            <Text color={theme.border}>/new</Text>
            {'  '}
            <Text color={theme.border}>/help</Text>
          </>
        )}
      </Text>
    </Box>
  );
}