import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';

export interface FooterProps {
  /** Whether a provider is connected (has API key or is running). */
  connected: boolean;
  /** Provider name (e.g. "openai", "anthropic"). */
  provider: string;
  /** Model name. */
  model: string;
  /** Current working directory or session path. */
  cwd: string;
}

/**
 * Minimal footer bar. Single row, no border, full width.
 * Left: working directory. Right: connection dot + provider + /help hint.
 */
export function Footer({ connected, provider, model, cwd }: FooterProps): JSX.Element {
  const dotColor = connected ? theme.accent : theme.muted;
  const dot = '\u25cf'; // ●
  const status = connected ? 'connected' : 'disconnected';

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text color={theme.muted} dimColor>
        {cwd}
      </Text>
      <Text color={theme.muted}>
        <Text color={dotColor}>{dot}</Text>
        {' '}{status}
        {'  '}{provider}/{model}
        {'  '}/help
      </Text>
    </Box>
  );
}
