import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { theme } from '../styles/theme.js';
import { PromptInput } from './prompt-input.js';

// Filterable action/command picker. The filter reuses PromptInput (full
// readline editing); up/down here move the selection (PromptInput's own
// up/down is a no-op while the palette has no history).

export interface PaletteItem {
  id: string;
  /** Display label. */
  label: string;
  /** Right-side hint, e.g. the bound keys. */
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  items: PaletteItem[];
  onClose: () => void;
  /** Rendered height in rows (App reserves this much of the terminal). */
  height?: number;
}

export const COMMAND_PALETTE_HEIGHT = 8;

export function CommandPalette({
  items,
  onClose,
  height = COMMAND_PALETTE_HEIGHT,
}: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, filtered.length - 1))), [filtered.length]);

  const runSelected = (): void => {
    const item = filtered[sel] ?? filtered[0];
    if (item) item.run();
    onClose();
  };

  // Selection movement. PromptInput handles typing + enter (onSubmit=run);
  // esc closes via the PromptInput onEscape.
  useInput((input, key) => {
    if (key.upArrow) {
      setSel(Math.max(0, sel - 1));
      return;
    }
    if (key.downArrow) {
      setSel((s) => Math.min(filtered.length - 1, s + 1));
      return;
    }
    if (key.tab) {
      setSel((s) => (s + 1) % Math.max(1, filtered.length));
      return;
    }
    void input;
  });

  const listLines = Math.max(1, height - 2);
  const visible = filtered.slice(0, listLines);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.accent}
      flexDirection="column"
      paddingX={1}
      overflowY="hidden"
    >
      <Box flexDirection="row">
        <Text color={theme.accent} bold>
          {'cmd '}
        </Text>
        <PromptInput
          value={query}
          onChange={setQuery}
          onSubmit={runSelected}
          onEscape={onClose}
        />
        <Text color={theme.muted} dimColor>
          {'  '}esc close · ↑/↓ pick · enter run
        </Text>
      </Box>
      <Box flexDirection="column">
        {visible.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  no matches'}
          </Text>
        ) : (
          visible.map((item, i) => (
            <Box key={item.id} flexDirection="row">
              <Text color={i === sel ? theme.accent : theme.muted} bold={i === sel}>
                {i === sel ? '>' : ' '}  {item.label}
              </Text>
              {item.hint ? (
                <Text color={theme.muted} dimColor>
                  {'  '}
                  {item.hint}
                </Text>
              ) : null}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}