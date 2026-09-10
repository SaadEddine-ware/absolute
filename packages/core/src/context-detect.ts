import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embedding/types.js';
import type { MemoryHeader } from './types.js';
import { getUserSettings, getDecision } from './adaptive-threshold.js';
import { getActiveGoals } from './goals.js';

export const DEFAULT_TIMEOUT_MS = 500;
export const DEFAULT_TOP_K = 5;

export type ContextDecision = 'continue' | 'ask' | 'switch';

export interface ContextDetectResult {
  decision: ContextDecision;
  similarity: number;
  threshold: number;
  relevantMemories: MemoryHeader[];
  /** Similar memories from OTHER sessions (cross-session recall). Empty unless crossSessionTopK > 0. */
  crossSessionMemories: MemoryHeader[];
  fallback: boolean;
  /** True when an active goal with a matching-dimension vector existed, so `decision` is meaningful. */
  goalEvaluated: boolean;
  reason?: string;
}

export interface DetectOptions {
  timeoutMs?: number;
  sessionId: string;
  userId?: string;
  topK?: number;
  /** When > 0, also KNN-search memories from other sessions (for cross-session recall). */
  crossSessionTopK?: number;
}

export async function detectContext(
  db: Database.Database,
  provider: EmbeddingProvider,
  prompt: string,
  opts: DetectOptions
): Promise<ContextDetectResult> {
  const empty: ContextDetectResult = {
    decision: 'continue',
    similarity: 0,
    threshold: getUserSettings(db, opts.userId).similarity_threshold,
    relevantMemories: [],
    crossSessionMemories: [],
    fallback: true,
    goalEvaluated: false,
  };

  const queryEmbedding = await embedWithTimeout(
    provider,
    prompt,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  ).catch(() => null);

  if (!queryEmbedding) {
    return { ...empty, reason: 'embedding timeout; proceeding without context check' };
  }

  const dimensionCheck = checkVectorDimensions(db, provider);
  if (!dimensionCheck.ok) {
    return {
      ...empty,
      reason: dimensionCheck.error,
    };
  }

  const activeGoal = getActiveGoals(db, opts.sessionId)[0];
  const settings = getUserSettings(db, opts.userId);

  let goalSimilarity = 0;
  let goalEvaluated = false;
  if (activeGoal) {
    const goalVec = getGoalVector(db, activeGoal.id);
    if (goalVec && goalVec.length === queryEmbedding.length) {
      goalEvaluated = true;
      goalSimilarity = cosineSimilarity(queryEmbedding, goalVec);
    }
  }

  const decision =
    activeGoal && goalEvaluated
      ? getDecision(goalSimilarity, settings.similarity_threshold)
      : 'continue';

  const relevantMemories = searchSimilarMemories(
    db,
    queryEmbedding,
    opts.sessionId,
    opts.topK ?? DEFAULT_TOP_K
  );

  const crossSessionMemories =
    opts.crossSessionTopK && opts.crossSessionTopK > 0
      ? searchSimilarMemoriesGlobal(db, queryEmbedding, {
          topK: opts.crossSessionTopK,
          excludeSessionId: opts.sessionId,
        })
      : [];

  return {
    decision,
    similarity: goalSimilarity,
    threshold: settings.similarity_threshold,
    relevantMemories,
    crossSessionMemories,
    fallback: false,
    goalEvaluated,
  };
}

export async function embedWithTimeout(
  provider: EmbeddingProvider,
  text: string,
  timeoutMs: number
): Promise<Float32Array | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('embedding timeout')), timeoutMs);
  });
  try {
    return await Promise.race([provider.embed(text), timeoutPromise]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function checkVectorDimensions(
  db: Database.Database,
  provider: EmbeddingProvider
): { ok: boolean; error?: string } {
  const meta = db
    .prepare('SELECT dimensions FROM embedding_metadata WHERE id = 1')
    .get() as { dimensions: number } | undefined;

  if (meta && meta.dimensions !== provider.dimensions) {
    return {
      ok: false,
      error:
        `Vector dimension mismatch: tables use ${meta.dimensions} dims but ` +
        `provider "${provider.modelId}" returns ${provider.dimensions}. ` +
        `Run \`absolute migrate embeddings\` to rebuild the vector index.`,
    };
  }

  const tableDims = getVec0Dimension(db, 'memory_vectors');
  if (tableDims && tableDims !== provider.dimensions) {
    return {
      ok: false,
      error:
        `Vector dimension mismatch: memory_vectors uses ${tableDims} dims but ` +
        `provider "${provider.modelId}" returns ${provider.dimensions}. ` +
        `Run \`absolute migrate embeddings\`.`,
    };
  }

  return { ok: true };
}

export function getVec0Dimension(
  db: Database.Database,
  tableName: string
): number | null {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql: string } | undefined;

  if (!row) return null;
  const match = row.sql.match(/FLOAT\s*\[\s*(\d+)\s*\]/);
  return match ? parseInt(match[1], 10) : null;
}

export function getEmbeddingMetadata(
  db: Database.Database
): { model_id: string; dimensions: number } | null {
  const row = db
    .prepare('SELECT model_id, dimensions FROM embedding_metadata WHERE id = 1')
    .get() as { model_id: string; dimensions: number } | undefined;
  return row ?? null;
}

export function searchSimilarMemories(
  db: Database.Database,
  queryEmbedding: Float32Array,
  sessionId: string,
  topK: number
): MemoryHeader[] {
  try {
    const limit = clampTopK(topK);
    const rows = db
      .prepare(
        `SELECT mv.memory_id as id, m.type, m.content, m.importance, m.tokens_est,
                (SELECT COUNT(*) FROM memories c WHERE c.parent_id = mv.memory_id) as child_count,
                mv.distance
         FROM memory_vectors mv
         JOIN memories m ON m.id = mv.memory_id
         WHERE mv.embedding MATCH ? AND k = ? AND m.session_id = ?
         ORDER BY mv.distance ASC`
      )
      .all(Buffer.from(queryEmbedding.buffer), limit, sessionId) as Array<
      MemoryHeader & { memory_id: string; distance: number }
    >;

    return rows.map(({ memory_id: _id, distance: _d, ...rest }) => rest) as MemoryHeader[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('dimension') || msg.includes('different')) {
      return [];
    }
    throw e;
  }
}

// KNN across ALL sessions (optionally excluding one). Used for cross-session
// recall so a brand-new session can still surface memories the user discussed
// before — the Phase 6 verify ("new session remembers previous context").
export function searchSimilarMemoriesGlobal(
  db: Database.Database,
  queryEmbedding: Float32Array,
  opts: { topK?: number; excludeSessionId?: string } = {}
): MemoryHeader[] {
  try {
    const limit = clampTopK(opts.topK ?? DEFAULT_TOP_K);
    const exclude = opts.excludeSessionId;
    const rows = db
      .prepare(
        `SELECT mv.memory_id as id, m.type, m.content, m.importance, m.tokens_est,
                (SELECT COUNT(*) FROM memories c WHERE c.parent_id = mv.memory_id) as child_count,
                mv.distance
         FROM memory_vectors mv
         JOIN memories m ON m.id = mv.memory_id
         WHERE mv.embedding MATCH ? AND k = ?${exclude ? ' AND m.session_id != ?' : ''}
         ORDER BY mv.distance ASC`
      )
      .all(
        Buffer.from(queryEmbedding.buffer),
        limit,
        ...(exclude ? [exclude] : [])
      ) as Array<MemoryHeader & { memory_id: string; distance: number }>;

    return rows.map(({ memory_id: _id, distance: _d, ...rest }) => rest) as MemoryHeader[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('dimension') || msg.includes('different')) {
      return [];
    }
    throw e;
  }
}

export function searchSimilarGoals(
  db: Database.Database,
  queryEmbedding: Float32Array,
  opts: { sessionId?: string; topK?: number } = {}
): Array<{ id: string; description: string; level: string; status: string; distance: number }> {
  const limit = clampTopK(opts.topK ?? DEFAULT_TOP_K);
  const sessionFilter = opts.sessionId ? ' AND g.session_id = ?' : '';
  try {
    const params: Array<Buffer | string | number> = [Buffer.from(queryEmbedding.buffer), limit];
    if (opts.sessionId) params.push(opts.sessionId);

    const rows = db
      .prepare(
        `SELECT gv.goal_id, gv.distance, g.description, g.status, g.level
         FROM goal_vectors gv
         JOIN goals g ON g.id = gv.goal_id
         WHERE gv.embedding MATCH ? AND k = ?${sessionFilter}
         ORDER BY gv.distance ASC`
      )
      .all(...params) as Array<{
      goal_id: string;
      distance: number;
      description: string;
      status: string;
      level: string;
    }>;

    return rows.map((r) => ({
      id: r.goal_id,
      distance: r.distance,
      description: r.description,
      status: r.status,
      level: r.level,
    }));
  } catch {
    return [];
  }
}

export function getGoalVector(
  db: Database.Database,
  goalId: string
): Float32Array | null {
  const row = db
    .prepare('SELECT embedding FROM goal_vectors WHERE goal_id = ?')
    .get(goalId) as { embedding: Buffer | Uint8Array } | undefined;
  if (!row) return null;
  const bytes = new Uint8Array(row.embedding);
  return new Float32Array(bytes.buffer).slice();
}

export function storeMemoryVector(
  db: Database.Database,
  memoryId: string,
  embedding: Float32Array
): void {
  db.prepare(
    'INSERT OR REPLACE INTO memory_vectors (memory_id, embedding) VALUES (?, ?)'
  ).run(memoryId, Buffer.from(embedding.buffer));
}

export function storeGoalVector(
  db: Database.Database,
  goalId: string,
  embedding: Float32Array
): void {
  db.prepare(
    'INSERT OR REPLACE INTO goal_vectors (goal_id, embedding) VALUES (?, ?)'
  ).run(goalId, Buffer.from(embedding.buffer));
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function clampTopK(topK: number): number {
  const n = Math.floor(topK);
  return Math.min(50, Math.max(1, Number.isFinite(n) ? n : DEFAULT_TOP_K));
}
