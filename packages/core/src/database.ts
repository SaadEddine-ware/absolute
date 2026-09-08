import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { v4 as uuid } from 'uuid';
import { load as loadSqliteVecExt } from 'sqlite-vec';
import type { EmbeddingProvider } from './embedding/types.js';
import type { EmbeddingMetadata } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DatabaseConfig {
  dbPath: string;
  embeddingProvider: EmbeddingProvider;
  skipEmbeddingValidation?: boolean;
}

export interface AbsoluteDatabase {
  db: Database.Database;
  embeddingProvider: EmbeddingProvider;
}

export async function openDatabase(config: DatabaseConfig): Promise<AbsoluteDatabase> {
  const db = new Database(config.dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  loadSqliteVec(db);
  await runMigrations(db, config.embeddingProvider);
  if (!config.skipEmbeddingValidation) {
    validateEmbeddingMetadata(db, config.embeddingProvider);
  }

  return { db, embeddingProvider: config.embeddingProvider };
}

function loadSqliteVec(db: Database.Database): void {
  try {
    loadSqliteVecExt(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already loaded')) return;
    console.error('Failed to load sqlite-vec extension:', msg);
    console.error('Install it: npm install sqlite-vec');
    process.exit(1);
  }
}

function runMigrations(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider
): Promise<void> {
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = db
    .prepare('SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1')
    .get() as { id: number } | undefined;
  const highestApplied = applied?.id ?? 0;

  const migrationsDir = join(__dirname, 'migrations');
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => /^\d+_.+(\.sql|\.mjs)$/.test(f))
      .sort();
  } catch {
    files = [];
  }

  const toRun: Array<{ id: number; file: string }> = [];
  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)$/);
    if (!match) continue;
    const migrationId = parseInt(match[1], 10);
    if (migrationId <= highestApplied) continue;
    toRun.push({ id: migrationId, file });
  }

  return toRun.reduce(async (chain, m) => {
    await chain;
    const label = m.file.replace(/\.(sql|mjs)$/, '');
    await runOneMigration(db, embeddingProvider, m.id, m.file, label);
  }, Promise.resolve()).then(() => {
    db.pragma('foreign_keys = ON');
  });
}

async function runOneMigration(
  db: Database.Database,
  embeddingProvider: EmbeddingProvider,
  migrationId: number,
  file: string,
  label: string
): Promise<void> {
  const migrationsDir = join(__dirname, 'migrations');
  const ext = file.endsWith('.mjs') ? 'mjs' : 'sql';

  if (ext === 'sql') {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Applying migration ${migrationId}: ${label}`);
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migrationId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Migration ${file} failed: ${msg}`);
      process.exit(1);
    }
    return;
  }

  // Async (.mjs) migration: executed as an atomic DB transaction. The runner
  // has foreign_keys OFF for the whole pass (these migrations recreate tables).
  const url = urlPathToFileUrl(join(migrationsDir, file));
  console.log(`Applying migration ${migrationId}: ${label}`);
  db.exec('BEGIN TRANSACTION');
  try {
    const mod = (await import(url)) as {
      upDB?: (
        db: Database.Database,
        options: { embeddingProvider: EmbeddingProvider; log: (msg: string) => void }
      ) => Promise<void>;
    };
    if (typeof mod.upDB !== 'function') {
      throw new Error(`Migration ${file} does not export an upDB(db, options) function`);
    }
    await mod.upDB(db, {
      embeddingProvider,
      log: (msg) => console.log(`  ${msg}`),
    });
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migrationId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Migration ${file} failed: ${msg}`);
    process.exit(1);
  }
}

function urlPathToFileUrl(absPath: string): string {
  return pathToFileURL(absPath).href;
}

function validateEmbeddingMetadata(
  db: Database.Database,
  provider: EmbeddingProvider
): void {
  const row = db
    .prepare('SELECT model_id, dimensions FROM embedding_metadata WHERE id = 1')
    .get() as EmbeddingMetadata | undefined;

  if (!row) {
    db.prepare(
      'INSERT INTO embedding_metadata (id, model_id, dimensions) VALUES (1, ?, ?)'
    ).run(provider.modelId, provider.dimensions);
    return;
  }

  if (row.model_id !== provider.modelId || row.dimensions !== provider.dimensions) {
    console.error(
      `\nEmbedding provider mismatch: database was built with "${row.model_id}" ` +
      `(${row.dimensions} dims) but the current provider is "${provider.modelId}" ` +
      `(${provider.dimensions} dims).\n` +
      `Run \`absolute migrate embeddings\` before continuing.\n`
    );
    process.exit(1);
  }
}

export function generateId(): string {
  return uuid();
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
