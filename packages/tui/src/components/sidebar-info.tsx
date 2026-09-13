import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';
import { MemoryBadge } from './memory-badge.js';

const TITLE_MAX = 18;

function fmtK(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return String(n);
}

export interface SidebarInfoProps {
  sessionLabel: string;
  contextTokens: number;
  budgetTokens: number;
  memoryCount: number;
  memoryTokens: number;
  sessionPath: string;
  askOn: boolean;
  modeLabel: string;
  modelLabel: string;
}

export function SidebarInfo({
  sessionLabel,
  contextTokens,
  budgetTokens,
  memoryCount,
  memoryTokens,
  sessionPath,
  askOn,
  modeLabel,
  modelLabel,
}: SidebarInfoProps): JSX.Element {
  const title =
    sessionLabel.length > TITLE_MAX ? `${sessionLabel.slice(0, TITLE_MAX - 1)}\u2026` : sessionLabel;

  return (
    <Box
      width={22}
      borderStyle="single"
      borderLeft
      borderLeftColor={theme.border}
      paddingX={1}
      flexDirection="column"
      marginLeft={1}
    >
      <Text color={theme.primary} wrap="truncate">
        {title || 'untitled'}
      </Text>
      <Text color={theme.muted} dimColor>
        tok {fmtK(contextTokens)}/{fmtK(budgetTokens)}
      </Text>
      <Text>
        <MemoryBadge count={memoryCount} tokensEst={memoryTokens} />
      </Text>
      <Box borderStyle="single" borderTop borderTopColor={theme.border} marginY={1} />
      <Text color={theme.muted} dimColor wrap="wrap">
        {sessionPath}
      </Text>
      <Box marginTop={1} />
      <Text color={theme.muted}>
        ask{' '}
        <Text color={askOn ? theme.statusOk : theme.statusWarn}>
          {askOn ? 'on' : 'off'}
        </Text>
      </Text>
      <Text color={theme.muted} wrap="truncate">
        {modeLabel === 'stub'
          ? 'stub'
          : `${modeLabel}${modelLabel ? ` \u00b7 ${modelLabel}` : ''}`}
      </Text>
    </Box>
  );
}
