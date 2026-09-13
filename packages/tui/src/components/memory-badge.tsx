import { Text } from 'ink';
import { theme } from '../styles/theme.js';

export interface MemoryBadgeProps {
  count: number;
  tokensEst: number;
}

export function MemoryBadge({ count, tokensEst }: MemoryBadgeProps): JSX.Element {
  const active = count > 0;
  return (
    <Text color={active ? theme.statusOk : theme.muted} dimColor={!active}>
      {count} mem · {tokensEst} tok
    </Text>
  );
}
