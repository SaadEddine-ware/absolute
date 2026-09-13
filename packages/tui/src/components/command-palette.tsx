import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { theme } from '../styles/theme.js';
import { PromptInput } from './prompt-input.js';

export interface PaletteItem {
  id: string;
  label: string;
  category?: string;
  keybind?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  items: PaletteItem[];
  onClose: () => void;
  height?: number;
}

export const COMMAND_PALETTE_HEIGHT = 10;

interface GroupedItems {
  category: string;
  items: PaletteItem[];
}

function groupByCategory(items: PaletteItem[]): GroupedItems[] {
  const map = new Map<string, PaletteItem[]>();
  for (const item of items) {
    const cat = item.category ?? 'Commands';
    let arr = map.get(cat);
    if (!arr) {
      arr = [];
      map.set(cat, arr);
    }
    arr.push(item);
  }
  const order = ['Session', 'Memory', 'Navigation', 'Config', 'Commands'];
  const result: GroupedItems[] = [];
  for (const name of order) {
    const items = map.get(name);
    if (items && items.length > 0) result.push({ category: name, items });
  }
  for (const [name, items] of map) {
    if (!order.includes(name) && items.length > 0) {
      result.push({ category: name, items });
    }
  }
  return result;
}

export function CommandPalette({
  items,
  onClose,
  height = COMMAND_PALETTE_HEIGHT,
}: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    const results = fuzzysort.go(q, items, {
      keys: ['label', 'id'],
      threshold: 0.3,
    });
    return results.map((r) => r.obj);
  }, [items, query]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  // Flat list of items in render order (for keyboard nav)
  const flatItems = useMemo(() => {
    const out: PaletteItem[] = [];
    for (const g of grouped) out.push(...g.items);
    return out;
  }, [grouped]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, flatItems.length - 1))), [flatItems.length]);

  const runSelected = (): void => {
    const item = flatItems[sel] ?? flatItems[0];
    if (item) item.run();
    onClose();
  };

  useInput((input, key) => {
    if (key.upArrow) {
      setSel(Math.max(0, sel - 1));
      return;
    }
    if (key.downArrow) {
      setSel((s) => Math.min(flatItems.length - 1, s + 1));
      return;
    }
    if (key.tab) {
      setSel((s) => (s + 1) % Math.max(1, flatItems.length));
      return;
    }
    void input;
  });

  const listLines = Math.max(1, height - 2);
  let rendered = 0;

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
        <Text color={theme.accent}>
          {'>'}{' '}
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
        {flatItems.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  no matches'}
          </Text>
        ) : (
          grouped.map((group) => {
            const groupLines: JSX.Element[] = [];
            // Category header
            if (rendered < listLines) {
              groupLines.push(
                <Box key={`cat-${group.category}`} flexDirection="row">
                  <Text color={theme.muted} dimColor>
                    {'  '}{group.category}
                  </Text>
                </Box>
              );
              rendered++;
            }
            // Items in this group
            for (const item of group.items) {
              if (rendered >= listLines) break;
              const idx = flatItems.indexOf(item);
              const active = idx === sel;
              groupLines.push(
                <Box key={item.id} flexDirection="row" paddingLeft={1}>
                  <Text color={active ? theme.accent : theme.muted}>
                    {active ? '\u25cf ' : '  '}
                  </Text>
                  <Text color={active ? theme.text : theme.muted}>
                    {item.label}
                  </Text>
                  {item.keybind ? (
                    <Text color={theme.muted} dimColor>
                      {'  '}{item.keybind}
                    </Text>
                  ) : null}
                </Box>
              );
              rendered++;
            }
            return groupLines;
          })
        )}
      </Box>
    </Box>
  );
}
