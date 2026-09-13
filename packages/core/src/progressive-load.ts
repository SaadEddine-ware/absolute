import type Database from 'better-sqlite3';
import type { SessionContext, MemoryHeader, GoalHeader } from './types.js';

export interface LoadSessionContextOptions {
  mode?: 'prompt' | 'full';
  /** Token budget for session memories. When exceeded, memories are trimmed by importance. */
  maxTokens?: number;
}

function trimByImportance(memories: MemoryHeader[], maxTokens: number): MemoryHeader[] {
  // Already sorted by importance DESC, created_at DESC from the query.
  // Greedily fill up to maxTokens.
  let tokenCount = 0;
  const selected: MemoryHeader[] = [];
  for (const m of memories) {
    const memTokens = m.tokens_est || 0;
    if (tokenCount + memTokens > maxTokens) break;
    selected.push(m);
    tokenCount += memTokens;
  }
  return selected;
}

export function loadSessionContext(
  db: Database.Database,
  sessionId: string,
  options: LoadSessionContextOptions = {}
): SessionContext {
  let memories = db
    .prepare(
      `SELECT id, type, content, importance, tokens_est,
        (SELECT COUNT(*) FROM memories WHERE parent_id = m.id) as child_count
       FROM memories m
       WHERE session_id = ? AND parent_id IS NULL
       ORDER BY importance DESC, created_at DESC`
    )
    .all(sessionId) as MemoryHeader[];

  const goals = db
    .prepare(
      `SELECT id, level, description, status,
        (SELECT COUNT(*) FROM goals WHERE parent_goal_id = g.id) as child_count
       FROM goals g
       WHERE session_id = ? AND parent_goal_id IS NULL
       ORDER BY created_at DESC`
    )
    .all(sessionId) as GoalHeader[];

  // Enforce token budget when maxTokens is provided.
  if (options.maxTokens && options.maxTokens > 0) {
    const totalBefore = memories.reduce((sum, m) => sum + (m.tokens_est || 0), 0);
    if (totalBefore > options.maxTokens) {
      memories = trimByImportance(memories, options.maxTokens);
    }
  }

  const totalTokens = memories.reduce(
    (sum, m) => sum + (m.tokens_est || 0),
    0
  );

  return { headers: memories, goals, total_tokens_est: totalTokens };
}
