import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const AUTH_DIR = join(homedir(), '.config', 'absolute', 'auth');
const AUTH_FILE = join(AUTH_DIR, 'credentials.json');

interface StoredCredential {
  provider: string;
  key: string;
  storedAt: string;
}

async function tryKeytar(): Promise<typeof import('keytar') | null> {
  try {
    const keytar = await import('keytar');
    return keytar.default ?? keytar;
  } catch {
    return null;
  }
}

function loadCredentialsFile(): StoredCredential[] {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function storeCredential(provider: string, key: string): Promise<void> {
  const keytar = await tryKeytar();
  if (keytar) {
    try {
      await keytar.setPassword('absolute', provider, key);
      return;
    } catch {
      // keytar present but non-functional — fall through to the 0600 file.
    }
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  const existing = loadCredentialsFile();
  const entry: StoredCredential = { provider, key, storedAt: new Date().toISOString() };
  const idx = existing.findIndex((c) => c.provider === provider);
  if (idx >= 0) existing[idx] = entry;
  else existing.push(entry);
  writeFileSync(AUTH_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  chmodSync(AUTH_FILE, 0o600);
}

export async function getCredential(provider: string): Promise<string | null> {
  const keytar = await tryKeytar();
  if (keytar) {
    try {
      const key = await keytar.getPassword('absolute', provider);
      if (key) return key;
    } catch {
      // fall through to the 0600 file.
    }
  }

  if (!existsSync(AUTH_FILE)) return null;
  return loadCredentialsFile().find((c) => c.provider === provider)?.key ?? null;
}

export async function deleteCredential(provider: string): Promise<boolean> {
  const keytar = await tryKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword('absolute', provider);
    } catch {
      // fall through
    }
  }

  if (!existsSync(AUTH_FILE)) return false;
  const filtered = loadCredentialsFile().filter((c) => c.provider !== provider);
  if (filtered.length === loadCredentialsFile().length) return false;
  writeFileSync(AUTH_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}