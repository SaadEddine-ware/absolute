import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { theme } from '../styles/theme.js';
import { PromptInput } from './prompt-input.js';
import type { ProviderDesc } from '@absolute/providers';

export interface ModelPickerItem {
  provider: ProviderDesc;
  active: boolean;
}

export interface ModelPickerProps {
  providers: ProviderDesc[];
  activeProvider: string;
  onSelect: (providerId: string, model: string) => void;
  onClose: () => void;
  height?: number;
}

export const MODEL_PICKER_HEIGHT = 10;

export function ModelPicker({
  providers,
  activeProvider,
  onSelect,
  onClose,
  height = MODEL_PICKER_HEIGHT,
}: ModelPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);

  const items: ModelPickerItem[] = useMemo(
    () => providers.map((p) => ({ provider: p, active: p.id === activeProvider })),
    [providers, activeProvider]
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    const results = fuzzysort.go(q, items, {
      keys: ['provider.name', 'provider.id'],
      threshold: 0.3,
    });
    return results.map((r) => r.obj);
  }, [items, query]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, filtered.length - 1))), [filtered.length]);

  const runSelected = (): void => {
    const item = filtered[sel] ?? filtered[0];
    if (item) onSelect(item.provider.id, item.provider.defaultModel);
    onClose();
  };

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
          models{' '}
        </Text>
        <PromptInput
          value={query}
          onChange={setQuery}
          onSubmit={runSelected}
          onEscape={onClose}
        />
        <Text color={theme.muted} dimColor>
          {'  '}esc close · ↑/↓ pick · enter select
        </Text>
      </Box>
      <Box flexDirection="column">
        {visible.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  no providers'}
          </Text>
        ) : (
          visible.map((item, i) => (
            <Box key={item.provider.id} flexDirection="row">
              <Text color={i === sel ? theme.accent : theme.muted}>
                {i === sel ? '\u25cf ' : '  '}
              </Text>
              <Text color={i === sel ? theme.text : theme.muted}>
                {item.provider.name}
              </Text>
              <Text color={theme.muted} dimColor>
                {'  '}{item.provider.defaultModel}
              </Text>
              {item.provider.freeTier ? (
                <Text color={theme.accent} dimColor>
                  {'  '}free
                </Text>
              ) : null}
              {item.active ? (
                <Text color={theme.accent}>
                  {'  '}\u25cf
                </Text>
              ) : null}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
