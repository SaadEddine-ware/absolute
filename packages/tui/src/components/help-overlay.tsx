import { Box, Text, useInput } from 'ink';
import { theme } from '../styles/theme.js';
import type { ResolvedBinding } from '../lib/keybinds.js';
import { getCommandRegistry } from '../lib/commands.js';

export const HELP_OVERLAY_HEIGHT = 14;

export interface HelpOverlayProps {
  bindings: ResolvedBinding[];
  onClose: () => void;
  height?: number;
}

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

  const registry = getCommandRegistry();
  const builtinCmds = registry
    .list()
    .filter((c) => c.category !== 'user')
    .sort((a, b) => a.name.localeCompare(b.name));
  const slashRows = Math.max(0, rows - bindingLines.length);
  const slashLines = builtinCmds.slice(0, slashRows);

  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      paddingTop={1}
      paddingBottom={1}
      overflowY="hidden"
    >
      <Box flexDirection="row" marginBottom={1}>
        <Text color={theme.primary}>
          help
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
        {slashLines.map((cmd) => {
          const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
          return (
            <Box key={cmd.name} flexDirection="row">
              <Text color={theme.header}>{'  '}/</Text>
              <Text color={theme.header}>{cmd.name}</Text>
              <Text color={theme.muted}>{'  '}{cmd.description}{aliases}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
