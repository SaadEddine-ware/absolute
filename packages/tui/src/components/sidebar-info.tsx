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
  /** Session title, truncated to fit the 22-col box. */
  sessionLabel: string;
  /** Recalled-memory context tokens (the numerator of the tok budget line). */
  contextTokens: number;
  /** Session token budget (config memory.maxTokensPerSession, default 8000). */
  budgetTokens: number;
  memoryCount: number;
  memoryTokens: number;
  /** Data directory shown home-relative (e.g. ~/.local/share/absolute). */
  sessionPath: string;
  /** Phase 8 hybrid confirmation: 'ask: on/off'. */
  askOn: boolean;
  /** Active responder label: provider id or 'stub'. */
  modeLabel: string;
  /** LLM model label from config (may be empty when unset). */
  modelLabel: string;
}

// Right-side technical sidebar. Rendered only when the terminal is wide enough
// (columns >= COMPACT_WIDTH in app.tsx); hidden entirely on narrow terminals
// so the chat column gets full width.
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
    sessionLabel.length > TITLE_MAX ? `${sessionLabel.slice(0, TITLE_MAX - 1)}…` : sessionLabel;

  return (
    <Box
      width={22}
      borderStyle="round"
      borderLeft
      borderLeftColor={theme.border}
      paddingX={1}
      flexDirection="column"
      marginLeft={1}
    >
      <Text color={theme.primary} bold wrap="truncate">
        {title || 'untitled'}
      </Text>
      <Text color={theme.muted}>
        tok: {fmtK(contextTokens)}/{fmtK(budgetTokens)}
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
        ask:{' '}
        <Text color={askOn ? theme.statusOk : theme.statusWarn} bold>
          {askOn ? 'on' : 'off'}
        </Text>
      </Text>
      <Text color={theme.header} wrap="truncate">
        {modeLabel === 'stub'
          ? 'stub (no provider)'
          : `${modeLabel}${modelLabel ? ` \u00b7 ${modelLabel}` : ''}`}
      </Text>
    </Box>
  );
}