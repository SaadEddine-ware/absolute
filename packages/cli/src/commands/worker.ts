import { Command } from 'commander';
import {
  openDatabase,
  migrateEmbeddings,
  CloudflareProvider,
  LocalProvider,
  LOCAL_MODELS,
  getWorkerStatus,
  estimateMigrationImpact,
  validateCloudWorker,
  verifyProviderMatchesDb,
  type WorkerMode,
  type WorkerStatus,
  type EmbeddingProvider,
} from '@absolute/core';
import { loadConfig, saveConfig, getDbPath, type AbsoluteConfig } from '../utils/config.js';
import { getCredential, storeCredential } from '../utils/auth.js';
import { confirm, promptPassword } from '../utils/prompt.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface WorkerTarget {
  mode: WorkerMode;
  modelId: string;
  dimensions: number;
  workerUrl?: string;
  cacheDir?: string;
}

interface ConfiguredEmbedding {
  mode: WorkerMode;
  modelId: string | null;
  dimensions: number | null;
}

export function workerCommand(program: Command): void {
  const worker = program
    .command('worker')
    .description('Manage the embedding worker (local vs cloud)');

  worker
    .command('status')
    .description('Show current embedding worker status and vector health')
    .action(runStatus);

  const set = worker
    .command('set')
    .description('Set the embedding worker to cloud or local');

  set
    .command('cloud <url>')
    .description('Configure the Cloudflare embedding worker. Probes it, then safely migrates if dimensions changed.')
    .option('-t, --token <token>', 'Worker API token (Authorization: Bearer)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(runSetCloud);

  set
    .command('local')
    .description('Configure local embeddings via transformers.js. Downloads the model on first use.')
    .option('-m, --model <model>', `Local model id (default: bge-base-en-v1.5). Options: ${Object.keys(LOCAL_MODELS).join(', ')}`)
    .option('-v, --verify', 'Run one embedding to confirm real model dimensions (downloads model)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(runSetLocal);
}

function readConfiguredEmbedding(config: AbsoluteConfig): ConfiguredEmbedding {
  const provider = config.memory?.embeddingProvider;
  if (provider === 'local') {
    const modelId = config.memory?.embeddingModelId ?? 'bge-base-en-v1.5';
    return {
      mode: 'local',
      modelId: `local:${modelId}`,
      dimensions: config.memory?.embeddingDimensions ?? LOCAL_MODELS[modelId] ?? 768,
    };
  }
  if (provider === 'cloudflare') {
    return {
      mode: 'cloud',
      modelId: config.memory?.embeddingModelId ?? null,
      dimensions: config.memory?.embeddingDimensions ?? null,
    };
  }
  return { mode: 'none', modelId: null, dimensions: null };
}

async function runStatus(): Promise<void> {
  const config = loadConfig();
  const configured = readConfiguredEmbedding(config);
  const token = configured.mode === 'cloud'
    ? await getCredential('cloudflare')
    : null;

  let db;
  try {
    const opened = openDatabase({
      dbPath: getDbPath(),
      embeddingProvider: createAnyProvider(config),
      skipEmbeddingValidation: true,
    });
    db = opened.db;
  } catch (e) {
    console.error('Could not open database:');
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const status = getWorkerStatus(db, configured);

  printStatus(status, configured, { tokenStored: token !== null });
  db.close();
}

function printStatus(
  status: WorkerStatus,
  configured: ConfiguredEmbedding,
  flags: { tokenStored: boolean }
): void {
  const mode = configured.mode;
  const cfg = loadConfig();

  console.log('=== Embedding Worker Status ===\n');
  console.log(`Configured mode  : ${mode === 'none' ? 'not set' : mode}`);
  if (mode !== 'none') {
    console.log(`Model            : ${configured.modelId ?? 'unknown'}`);
    console.log(`Configured dims  : ${configured.dimensions ?? 'unknown'}`);
    if (mode === 'cloud') {
      console.log(`Worker URL       : ${cfg.memory?.embeddingWorkerUrl ?? '(none)'}`);
    }
    const tokenFlag =
      mode === 'cloud'
        ? flags.tokenStored ? 'yes' : 'no (run `absolute worker set cloud <url> --token <t>`)'
        : 'n/a';
    console.log(`Token stored     : ${tokenFlag}`);
    if (mode === 'local') {
      console.log(`Cache dir        : ${cfg.memory?.embeddingCacheDir ?? '(default)'}`);
    }
  }
  console.log('');
  console.log('=== Database vector state ===');
  console.log(`DB recorded model: ${status.dbModelId ?? '(none — fresh DB)'}`);
  console.log(`DB recorded dims : ${status.dbDimensions ?? '(none)'}`);
  console.log(`memory_vectors   : FLOAT[${status.memoryVecDimensions ?? '?'}]`);
  console.log(`goal_vectors     : FLOAT[${status.goalVecDimensions ?? '?'}]`);
  console.log(`memories in DB   : ${status.memoriesCount} (${status.memoriesVectorized} vectorized)`);
  console.log(`goals in DB      : ${status.goalsCount} (${status.goalsVectorized} vectorized)`);
  console.log('');
  console.log(`State            : ${status.consistent ? 'OK — vectors match configured provider' : 'DANGER — mismatch detected'}`);
  console.log(`Migration needed : ${status.migrationNeeded ? 'yes' : 'no'}`);

  if (status.issues.length > 0) {
    console.log('\n=== Issues found ===');
    for (const issue of status.issues) {
      console.log(`  ! ${issue}`);
    }
  }
}

async function runSetCloud(url: string, opts: { token?: string; yes?: boolean }): Promise<void> {
  let token = opts.token;
  if (!token) {
    token = (await getCredential('cloudflare')) ?? undefined;
  }
  if (!token) {
    token = (await promptPassword('Cloudflare worker token (Bearer):')) ?? undefined;
    if (!token) {
      console.error('No token provided. Pass --token <token>, or run again interactively.');
      process.exit(1);
    }
  }

  console.log(`Probing embedding worker at ${url}...`);
  const probe = await validateCloudWorker(url, { apiToken: token, timeoutMs: 8000 });
  if (!probe.ok) {
    console.error(`\nWorker probe failed:\n  ${probe.error}\nNo changes were made.`);
    process.exit(1);
  }

  console.log(`  model: ${probe.modelId}`);
  console.log(`  dimensions: ${probe.dimensions}\n`);

  await storeCredential('cloudflare', token);

  const provider = new CloudflareProvider({
    workerUrl: url,
    apiToken: token,
    modelId: probe.modelId,
    dimensions: probe.dimensions,
    timeoutMs: 8000,
  });

  const { db } = openDatabase({
    dbPath: getDbPath(),
    embeddingProvider: provider,
    skipEmbeddingValidation: true,
  });

  await verifyAndSwitch(db, provider, {
    mode: 'cloud',
    modelId: probe.modelId,
    dimensions: probe.dimensions,
    workerUrl: url,
  }, { autoConfirm: Boolean(opts.yes) });

  db.close();
}

async function runSetLocal(opts: {
  model?: string;
  verify?: boolean;
  yes?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const modelId = opts.model ?? config.memory?.embeddingModelId ?? 'bge-base-en-v1.5';

  let dimensions = LOCAL_MODELS[modelId];
  if (!dimensions && !opts.verify) {
    console.error(
      `Unknown model "${modelId}". Known local models: ${Object.keys(LOCAL_MODELS).join(', ')}. ` +
      `Or pass --verify to inspect the real model dimensions.`
    );
    process.exit(1);
  }

  const cacheDir =
    config.memory?.embeddingCacheDir ?? join(homedir(), '.cache', 'absolute', 'embeddings');

  const provider = new LocalProvider({ modelId, cacheDir });

  if (dimensions === undefined || opts.verify) {
    console.log('Initializing local embedding model (downloads weights on first run)...');
    const probe = await provider.probe();
    if (!probe.ok) {
      console.error(`\nLocal embedding probe failed:\n  ${probe.error}\nNo changes were made.`);
      process.exit(1);
    }
    dimensions = probe.dimensions;
    console.log(`  model: ${provider.modelId}`);
    console.log(`  dimensions: ${dimensions}\n`);
  } else {
    console.log(`Configuring local model "${modelId}" (${dimensions} dims).`);
    console.log('The model downloads on first use. Add --verify to confirm real dimensions now.\n');
  }

  const { db } = openDatabase({
    dbPath: getDbPath(),
    embeddingProvider: provider,
    skipEmbeddingValidation: true,
  });

  await verifyAndSwitch(db, provider, {
    mode: 'local',
    modelId: `local:${modelId}`,
    dimensions,
    cacheDir,
  }, { autoConfirm: Boolean(opts.yes) });

  db.close();
}

async function verifyAndSwitch(
  db: import('better-sqlite3').Database,
  provider: EmbeddingProvider,
  target: WorkerTarget,
  opts: { autoConfirm: boolean }
): Promise<void> {
  const check = verifyProviderMatchesDb(db, provider);
  if (!check.ok) {
    console.error(`\nCannot switch: ${check.error}`);
    process.exit(1);
  }

  const oldDims = getCurrentDimsText(db);

  if (!check.changed) {
    console.log(`Provider "${provider.modelId}" (${provider.dimensions} dims) already matches the database.`);
    persistConfig(target);
    console.log('  Config updated. Nothing else to do.\n');
    return;
  }

  const impact = estimateMigrationImpact(db, provider);
  console.log('A switch will change the embedding provider:');
  console.log(`  ${impact.oldModelId} (${oldDims}) -> ${provider.modelId} (${provider.dimensions} dims)`);
  console.log(`  Memories to re-embed: ${impact.memoriesCount}`);
  console.log(`  Goals to re-embed   : ${impact.goalsCount}`);
  if (impact.dimensionsChanged) {
    console.log('  Vector tables will be RECREATED at the new dimension.');
  }
  console.log('  Adaptive threshold will reset to 0.6.\n');

  const nothingToMigrate = impact.memoriesCount === 0 && impact.goalsCount === 0;
  if (!nothingToMigrate && !opts.autoConfirm) {
    const ok = await confirm('Migration is required. Run it now?', 'yes');
    if (!ok) {
      console.error('\nMigration declined. No changes were made — provider config was NOT changed.');
      process.exit(1);
    }
  }

  console.log('Migrating embeddings...');
  const result = await migrateEmbeddings(db, provider);
  console.log(`  Memories re-embedded: ${result.memoriesReembed}`);
  console.log(`  Goals re-embedded   : ${result.goalsReembed}`);
  if (result.dimensionsChanged) {
    console.log('  Vector tables recreated.');
  }
  console.log('  Adaptive threshold reset to 0.6.\n');

  persistConfig(target);
  console.log(`Provider switched to "${target.modelId}" (${target.dimensions} dims). State is consistent.\n`);
  db.pragma('wal_checkpoint(TRUNCATE)');
}

function getCurrentDimsText(db: import('better-sqlite3').Database): string {
  const row = db
    .prepare('SELECT dimensions FROM embedding_metadata WHERE id = 1')
    .get() as { dimensions: number } | undefined;
  return row ? `${row.dimensions} dims` : 'fresh DB';
}

function persistConfig(target: WorkerTarget): void {
  const config = loadConfig();
  if (!config.memory) config.memory = {};

  if (target.mode === 'none') {
    config.memory.embeddingProvider = undefined;
  } else {
    config.memory.embeddingProvider = target.mode as 'cloudflare' | 'local';
    config.memory.embeddingModelId = target.modelId.replace(/^(cloudflare|local):/, '');
    config.memory.embeddingDimensions = target.dimensions;
  }

  if (target.workerUrl) {
    config.memory.embeddingWorkerUrl = target.workerUrl;
  }

  if (target.cacheDir) {
    config.memory.embeddingCacheDir = target.cacheDir;
  }

  saveConfig(config);
}

function createAnyProvider(config: AbsoluteConfig): EmbeddingProvider {
  const provider = config.memory?.embeddingProvider;
  if (provider === 'local') {
    const modelId = config.memory?.embeddingModelId ?? 'bge-base-en-v1.5';
    return new LocalProvider({ modelId });
  }
  const workerUrl = config.memory?.embeddingWorkerUrl ?? 'http://localhost:8787';
  return new CloudflareProvider({ workerUrl });
}