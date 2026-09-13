import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';
import type { Screen } from '../types.js';

export interface SidebarItem {
  id: Screen;
  label: string;
  keyHint: string;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'chat', label: 'chat', keyHint: 'ctrl+t' },
  { id: 'sessions', label: 'sessions', keyHint: 'ctrl+l' },
  { id: 'memories', label: 'memories', keyHint: 'ctrl+r' },
  { id: 'goals', label: 'goals', keyHint: 'ctrl+g' },
  { id: 'settings', label: 'settings', keyHint: 'ctrl+e' },
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
        <Text color={theme.accent}>
          absolute
        </Text>
      </Box>

      {sessionLabel && (
        <Box marginBottom={1}>
          <Text color={theme.muted} dimColor>
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
                color={active ? theme.accent : theme.border}
              >
                {active ? '\u25cf ' : '  '}
              </Text>
              <Text
                color={active ? theme.text : theme.muted}
              >
                {item.label}
              </Text>
              {!compact && (
                <Text color={theme.muted} dimColor>
                  {' '}{item.keyHint}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          tab cycle
        </Text>
      </Box>
    </Box>
  );
}
