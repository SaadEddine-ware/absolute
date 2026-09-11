import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import {
  theme,
  getThemeSpec,
  variantFor,
  type ThemeMeta,
  type ThemeMode,
} from '../styles/theme.js';
import { PromptInput } from './prompt-input.js';

// Live theme browser. Selection previews each theme immediately (applyTheme is
// idempotent and the App re-renders on theme version bumps); enter persists via
// onPick (App writes config) and closes.

export const THEMES_PICKER_HEIGHT = 9;

export interface ThemePickerProps {
  themes: ThemeMeta[];
  currentName: string;
  mode: ThemeMode;
  onPreview: (name: string) => void;
  onPick: (name: string) => void;
  onClose: () => void;
}

export function ThemePicker({
  themes,
  currentName,
  mode,
  onPreview,
  onPick,
  onClose,
}: ThemePickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(() => {
    const idx = themes.findIndex((t) => t.name === currentName);
    return idx >= 0 ? idx : 0;
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) => t.name.toLowerCase().includes(q));
  }, [themes, query]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, filtered.length - 1))), [filtered.length]);

  // Live-preview the selected theme.
  useEffect(() => {
    const target = filtered[sel];
    if (target) onPreview(target.name);
  }, [sel, filtered, onPreview]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSel(Math.max(0, sel - 1));
      return;
    }
    if (key.downArrow) {
      setSel((s) => Math.min(filtered.length - 1, s + 1));
      return;
    }
    void input;
  });

  const runSelected = (): void => {
    const target = filtered[sel] ?? filtered[0];
    if (target) onPick(target.name);
    onClose();
  };

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
          {'theme '}
        </Text>
        <PromptInput
          value={query}
          onChange={setQuery}
          onSubmit={runSelected}
          onEscape={onClose}
        />
        <Text color={theme.muted} dimColor>
          {'  '}esc close · ↑/↓ preview · enter apply+persist
        </Text>
      </Box>
      <Box flexDirection="column">
        {filtered.slice(0, Math.max(1, THEMES_PICKER_HEIGHT - 2)).map((t, i) => {
          const spec = getThemeSpec(t.name);
          if (!spec) return null;
          const v = variantFor(spec, mode);
          const selected = i === sel;
          return (
            <Box key={t.name} flexDirection="row">
              <Text color={selected ? theme.accent : theme.muted} bold={selected}>
                {selected ? '>' : ' '}  {t.name}
              </Text>
              <Text>{'  '}</Text>
              <Text color={v.primary}>▊</Text>
              <Text color={v.accent}>▊</Text>
              <Text color={v.assistant}>▊</Text>
              <Text color={v.system}>▊</Text>
              <Text color={v.text}>▊</Text>
              <Text dimColor>
                {'  '}
                {t.source === 'user' ? 'user' : ''}
                {t.name === currentName ? ' · active' : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}