import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ThemeMode } from '../styles/theme.js';
import type { KeyAction } from './keybinds.js';

export interface UiConfig {
  /** Theme name (built-in or ~/.config/absolute/themes/<name>.json). */
  theme?: string;
  /** Dark/light token set to load. Defaults to 'dark'. */
  themeMode?: ThemeMode;
  /** Action → KeySpec overrides for the TUI keybinds. */
  keybindings?: Partial<Record<KeyAction, string>>;
}

export interface AbsoluteConfig {
  provider?: string;
  model?: string;
  memory?: {
    embeddingWorkerUrl?: string;
    embeddingProvider?: 'cloudflare' | 'local';
    embeddingModelId?: string;
    embeddingDimensions?: number;
    embeddingCacheDir?: string;
    similarityThreshold?: number;
    maxTokensPerSession?: number;
    retentionDays?: number;
  };
  /** Back-compat: pre-Phase-9 top-level theme name. Folded into ui.theme. */
  theme?: string;
  ui?: UiConfig;
}

export interface ResolvedUiConfig {
  theme: string;
  themeMode: ThemeMode;
  keybindings?: Partial<Record<KeyAction, string>>;
}

/** Merge the legacy top-level `theme` key into ui.theme (ui wins). */
export function resolveUiConfig(config: AbsoluteConfig): ResolvedUiConfig {
  return {
    theme: config.ui?.theme ?? config.theme ?? 'slate',
    themeMode: config.ui?.themeMode ?? 'dark',
    keybindings: config.ui?.keybindings,
  };
}

const CONFIG_DIR = join(homedir(), '.config', 'absolute');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function loadConfig(): AbsoluteConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function getDataDir(): string {
  const dir = join(homedir(), '.local', 'share', 'absolute');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return join(getDataDir(), 'absolute.db');
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function saveConfig(config: AbsoluteConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}