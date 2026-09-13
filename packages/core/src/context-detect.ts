import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embedding/types.js';
import type { MemoryHeader, Goal, SessionContext } from './types.js';
import { getActiveGoals } from './goals.js';

export type ContextDecision = 'continue' | 'ask' | 'switch';

export interface DetectContextOptions {
  sessionId?: string;
  timeoutMs?: number;
  topK?: number;
  crossSessionTopK?: number;
}

export interface DetectContextResult {
  decision: ContextDecision;
  similarity: number;
  relevantMemories: MemoryHeader[];
  crossSessionMemories: MemoryHeader[];
  goalEvaluated: boolean;
  fallback: boolean;
  reason?: string;
}

export async function embedWithTimeout(
  provider: EmbeddingProvider,
  text: string,
  timeoutMs: number = 500
): Promise<Float32Array | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const result = await provider.embed(text);
    clearTimeout(timeout);
    return result;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function clampTopK(k: number): number {
  return Math.max(1, Math.min(50, k));
}

export function searchSimilarMemories(
  db: Database.Database,
  embedding: Float32Array,
  options: { sessionId?: string; topK?: number } = {}
): MemoryHeader[] {
  const topK = clampTopK(options.topK ?? 5);
  const embeddingStr = Buffer.from(embedding.buffer).toString('base64');

  let query: string;
  let params: any[];

  if (options.sessionId) {
    query = `
      SELECT mv.memory_id, mv.distance, m.content, m.type, m.importance, m.tokens_est,
        (SELECT COUNT(*) FROM memories WHERE parent_id = m.id) as child_count
      FROM memory_vectors mv
      JOIN memories m ON m.id = mv.memory_id
      WHERE mv.embedding MATCH ? AND k = ? AND m.session_id = ?
      ORDER BY mv.distance ASC
    `;
    params = [embeddingStr, topK, options.sessionId];
  } else {
    query = `
      SELECT mv.memory_id, mv.distance, m.content, m.type, m.importance, m.tokens_est,
        (SELECT COUNT(*) FROM memories WHERE parent_id = m.id) as child_count
      FROM memory_vectors mv
      JOIN memories m ON m.id = mv.memory_id
      WHERE mv.embedding MATCH ? AND k = ?
      ORDER BY mv.distance ASC
    `;
    params = [embeddingStr, topK];
  }

  try {
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.memory_id,
      type: r.type,
      content: r.content,
      importance: r.importance,
      tokens_est: r.tokens_est ?? 0,
      child_count: r.child_count ?? 0,
    }));
  } catch {
    return [];
  }
}

export function searchSimilarGoals(
  db: Database.Database,
  embedding: Float32Array,
  sessionId: string,
  topK: number = 5
): Array<{ goal: Goal; distance: number }> {
  const k = clampTopK(topK);
  const embeddingStr = Buffer.from(embedding.buffer).toString('base64');

  try {
    const rows = db.prepare(`
      SELECT gv.goal_id, gv.distance, g.description, g.status, g.level, g.parent_goal_id,
             g.keys, g.session_id, g.created_at, g.updated_at
      FROM goal_vectors gv
      JOIN goals g ON g.id = gv.goal_id
      WHERE gv.embedding MATCH ? AND k = ? AND g.session_id = ?
      ORDER BY gv.distance ASC
    `).all(embeddingStr, k, sessionId) as any[];

    return rows.map((r) => ({
      goal: {
        id: r.goal_id,
        description: r.description,
        status: r.status,
        level: r.level,
        parent_goal_id: r.parent_goal_id,
        keys: r.keys,
        session_id: r.session_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
      } as Goal,
      distance: r.distance,
    }));
  } catch {
    return [];
  }
}

function getUserThreshold(db: Database.Database, userId: string = 'default'): number {
  const row = db.prepare(
    'SELECT similarity_threshold FROM user_settings WHERE user_id = ?'
  ).get(userId) as { similarity_threshold: number } | undefined;
  return row?.similarity_threshold ?? 0.6;
}

function getDecision(similarity: number, threshold: number): ContextDecision {
  if (similarity > 0.8) return 'continue';
  if (similarity <= threshold) return 'switch';
  return 'ask';
}

export async function detectContext(
  db: Database.Database,
  provider: EmbeddingProvider,
  prompt: string,
  options: DetectContextOptions = {}
): Promise<DetectContextResult> {
  const timeoutMs = options.timeoutMs ?? 500;
  const topK = options.topK ?? 5;
  const crossSessionTopK = options.crossSessionTopK ?? 5;

  const promptEmbedding = await embedWithTimeout(provider, prompt, timeoutMs);
  if (!promptEmbedding) {
    return {
      decision: 'continue',
      similarity: 0,
      relevantMemories: [],
      crossSessionMemories: [],
      goalEvaluated: false,
      fallback: true,
      reason: 'Embedding timeout',
    };
  }

  const relevantMemories = searchSimilarMemories(db, promptEmbedding, {
    sessionId: options.sessionId,
    topK,
  });

  const crossSessionMemories = options.sessionId
    ? searchSimilarMemories(db, promptEmbedding, { topK: crossSessionTopK })
        .filter((m) => !relevantMemories.some((r) => r.id === m.id))
    : [];

  const activeGoals = options.sessionId
    ? getActiveGoals(db, options.sessionId)
    : [];
  const activeGoal = activeGoals[0] ?? null;

  if (!activeGoal) {
    return {
      decision: 'continue',
      similarity: 0,
      relevantMemories,
      crossSessionMemories,
      goalEvaluated: false,
      fallback: false,
    };
  }

  const goalRow = db.prepare('SELECT id FROM goal_vectors WHERE goal_id = ?')
    .get(activeGoal.id) as { id: string } | undefined;

  if (!goalRow) {
    return {
      decision: 'continue',
      similarity: 0,
      relevantMemories,
      crossSessionMemories,
      goalEvaluated: false,
      fallback: false,
    };
  }

  const goalVecRow = db.prepare('SELECT embedding FROM goal_vectors WHERE goal_id = ?')
    .get(activeGoal.id) as { embedding: Buffer } | undefined;

  if (!goalVecRow) {
    return {
      decision: 'continue',
      similarity: 0,
      relevantMemories,
      crossSessionMemories,
      goalEvaluated: false,
      fallback: false,
    };
  }

  const goalEmbedding = new Float32Array(goalVecRow.embedding.buffer);
  const similarity = cosineSimilarity(promptEmbedding, goalEmbedding);
  const threshold = getUserThreshold(db);
  const decision = getDecision(similarity, threshold);

  return {
    decision,
    similarity,
    relevantMemories,
    crossSessionMemories,
    goalEvaluated: true,
    fallback: false,
  };
}
