import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';
import type { Screen } from '../types.js';

export interface SidebarItem {
  id: Screen;
  label: string;
  keyHint: string;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'chat', label: 'Chat', keyHint: 'ctrl+t' },
  { id: 'sessions', label: 'Sessions', keyHint: 'ctrl+l' },
  { id: 'memories', label: 'Memories', keyHint: 'ctrl+r' },
  { id: 'settings', label: 'Settings', keyHint: 'ctrl+e' },
];

export interface SidebarProps {
  current: Screen;
  sessionLabel: string;
}

export function Sidebar({ current, sessionLabel }: SidebarProps): JSX.Element {
  const label = sessionLabel.length > 14 ? `${sessionLabel.slice(0, 14)}…` : sessionLabel;

  return (
    <Box
      height="100%"
      width={24}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      flexDirection="column"
      marginRight={1}
    >
      <Text color={theme.primary} bold>
        ABSOLUTE
      </Text>
      <Text color={theme.muted} dimColor wrap="truncate">
        {label || 'untitled'}
      </Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {SIDEBAR_ITEMS.map((item) => {
          const active = item.id === current;
          return (
            <Box key={item.id} flexDirection="row">
              <Text color={active ? theme.accent : theme.muted} bold={active}>
                {active ? '● ' : '  '}
              </Text>
              <Text color={active ? theme.text : theme.muted} bold={active}>
                {item.label}
              </Text>
              <Text color={theme.border} dimColor>
                {'  '}
                {item.keyHint}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box flexGrow={1} />
      <Box>
        <Text color={theme.muted} dimColor>
          tab to cycle views
        </Text>
      </Box>
    </Box>
  );
}