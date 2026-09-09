import { Text } from 'ink';
import { theme } from '../styles/theme.js';

export interface MemoryBadgeProps {
  count: number;
  tokensEst: number;
}

// Compact memory indicator: active (green, with token estimate) or empty.
export function MemoryBadge({ count, tokensEst }: MemoryBadgeProps): JSX.Element {
  const active = count > 0;
  return (
    <Text color={active ? theme.statusOk : theme.muted}>
      {active ? 'MEM' : 'mem'} {active ? count : 0}
      {active ? ` \u00b7 ~${tokensEst} tok` : ''}
    </Text>
  );
}