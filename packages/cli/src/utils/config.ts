import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface AbsoluteConfig {
  provider?: string;
  model?: string;
  memory?: {
    embeddingWorkerUrl?: string;
    embeddingProvider?: 'cloudflare' | 'local';
    embeddingModelId?: string;
    similarityThreshold?: number;
    maxTokensPerSession?: number;
    retentionDays?: number;
  };
  theme?: string;
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

export function saveConfig(config: AbsoluteConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getDataDir(): string {
  const dir = join(homedir(), '.local', 'share', 'absolute');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return join(getDataDir(), 'absolute.db');
}
