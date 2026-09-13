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
  { id: 'goals', label: 'Goals', keyHint: 'ctrl+g' },
  { id: 'settings', label: 'Settings', keyHint: 'ctrl+e' },
];

interface SidebarProps {
  activeView: Screen;
  sessionLabel: string;
  onSelect: (id: Screen) => void;
  compact?: boolean;
}

export type { SidebarProps };

export function Sidebar({ activeView, sessionLabel, onSelect, compact = false }: SidebarProps): JSX.Element {
  const width = compact ? 18 : 24;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderRight={true}
      borderColor={theme.border}
      paddingX={1}
      paddingTop={1}
      paddingBottom={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.primary}>
          ABSOLUTE
        </Text>
      </Box>

      {sessionLabel && (
        <Box marginBottom={1}>
          <Text color={theme.muted}>
            {sessionLabel.length > 16
              ? sessionLabel.slice(0, 14) + '..'
              : sessionLabel}
          </Text>
        </Box>
      )}

      <Box flexDirection="column" gap={1}>
        {SIDEBAR_ITEMS.map((item) => {
          const active = item.id === activeView;
          return (
            <Box key={item.id} flexDirection="row">
              <Text
                color={active ? theme.primary : theme.border}
              >
                {active ? '\u203a ' : '  '}
              </Text>
              <Text
                color={active ? theme.text : theme.muted}
              >
                {item.label}
              </Text>
              {!compact && (
                <Text color={theme.muted}>
                  {' '}{item.keyHint}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          tab to cycle
        </Text>
      </Box>
    </Box>
  );
}
