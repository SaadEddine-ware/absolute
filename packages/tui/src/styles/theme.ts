import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { useSyncExternalStore } from 'react';
import slate from './themes/slate.json';
import mono from './themes/mono.json';
import ember from './themes/ember.json';

// Theme registry. Built-in themes ship as JSON files in styles/themes; user
// themes are JSON files in ~/.config/absolute/themes/<name>.json. Every theme
// defines both a dark{} and a light{} token set; ui.themeMode picks which one
// applyTheme() activates. The module-level `theme` object is the LIVE active
// variant — components keep `import { theme }` and re-read it on render; a
// theme swap mutates the object in place and bumps a version (useThemeVersion)
// so dynamic surfaces re-render. applyTheme() runs before first paint, so the
// 12 files that only `import { theme }` never need to change.

export type ThemeMode = 'dark' | 'light';

export interface ThemeVariant {
  primary: string;
  accent: string;
  user: string;
  assistant: string;
  system: string;
  text: string;
  muted: string;
  border: string;
  bg: string;
  statusOk: string;
  statusWarn: string;
  statusErr: string;
  header: string;
}

export interface ThemeSpec {
  name: string;
  dark: ThemeVariant;
  light: ThemeVariant;
}

export type Theme = ThemeVariant;

export const THEMES_DIR = join(homedir(), '.config', 'absolute', 'themes');

const TOKEN_KEYS = Object.keys({
  primary: 1,
  accent: 1,
  user: 1,
  assistant: 1,
  system: 1,
  text: 1,
  muted: 1,
  border: 1,
  bg: 1,
  statusOk: 1,
  statusWarn: 1,
  statusErr: 1,
  header: 1,
}) as Array<keyof ThemeVariant>;

const builtinSpecs: Record<string, ThemeSpec> = {
  slate: slate as ThemeSpec,
  mono: mono as ThemeSpec,
  ember: ember as ThemeSpec,
};

function isVariant(v: unknown): v is ThemeVariant {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return TOKEN_KEYS.every((k) => typeof o[k] === 'string');
}

// Live active variant. Mutated in place by applyTheme().
export const theme: ThemeVariant = { ...builtinSpecs.slate.dark };

export interface ApplyThemeResult {
  name: string;
  mode: ThemeMode;
  warned?: string;
}

let applied: ApplyThemeResult = { name: 'slate', mode: 'dark' };
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to theme swaps. Returns the current version; App calls this at the
 *  root so ANY theme change re-renders the whole tree (all children re-read the
 *  live `theme` object). */
export function useThemeVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => version
  );
}

export function getThemeVersion(): number {
  return version;
}

export function getAppliedTheme(): ApplyThemeResult {
  return { ...applied };
}

function readUserSpec(name: string): ThemeSpec | null {
  // Folders are imported as a directory vs file; only *.json files count.
  if (name !== '' && !/^[\w.-]+$/.test(name)) return null;
  const file = join(THEMES_DIR, `${name}.json`);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
    const dark = isVariant(raw.dark) ? raw.dark : undefined;
    const light = isVariant(raw.light) ? raw.light : undefined;
    if (!dark && !light) return null;
    return {
      name,
      dark: dark ?? (light as ThemeVariant),
      light: light ?? (dark as ThemeVariant),
    };
  } catch {
    return null;
  }
}

/** Built-in or user theme, resolved by name. */
export function getThemeSpec(name: string): ThemeSpec | null {
  return builtinSpecs[name] ?? readUserSpec(name);
}

export interface ThemeMeta {
  name: string;
  source: 'builtin' | 'user';
}

/** All available themes (built-ins first, then user themes from disk). */
export function listThemes(): ThemeMeta[] {
  const out: ThemeMeta[] = Object.keys(builtinSpecs).map((name) => ({
    name,
    source: 'builtin' as const,
  }));
  if (!existsSync(THEMES_DIR)) return out;
  try {
    for (const entry of readdirSync(THEMES_DIR)) {
      if (!entry.endsWith('.json')) continue;
      const name = entry.slice(0, -'.json'.length);
      if (getThemeSpec(name)) out.push({ name, source: 'user' });
    }
  } catch {
    // unreadable themes dir: skip user themes
  }
  return out;
}

/** A resolved variant for a spec, previewable without applying. */
export function variantFor(spec: ThemeSpec, mode: ThemeMode): ThemeVariant {
  return spec[mode];
}

/**
 * Activate a theme (built-in or user). Unknown/missing/corrupt themes fall
 * back to slate with a warning; calling with the currently-applied theme is a
 * no-op. Returns what was actually applied.
 */
export function applyTheme(name?: string, mode: ThemeMode = 'dark'): ApplyThemeResult {
  const target = name && name !== '' ? name : 'slate';
  if (applied.name === target && applied.mode === mode) return applied;
  const spec = getThemeSpec(target);
  let result: ApplyThemeResult;
  if (!spec) {
    Object.assign(theme, builtinSpecs.slate[mode]);
    result = { name: 'slate', mode, warned: `unknown theme "${target}", falling back to slate` };
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[absolute] ${result.warned}\n`);
    }
  } else {
    Object.assign(theme, spec[mode]);
    result = { name: spec.name, mode };
  }
  applied = result;
  version += 1;
  notify();
  return result;
}