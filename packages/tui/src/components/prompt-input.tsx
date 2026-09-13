import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useRef, useState, useMemo } from 'react';
import { theme } from '../styles/theme.js';
import { getCommandRegistry, type CommandDef } from '../lib/commands.js';

// Only one prompt is focused at a time, so a module counter is a reliable
// "is any editable prompt receiving keys right now" signal. App's keybind
// router consults it before firing bindings that consume bare printable chars
// (default help '?'), so "?" keeps typing normally instead of opening help.
let activePromptCount = 0;

// Autocomplete active flag — when true, the prompt is showing a / autocomplete
// popup and should receive all arrow/enter/tab/escape keys exclusively.
let autocompleteActive = false;

export function isPromptActive(): boolean {
  return activePromptCount > 0;
}

export function isAutocompleteActive(): boolean {
  return autocompleteActive;
}

// Emacs/readline-style single-line prompt editor. Replaces ink-text-input so
// ABSOLUTE gets caret editing (ctrl+a/e/u/k/w, alt+b/f, arrows), kill-to-
// start/end, and up/down history navigation. ctrl+c clears a non-empty line
// and only exits when the line is already empty (opencode-style); ctrl+d
// deletes forward and exits on an empty line (back-compat with the old
// binding). Keys that do not belong to the editor (ctrl+p, chords, ...) are
// ignored here and fall through to the App-level keybind router.
//
// Ink's key model: Enter is delivered as input="\r" (return flag set), the
// Backspace key and the Delete key both arrive with key.delete=true (only
// Ctrl+H sets key.backspace), so backspace/delete both delete before the
// caret here — ctrl+d is the forward-delete, like readline.

export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isEnabled?: boolean;
  /** In-memory history for up/down navigation (oldest → newest). */
  history?: string[];
  /** Called on escape (hosts like the palette use this to close). */
  onEscape?: () => void;
  /** Called when autocomplete opens/closes so App can suppress keybinds. */
  onAutocompleteChange?: (active: boolean) => void;
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_?]/.test(ch);
}

/** Index after skipping the word immediately before the caret. */
function wordStart(text: string, cur: number): number {
  let i = cur;
  while (i > 0 && !isWordChar(text[i - 1])) i -= 1;
  while (i > 0 && isWordChar(text[i - 1])) i -= 1;
  return i;
}

/** Index after the first full word after the caret. */
function wordForward(text: string, cur: number): number {
  const len = text.length;
  if (cur >= len) return len;
  let i = cur;
  while (i < len && isWordChar(text[i])) i += 1;
  while (i < len && !isWordChar(text[i])) i += 1;
  return i;
}

/** Fuzzy match: returns true if all chars in pattern appear in order in target. */
function fuzzyMatch(pattern: string, target: string): boolean {
  const p = pattern.toLowerCase();
  const t = target.toLowerCase();
  let pi = 0;
  for (let ti = 0; ti < t.length && pi < p.length; ti++) {
    if (t[ti] === p[pi]) pi++;
  }
  return pi === p.length;
}

const MAX_AUTOCOMPLETE = 10;

export function PromptInput({
  value,
  onChange,
  onSubmit,
  isEnabled = true,
  history = [],
  onEscape,
  onAutocompleteChange,
}: PromptInputProps): JSX.Element {
  const { exit } = useApp();
  const [cursorState, setCursor] = useState(0);
  // The caret clamps to the value length (parent may clear value externally on
  // submit). Done as a derived value — an effect-based clamp could re-apply a
  // stale caret over a fresh insert, so no effect is used.
  const cursor = Math.min(cursorState, value.length);

  // --- Slash autocomplete state ---
  const [acVisible, setAcVisible] = useState(false);
  const [acIndex, setAcIndex] = useState(0); // selected item
  const [acFilter, setAcFilter] = useState(''); // text after /
  const registry = useMemo(() => getCommandRegistry(), []);
  const allCommands = useMemo(() => registry.list(), [registry]);

  // Notify parent when autocomplete visibility changes
  const acVisibleRef = useRef(acVisible);
  useEffect(() => {
    if (acVisible !== acVisibleRef.current) {
      acVisibleRef.current = acVisible;
      autocompleteActive = acVisible;
      onAutocompleteChange?.(acVisible);
    }
  }, [acVisible, onAutocompleteChange]);

  // Filtered commands based on what user typed after /
  const filtered = useMemo(() => {
    if (!acVisible) return [];
    const q = acFilter.toLowerCase();
    if (!q) return allCommands.slice(0, MAX_AUTOCOMPLETE);
    return allCommands
      .filter(
        (cmd) =>
          fuzzyMatch(q, cmd.name) ||
          (cmd.aliases?.some((a) => fuzzyMatch(q, a)) ?? false) ||
          fuzzyMatch(q, cmd.description)
      )
      .slice(0, MAX_AUTOCOMPLETE);
  }, [acVisible, acFilter, allCommands]);

  // Clamp selection when filter changes
  useEffect(() => {
    setAcIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function showAutocomplete(filter: string): void {
    setAcVisible(true);
    setAcFilter(filter);
    setAcIndex(0);
  }

  function hideAutocomplete(): void {
    setAcVisible(false);
    setAcFilter('');
    setAcIndex(0);
  }

  function selectAutocomplete(): void {
    if (filtered.length === 0) {
      hideAutocomplete();
      return;
    }
    const cmd = filtered[acIndex];
    if (!cmd) {
      hideAutocomplete();
      return;
    }
    // Replace the /<partial> with /<name> and a trailing space
    const insert = `/${cmd.name} `;
    onChange(insert);
    setCursor(insert.length);
    hideAutocomplete();
  }

  // Fresh values from the latest render so the ink handler never goes stale.
  const state = useRef({ value, onChange, onSubmit, history, isEnabled, onEscape, cursor });
  state.current = { value, onChange, onSubmit, history, isEnabled, onEscape, cursor };

  // History navigation. idx === -1 means "editing the fresh line".
  const histIdx = useRef(-1);
  const draft = useRef('');

  // Register/unregister this prompt in the global focus counter.
  useEffect(() => {
    if (!isEnabled) return;
    activePromptCount += 1;
    return () => {
      activePromptCount -= 1;
    };
  }, [isEnabled]);

  useInput((input, key) => {
    const s = state.current;
    if (!s.isEnabled) return;
    const cur = s.cursor;
    const len = s.value.length;

    // --- Autocomplete mode: intercept keys ---
    if (acVisible) {
      // up/down navigate the list
      if (input === '' && key.upArrow) {
        setAcIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        return;
      }
      if (input === '' && key.downArrow) {
        setAcIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        return;
      }
      // enter: select highlighted command
      if (key.return) {
        selectAutocomplete();
        return;
      }
      // escape: close autocomplete, keep text
      if (key.escape) {
        hideAutocomplete();
        return;
      }
      // tab: select and move cursor after command name
      if (input === '\t') {
        selectAutocomplete();
        return;
      }
      // backspace: if filter is empty, close autocomplete; otherwise filter more
      if (key.backspace || key.delete) {
        if (acFilter.length > 0) {
          const newFilter = acFilter.slice(0, -1);
          setAcFilter(newFilter);
          if (newFilter.length === 0) {
            // Show all commands when filter is cleared
            setAcFilter('');
          }
        } else {
          hideAutocomplete();
        }
        return;
      }
      // printable char: append to filter
      if (input.length === 1 && input !== '\n' && input !== '\r' && input !== '\t') {
        // If it's a space, close autocomplete and let normal input handle it
        if (input === ' ') {
          hideAutocomplete();
          return;
        }
        setAcFilter((f) => f + input);
        return;
      }
      // any other key (ctrl+, arrows left/right, etc.): close autocomplete, fall through
      hideAutocomplete();
      // Don't return — let the key be handled normally below
    }

    // ctrl+c: clear a non-empty line; on an empty line exit cleanly.
    if (key.ctrl && input === 'c') {
      if (len > 0) {
        s.onChange('');
        setCursor(0);
        histIdx.current = -1;
        draft.current = '';
      } else {
        exit();
      }
      return;
    }

    // ctrl+d: delete forward; on an empty line preserve the old exit binding.
    if (key.ctrl && input === 'd') {
      if (len === 0) {
        exit();
        return;
      }
      if (cur < len) s.onChange(s.value.slice(0, cur) + s.value.slice(cur + 1));
      return;
    }

    // return: submit (ink flags return on "\r", not on input === '').
    if (key.return) {
      s.onSubmit(s.value);
      return;
    }
    if (key.escape) {
      s.onEscape?.();
      return;
    }

    // alt+b / alt+f: word motion (ink reports these as meta).
    if (key.meta && input === 'b') {
      setCursor(wordStart(s.value, cur));
      return;
    }
    if (key.meta && input === 'f') {
      setCursor(wordForward(s.value, cur));
      return;
    }

    // emacs editing reached with a ctrl+letter (input is the letter).
    if (key.ctrl) {
      if (input === 'a') {
        setCursor(0);
        return;
      }
      if (input === 'e') {
        setCursor(len);
        return;
      }
      if (input === 'u') {
        s.onChange(s.value.slice(cur));
        setCursor(0);
        return;
      }
      if (input === 'k') {
        s.onChange(s.value.slice(0, cur));
        return;
      }
      if (input === 'w') {
        const start = wordStart(s.value, cur);
        s.onChange(s.value.slice(0, start) + s.value.slice(cur));
        setCursor(start);
        return;
      }
      return; // other ctrl+letters go to the App keybind router
    }

    if (input === '') {
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(s.value.length, c + 1));
        return;
      }
      if (key.upArrow) {
        navigateHistory(s, -1);
        return;
      }
      if (key.downArrow) {
        navigateHistory(s, 1);
        return;
      }
      // backspace + delete both delete before the caret (see header note).
      if (key.backspace || key.delete) {
        if (cur > 0) {
          s.onChange(s.value.slice(0, cur - 1) + s.value.slice(cur));
          setCursor(cur - 1);
          // If we just deleted the '/' that was at position 0, close autocomplete
          if (cur === 1 && s.value[0] === '/') {
            hideAutocomplete();
          }
        }
        return;
      }
      return;
    }

    // plain printable char (space included) inserts at the caret.
    if (input.length === 1 && input !== '\n' && input !== '\r' && input !== '\t') {
      const newValue = s.value.slice(0, cur) + input + s.value.slice(cur);
      s.onChange(newValue);
      setCursor(cur + 1);

      // Detect: '/' typed at position 0 → open autocomplete
      if (input === '/' && cur === 0) {
        showAutocomplete('');
      }
      return;
    }
  });

  function navigateHistory(
    s: typeof state.current,
    dir: -1 | 1
  ): void {
    const h = s.history;
    if (h.length === 0) return;
    let idx = histIdx.current;
    if (dir === -1) {
      // up: go older
      if (idx === -1) {
        draft.current = s.value;
        idx = h.length - 1;
      } else if (idx === 0) {
        return;
      } else {
        idx -= 1;
      }
    } else {
      // down: go newer
      if (idx === -1) return;
      idx += 1;
      if (idx >= h.length) {
        const d = draft.current;
        s.onChange(d);
        setCursor(d.length);
        histIdx.current = -1;
        draft.current = '';
        return;
      }
    }
    const v = h[idx];
    s.onChange(v);
    setCursor(v.length);
    histIdx.current = idx;
  }

  const before = value.slice(0, cursor);
  const atCursor = value[cursor] ?? ' ';
  const after = value.slice(cursor + 1);

  return (
    <Box flexDirection="column">
      {/* Autocomplete popup — renders above the input when active */}
      {acVisible && filtered.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1} paddingTop={1} paddingBottom={1}>
          {filtered.map((cmd, i) => {
            const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
            return (
              <Box key={cmd.name} flexDirection="row">
                <Text
                  color={i === acIndex ? theme.primary : theme.header}
                >
                  {` /${cmd.name}`}
                </Text>
                <Text color={i === acIndex ? theme.text : theme.muted}>
                  {` ${cmd.description}${aliases}`}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
      {/* Prompt input */}
      <Box>
        <Text color={isEnabled ? theme.text : theme.muted}>
          <Text>{before}</Text>
          <Text inverse={isEnabled}>{atCursor}</Text>
          <Text>{after}</Text>
        </Text>
      </Box>
    </Box>
  );
}
