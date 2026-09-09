import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

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

export function getDataDir(): string {
  const dir = join(homedir(), '.local', 'share', 'absolute');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return join(getDataDir(), 'absolute.db');
}