import type Database from 'better-sqlite3';
import type {
  Memory,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  SessionContext,
  MemoryHeader,
  GoalHeader,
} from './types.js';
import { generateId, estimateTokens } from './database.js';

export function createMemory(
  db: Database.Database,
  request: CreateMemoryRequest
): Memory {
  const id = generateId();
  const now = new Date().toISOString();
  const tokensEst = request.tokens_est ?? estimateTokens(request.content);
  const keysJson = JSON.stringify(request.keys ?? {});

  db.prepare(
    `INSERT INTO memories (id, parent_id, type, content, keys, goal_id, importance, tokens_est, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    request.parent_id ?? null,
    request.type,
    request.content,
    keysJson,
    request.goal_id ?? null,
    request.importance ?? 5,
    tokensEst,
    request.session_id,
    now,
    now
  ).run();

  return {
    id,
    parent_id: request.parent_id ?? null,
    type: request.type,
    content: request.content,
    keys: keysJson,
    goal_id: request.goal_id ?? null,
    importance: request.importance ?? 5,
    tokens_est: tokensEst,
    session_id: request.session_id,
    created_at: now,
    updated_at: now,
  };
}

export function getMemory(
  db: Database.Database,
  id: string
): Memory | undefined {
  return db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .get(id) as Memory | undefined;
}

export function getMemoriesBySession(
  db: Database.Database,
  sessionId: string,
  limit: number = 100,
  offset: number = 0
): Memory[] {
  return db
    .prepare(
      'SELECT * FROM memories WHERE session_id = ? ORDER BY importance DESC, created_at DESC LIMIT ? OFFSET ?'
    )
    .all(sessionId, limit, offset) as Memory[];
}

export function getMemoriesByParent(
  db: Database.Database,
  parentId: string
): Memory[] {
  return db
    .prepare(
      'SELECT * FROM memories WHERE parent_id = ? ORDER BY importance DESC, created_at DESC'
    )
    .all(parentId) as Memory[];
}

export function updateMemory(
  db: Database.Database,
  id: string,
  request: UpdateMemoryRequest
): Memory | undefined {
  const existing = getMemory(db, id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (request.content !== undefined) {
    fields.push('content = ?');
    values.push(request.content);
  }
  if (request.keys !== undefined) {
    fields.push('keys = ?');
    values.push(JSON.stringify(request.keys));
  }
  if (request.importance !== undefined) {
    fields.push('importance = ?');
    values.push(request.importance);
  }
  if (request.goal_id !== undefined) {
    fields.push('goal_id = ?');
    values.push(request.goal_id);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getMemory(db, id);
}

export function deleteMemory(
  db: Database.Database,
  id: string
): boolean {
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  return result.changes > 0;
}

export function loadSessionHeaders(
  db: Database.Database,
  sessionId: string
): SessionContext {
  const memories = db
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

  const totalTokens = memories.reduce(
    (sum, m) => sum + (m.tokens_est || 0),
    0
  );

  return { headers: memories, goals, total_tokens_est: totalTokens };
}

export function formatContextForLLM(context: SessionContext): string {
  const lines: string[] = [];
  lines.push('=== SESSION CONTEXT ===');
  lines.push('');

  if (context.headers.length > 0) {
    lines.push('Memories:');
    for (const h of context.headers) {
      const childInfo = h.child_count > 0 ? ` (${h.child_count} children)` : '';
      lines.push(`  [${h.type}] ${h.content}${childInfo}`);
    }
    lines.push('');
  }

  if (context.goals.length > 0) {
    lines.push('Goals:');
    for (const g of context.goals) {
      const childInfo = g.child_count > 0 ? ` (${g.child_count} sub-goals)` : '';
      lines.push(`  [${g.level}] ${g.description} (${g.status})${childInfo}`);
    }
    lines.push('');
  }

  lines.push(`Total tokens estimated: ${context.total_tokens_est}`);
  return lines.join('\n');
}
