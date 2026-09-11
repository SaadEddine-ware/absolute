import { Box, Text, useInput } from 'ink';
import { theme } from '../styles/theme.js';
import type { ResolvedBinding } from '../lib/keybinds.js';

// Live keybind reference: rendered from the resolved keymap so it always
// reflects ui.keybindings config, plus the slash commands. Read-only.

export const HELP_OVERLAY_HEIGHT = 14;

export interface HelpOverlayProps {
  bindings: ResolvedBinding[];
  onClose: () => void;
  /** Rendered height in rows. */
  height?: number;
}

const SLASH_COMMANDS: Array<[string, string]> = [
  ['/help', 'show this help'],
  ['/new', 'start a new session'],
  ['/clear', 'clear the on-screen history'],
  ['/sessions', 'jump to sessions screen'],
  ['/memories', 'jump to memories screen'],
  ['/embedded-config', 'open embedding/memory settings'],
  ['/settings', 'jump to settings screen'],
  ['/quit', 'exit the TUI'],
];

export function HelpOverlay({
  bindings,
  onClose,
  height = HELP_OVERLAY_HEIGHT,
}: HelpOverlayProps): JSX.Element {
  useInput((input, key) => {
    if (input === 'q' || key.escape || key.return) onClose();
  });

  const rows = Math.max(3, height - 1);
  const bindingLines = bindings.slice(0, rows);
  const slashRows = Math.max(0, rows - bindingLines.length);
  const slashLines = SLASH_COMMANDS.slice(0, slashRows);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      overflowY="hidden"
    >
      <Box flexDirection="row">
        <Text color={theme.accent} bold>
          {'help'}
        </Text>
        <Text color={theme.muted} dimColor>
          {'  '}enter/esc/q close
        </Text>
      </Box>
      <Box flexDirection="column">
        {bindingLines.map((b) => (
          <Box key={b.action} flexDirection="row">
            <Text color={theme.header}>{'  '}[{b.keysText}]</Text>
            <Text color={theme.muted}>{'  '}{b.label}</Text>
          </Box>
        ))}
        {slashLines.map(([cmd, desc]) => (
          <Box key={cmd} flexDirection="row">
            <Text color={theme.header}>{'  '}</Text>
            <Text color={theme.header}>{cmd}</Text>
            <Text color={theme.muted}>{'  '}{desc}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}