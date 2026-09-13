import type Database from 'better-sqlite3';
import type { EmbeddingMetadata } from './types.js';
import type { EmbeddingProvider } from './embedding/types.js';

export type WorkerMode = 'cloud' | 'local' | 'none';

export interface ConfiguredEmbedding {
  mode: WorkerMode;
  modelId: string | null;
  dimensions: number | null;
}

export interface WorkerStatus {
  mode: WorkerMode;
  modelId: string;
  dimensions: number;
  dbModelId: string;
  dbDimensions: number;
  mismatch: boolean;
  migrationNeeded: boolean;
  consistent: boolean;
  memoriesCount: number;
  memoriesVectorized: number;
  goalsCount: number;
  issues: string[];
}

export interface MigrationImpact {
  memoryCount: number;
  goalCount: number;
  memoriesCount: number;
  goalsCount: number;
  currentModelId: string;
  currentDimensions: number;
  oldModelId: string;
  newModelId: string;
  targetModelId: string;
  targetDimensions: number;
  dimensionsChanged: boolean;
}

export function getEmbeddingMetadata(db: Database.Database): EmbeddingMetadata | undefined {
  return db.prepare('SELECT * FROM embedding_metadata WHERE id = 1').get() as EmbeddingMetadata | undefined;
}

export function getWorkerStatus(db: Database.Database, configured: ConfiguredEmbedding): WorkerStatus {
  const meta = getEmbeddingMetadata(db);
  const memoriesCount = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
  const memoriesVectorized = (db.prepare('SELECT COUNT(*) as c FROM memory_vectors').get() as { c: number }).c;
  const goalsCount = (db.prepare('SELECT COUNT(*) as c FROM goals').get() as { c: number }).c;

  const dbModelId = meta?.model_id ?? '';
  const dbDimensions = meta?.dimensions ?? 0;
  const configuredModelId = configured.modelId ?? '';
  const configuredDimensions = configured.dimensions ?? 0;

  const consistent = configuredModelId
    ? dbModelId === configuredModelId && dbDimensions === configuredDimensions
    : true;
  const migrationNeeded = configuredModelId ? !consistent : false;
  const issues: string[] = [];

  if (migrationNeeded) {
    issues.push(`Embedding provider mismatch: DB has "${dbModelId}" (${dbDimensions}d) but current is "${configuredModelId}" (${configuredDimensions}d)`);
  }
  if (memoriesCount > 0 && memoriesVectorized === 0) {
    issues.push('Memories exist but none are vectorized');
  }

  return {
    mode: configured.mode,
    modelId: configuredModelId,
    dimensions: configuredDimensions,
    dbModelId,
    dbDimensions,
    mismatch: !consistent,
    migrationNeeded,
    consistent,
    memoriesCount,
    memoriesVectorized,
    goalsCount,
    issues,
  };
}

export function estimateMigrationImpact(
  db: Database.Database,
  targetProvider: EmbeddingProvider
): MigrationImpact {
  const meta = getEmbeddingMetadata(db);
  const memoryCount = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
  const goalCount = (db.prepare('SELECT COUNT(*) as c FROM goals').get() as { c: number }).c;

  return {
    memoryCount,
    goalCount,
    memoriesCount: memoryCount,
    goalsCount: goalCount,
    currentModelId: meta?.model_id ?? '',
    currentDimensions: meta?.dimensions ?? 0,
    oldModelId: meta?.model_id ?? '',
    newModelId: targetProvider.modelId,
    targetModelId: targetProvider.modelId,
    targetDimensions: targetProvider.dimensions,
    dimensionsChanged: meta ? meta.dimensions !== targetProvider.dimensions : false,
  };
}

export interface ValidateCloudResult {
  ok: boolean;
  error?: string;
  modelId?: string;
  dimensions?: number;
}

export async function validateCloudWorker(
  url: string,
  options: { apiToken?: string; timeoutMs?: number } = {}
): Promise<ValidateCloudResult> {
  try {
    const headers: Record<string, string> = {};
    if (options.apiToken) {
      headers['Authorization'] = `Bearer ${options.apiToken}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
    const res = await fetch(`${url}/api/health`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as any;
    return { ok: true, modelId: data.model, dimensions: data.dimensions };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function verifyProviderMatchesDb(
  db: Database.Database,
  provider: EmbeddingProvider
): { ok: boolean; error?: string; changed?: boolean } {
  const meta = getEmbeddingMetadata(db);
  if (!meta) return { ok: true };
  const matches = meta.model_id === provider.modelId && meta.dimensions === provider.dimensions;
  return {
    ok: matches,
    changed: !matches,
    error: matches ? undefined : `DB has "${meta.model_id}" (${meta.dimensions}d) but current is "${provider.modelId}" (${provider.dimensions}d)`,
  };
}
