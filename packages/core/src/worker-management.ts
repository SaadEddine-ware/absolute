import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embedding/types.js';
import { getVec0Dimension, getEmbeddingMetadata } from './context-detect.js';

export type WorkerMode = 'cloud' | 'local' | 'none';

export interface WorkerStatus {
  mode: WorkerMode;
  modelId: string | null;
  dimensions: number | null;
  dbModelId: string | null;
  dbDimensions: number | null;
  memoryVecDimensions: number | null;
  goalVecDimensions: number | null;
  memoriesCount: number;
  goalsCount: number;
  memoriesVectorized: number;
  goalsVectorized: number;
  consistent: boolean;
  migrationNeeded: boolean;
  issues: string[];
}

export interface MigrationImpact {
  memoriesCount: number;
  goalsCount: number;
  dimensionsChanged: boolean;
  oldModelId: string;
  newModelId: string;
  tokensEstimate: number;
}

export type ProviderProbe =
  | {
      ok: true;
      modelId: string;
      dimensions: number;
    }
  | {
      ok: false;
      error: string;
    };

export function getWorkerStatus(
  db: Database.Database,
  configured: {
    mode: WorkerMode;
    modelId: string | null;
    dimensions: number | null;
  }
): WorkerStatus {
  const meta = getEmbeddingMetadata(db);
  const memoryVecDimensions = getVec0Dimension(db, 'memory_vectors');
  const goalVecDimensions = getVec0Dimension(db, 'goal_vectors');

  const memoriesCount = count(db, 'memories');
  const goalsCount = count(db, 'goals');
  const memoriesVectorized = count(db, 'memory_vectors');
  const goalsVectorized = count(db, 'goal_vectors');

  const issues: string[] = [];

  if (configured.mode === 'none') {
    issues.push('No embedding worker is configured. Run `absolute worker set cloud` or `absolute worker set local`.');
  }

  if (configured.dimensions && meta) {
    if (configured.dimensions !== meta.dimensions) {
      issues.push(
        `Configured provider emits ${configured.dimensions} dims (${configured.modelId}) but the database was built with ${meta.dimensions} dims (${meta.model_id}). ` +
        `Run \`absolute migrate embeddings\` before use — do not mix vector spaces.`
      );
    }
  }

  if (memoryVecDimensions && configured.dimensions && memoryVecDimensions !== configured.dimensions) {
    issues.push(
      `memory_vectors table is FLOAT[${memoryVecDimensions}] but the configured provider emits ${configured.dimensions} dims. Migration required.`
    );
  }

  if (memoryVecDimensions && goalVecDimensions && memoryVecDimensions !== goalVecDimensions) {
    issues.push(
      `Inconsistent vector tables: memory_vectors=${memoryVecDimensions} dims, goal_vectors=${goalVecDimensions} dims. Run \`absolute migrate embeddings\`.`
    );
  }

  if (memoriesCount > memoriesVectorized || goalsCount > goalsVectorized) {
    issues.push(
      `${memoriesCount - memoriesVectorized} memories and/or ${goalsCount - goalsVectorized} goals have no stored vector. ` +
      `Run \`absolute migrate embeddings\` to backfill.`
    );
  }

  const consistent =
    configured.dimensions !== null &&
    meta !== null &&
    configured.dimensions === meta.dimensions &&
    configured.modelId === meta.model_id &&
    memoryVecDimensions === configured.dimensions &&
    goalVecDimensions === configured.dimensions;

  return {
    mode: configured.mode,
    modelId: configured.modelId,
    dimensions: configured.dimensions,
    dbModelId: meta?.model_id ?? null,
    dbDimensions: meta?.dimensions ?? null,
    memoryVecDimensions,
    goalVecDimensions,
    memoriesCount,
    goalsCount,
    memoriesVectorized,
    goalsVectorized,
    consistent,
    migrationNeeded:
      configured.dimensions !== null &&
      meta !== null &&
      (configured.dimensions !== meta.dimensions || configured.modelId !== meta.model_id),
    issues,
  };
}

export function estimateMigrationImpact(
  db: Database.Database,
  provider: EmbeddingProvider
): MigrationImpact {
  const meta = getEmbeddingMetadata(db);

  const memoriesCount = count(db, 'memories');
  const goalsCount = count(db, 'goals');

  const tokensEstimate =
    (sumColumn(db, 'memories', 'tokens_est') || 0) +
    estimateGoalTokens(db);

  return {
    memoriesCount,
    goalsCount,
    dimensionsChanged: meta ? meta.dimensions !== provider.dimensions : true,
    oldModelId: meta?.model_id ?? 'none',
    newModelId: provider.modelId,
    tokensEstimate,
  };
}

export async function validateCloudWorker(
  workerUrl: string,
  opts: { apiToken?: string; timeoutMs?: number } = {}
): Promise<ProviderProbe> {
  const { CloudflareProvider } = await import('./embedding/cloudflare-provider.js');
  const provider = new CloudflareProvider({
    workerUrl,
    apiToken: opts.apiToken,
    timeoutMs: opts.timeoutMs ?? 5000,
  });
  return provider.probe();
}

export function verifyProviderMatchesDb(
  db: Database.Database,
  provider: EmbeddingProvider
): { ok: true; changed: boolean; dimensionsChanged: boolean } | { ok: false; error: string } {
  const meta = getEmbeddingMetadata(db);

  if (!meta) {
    return { ok: true, changed: true, dimensionsChanged: true };
  }

  const sameModel = meta.model_id === provider.modelId;
  const sameDims = meta.dimensions === provider.dimensions;

  if (sameModel && sameDims) {
    return { ok: true, changed: false, dimensionsChanged: false };
  }

  return {
    ok: true,
    changed: true,
    dimensionsChanged: !sameDims,
  };
}

function count(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
  return row.n;
}

function sumColumn(
  db: Database.Database,
  table: string,
  column: string
): number | null {
  const row = db
    .prepare(`SELECT SUM(${column}) as s FROM ${table}`)
    .get() as { s: number | null };
  return row.s;
}

function estimateGoalTokens(db: Database.Database): number {
  const rows = db
    .prepare('SELECT description FROM goals')
    .all() as Array<{ description: string }>;
  return rows.reduce((sum, g) => sum + Math.ceil(g.description.length / 4), 0);
}