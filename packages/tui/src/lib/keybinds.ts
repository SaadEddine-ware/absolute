// Configurable keybindings for the TUI. A KeySpec is a whitespace-separated
// chord of key tokens, e.g. "ctrl+x t" (leader + key) or "pgup". Every action
// has a default binding; user overrides in config.ui.keybindings replace the
// default's binding list wholesale. An invalid override falls back to the
// default with a one-line warning (never crashes startup).
//
// Readline editing keys are deliberately not part of this catalog — they are
// handled inside PromptInput and are standard, so they are not rebindable.

export type KeyAction =
  | 'view_chat'
  | 'view_sessions'
  | 'view_memories'
  | 'view_settings'
  | 'cycle_screens'
  | 'toggle_ask'
  | 'command_palette'
  | 'help_overlay'
  | 'themes_picker'
  | 'sidebar_status'
  | 'scroll_page_up'
  | 'scroll_page_down'
  | 'scroll_line_up'
  | 'scroll_line_down';

export const KEY_ACTIONS: KeyAction[] = [
  'view_chat',
  'view_sessions',
  'view_memories',
  'view_settings',
  'cycle_screens',
  'toggle_ask',
  'command_palette',
  'help_overlay',
  'themes_picker',
  'sidebar_status',
  'scroll_page_up',
  'scroll_page_down',
  'scroll_line_up',
  'scroll_line_down',
];

const NAMED_KEYS = new Set([
  'pgup',
  'pgdn',
  'enter',
  'esc',
  'tab',
  'backspace',
  'del',
  'delete',
  'home',
  'end',
  'up',
  'down',
  'left',
  'right',
  'space',
]);

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift'] as const;
const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);

// Single-printable-char token (a-z, 0-9, '?'). Modifiers are prefix segments
// separated by '+', e.g. "ctrl+t", "alt+up".
const PLAIN_CHAR_RE = /^[a-z0-9?]$/;

export interface InkKey {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  home?: boolean;
  end?: boolean;
  space?: boolean;
}

/** Serialize one ink key press into a canonical key token (e.g. "ctrl+x"). */
export function serializePress(input: string, key: InkKey): string {
  let base: string;
  if (key.pageUp) base = 'pgup';
  else if (key.pageDown) base = 'pgdn';
  else if (key.return) base = 'enter';
  else if (key.escape) base = 'esc';
  else if (key.tab) base = 'tab';
  else if (key.backspace) base = 'backspace';
  else if (key.delete) base = 'del';
  else if (key.home) base = 'home';
  else if (key.end) base = 'end';
  else if (key.upArrow) base = 'up';
  else if (key.downArrow) base = 'down';
  else if (key.leftArrow) base = 'left';
  else if (key.rightArrow) base = 'right';
  else if (key.space || input === ' ') base = 'space';
  else base = input.toLowerCase() || '';
  if (!base) return '';
  const mods: string[] = [];
  if (key.ctrl) mods.push('ctrl');
  if (key.meta || key.alt) mods.push('alt');
  if (key.shift) mods.push('shift');
  return [...mods, base].join('+');
}

/** Validate + canonicalize a single key token; null when malformed. */
export function canonicalToken(token: string): string | null {
  const raw = token.trim().toLowerCase();
  const parts = raw.split('+');
  if (parts.length === 0) return null;
  const base = parts[parts.length - 1];
  if (!NAMED_KEYS.has(base) && !PLAIN_CHAR_RE.test(base)) return null;
  const mods = parts.slice(0, -1);
  if (mods.length === 0 && parts.length > 1) return null;
  for (const m of mods) {
    if (!MODIFIER_SET.has(m)) return null;
  }
  const ordered = MODIFIER_ORDER.filter((m) => mods.includes(m));
  return [...ordered, base].join('+');
}

/** Parse a KeySpec into canonical press tokens (the chord); null when invalid. */
export function parsePressList(spec: string): string[] | null {
  const tokens = spec.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const presses: string[] = [];
  for (const token of tokens) {
    const c = canonicalToken(token);
    if (!c) return null;
    presses.push(c);
  }
  return presses;
}

export interface KeyBindingDef {
  keys: string[];
  label: string;
}

export interface ResolvedBinding {
  action: KeyAction;
  label: string;
  /** Possibilities; each is an ordered array of canonical press tokens. */
  chords: string[][];
  /** Display text, e.g. "ctrl+x t". */
  keysText: string;
  /** True when a chord contains a bare printable char that must only trigger
   *  when the prompt input is NOT focused (so "?" can still be typed). */
  consumesTypedChars: boolean;
}

export const DEFAULT_KEYMAP: Record<KeyAction, KeyBindingDef> = {
  view_chat: { keys: ['ctrl+t'], label: 'Chat view' },
  view_sessions: { keys: ['ctrl+l'], label: 'Sessions view' },
  view_memories: { keys: ['ctrl+r'], label: 'Memories view' },
  view_settings: { keys: ['ctrl+e'], label: 'Settings view' },
  cycle_screens: { keys: ['tab'], label: 'Cycle screens' },
  toggle_ask: { keys: ['ctrl+g'], label: 'Toggle topic-confirm (ask)' },
  command_palette: { keys: ['ctrl+p'], label: 'Command palette' },
  help_overlay: { keys: ['?', 'ctrl+h'], label: 'Help' },
  themes_picker: { keys: ['ctrl+x t'], label: 'Themes picker' },
  sidebar_status: { keys: ['ctrl+x s'], label: 'Toggle technical sidebar' },
  scroll_page_up: { keys: ['pgup'], label: 'Scroll up (page)' },
  scroll_page_down: { keys: ['pgdn'], label: 'Scroll down (page)' },
  scroll_line_up: { keys: ['alt+up'], label: 'Scroll up (line)' },
  scroll_line_down: { keys: ['alt+down'], label: 'Scroll down (line)' },
};

function warn(message: string): void {
  if (typeof process !== 'undefined' && process.stderr) {
    process.stderr.write(`[absolute] ${message}\n`);
  }
}

/** Resolve the effective keymap from config overrides (fallback per action). */
export function resolveKeymap(raw: Partial<Record<KeyAction, string>> | undefined): ResolvedBinding[] {
  return KEY_ACTIONS.map((action) => {
    const def = DEFAULT_KEYMAP[action];
    let keys = def.keys;
    const overrideRaw = raw?.[action];
    if (overrideRaw !== undefined && overrideRaw !== '') {
      if (parsePressList(overrideRaw)) {
        keys = [overrideRaw];
      } else {
        warn(
          `ignoring invalid keybinding for ${action}: "${overrideRaw}" (using default "${def.keys.join(' ')}")`
        );
      }
    }
    const chords = keys
      .map((k) => parsePressList(k))
      .filter((c): c is string[] => c !== null);
    const consumesTypedChars = chords.some((c) => c.some((p) => PLAIN_CHAR_RE.test(p)));
    return {
      action,
      label: def.label,
      chords,
      keysText: keys.join(' '),
      consumesTypedChars,
    };
  });
}

/** Longest full-chord match against the running press history tail. */
export function matchBinding(bindings: ResolvedBinding[], history: string[]): ResolvedBinding | null {
  let best: ResolvedBinding | null = null;
  let bestLen = 0;
  for (const binding of bindings) {
    for (const chord of binding.chords) {
      if (chord.length === 0 || chord.length > history.length) continue;
      const tail = history.slice(history.length - chord.length);
      let ok = true;
      for (let i = 0; i < chord.length; i += 1) {
        if (tail[i] !== chord[i]) {
          ok = false;
          break;
        }
      }
      if (ok && chord.length > bestLen) {
        best = binding;
        bestLen = chord.length;
      }
    }
  }
  return best;
}

/** Bindings whose chord starts with the pending history tail (which-key). */
export function pendingBindings(bindings: ResolvedBinding[], history: string[]): ResolvedBinding[] {
  if (history.length === 0) return [];
  return bindings.filter((b) =>
    b.chords.some(
      (c) => c.length > history.length && c.slice(0, history.length).every((p, i) => p === history[i])
    )
  );
}

/** Next press shown in a which-key hint for a chord under the pending tail. */
export function chordNext(chord: string[], history: string[]): string | null {
  if (chord.length <= history.length) return null;
  return chord[history.length];
}