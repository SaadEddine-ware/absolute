import type Database from 'better-sqlite3';
import type {
  Goal,
  CreateGoalRequest,
  UpdateGoalRequest,
} from './types.js';
import { generateId } from './database.js';

export function createGoal(
  db: Database.Database,
  request: CreateGoalRequest
): Goal {
  const id = generateId();
  const now = new Date().toISOString();
  const keysJson = JSON.stringify(request.keys ?? {});

  db.prepare(
    `INSERT INTO goals (id, parent_goal_id, description, status, keys, level, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    request.parent_goal_id ?? null,
    request.description,
    request.status ?? 'active',
    keysJson,
    request.level,
    request.session_id,
    now,
    now
  ).run();

  return {
    id,
    parent_goal_id: request.parent_goal_id ?? null,
    description: request.description,
    status: request.status ?? 'active',
    keys: keysJson,
    level: request.level,
    session_id: request.session_id,
    created_at: now,
    updated_at: now,
  };
}

export function getGoal(
  db: Database.Database,
  id: string
): Goal | undefined {
  return db
    .prepare('SELECT * FROM goals WHERE id = ?')
    .get(id) as Goal | undefined;
}

export function getGoalsBySession(
  db: Database.Database,
  sessionId: string,
  limit: number = 100,
  offset: number = 0
): Goal[] {
  return db
    .prepare(
      'SELECT * FROM goals WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    .all(sessionId, limit, offset) as Goal[];
}

export function getGoalsByParent(
  db: Database.Database,
  parentGoalId: string
): Goal[] {
  return db
    .prepare(
      'SELECT * FROM goals WHERE parent_goal_id = ? ORDER BY created_at ASC'
    )
    .all(parentGoalId) as Goal[];
}

export function getActiveGoals(
  db: Database.Database,
  sessionId: string
): Goal[] {
  return db
    .prepare(
      "SELECT * FROM goals WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC"
    )
    .all(sessionId) as Goal[];
}

export function updateGoal(
  db: Database.Database,
  id: string,
  request: UpdateGoalRequest
): Goal | undefined {
  const existing = getGoal(db, id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (request.description !== undefined) {
    fields.push('description = ?');
    values.push(request.description);
  }
  if (request.status !== undefined) {
    fields.push('status = ?');
    values.push(request.status);
  }
  if (request.keys !== undefined) {
    fields.push('keys = ?');
    values.push(JSON.stringify(request.keys));
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getGoal(db, id);
}

export function deleteGoal(
  db: Database.Database,
  id: string
): boolean {
  const result = db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getGoalHierarchy(
  db: Database.Database,
  sessionId: string
): { goals: Goal[]; hierarchy: Map<string, Goal[]> } {
  const goals = getGoalsBySession(db, sessionId);
  const hierarchy = new Map<string, Goal[]>();

  for (const goal of goals) {
    const parentId = goal.parent_goal_id ?? '__root__';
    if (!hierarchy.has(parentId)) {
      hierarchy.set(parentId, []);
    }
    hierarchy.get(parentId)!.push(goal);
  }

  return { goals, hierarchy };
}

export function completeGoal(
  db: Database.Database,
  id: string
): Goal | undefined {
  return updateGoal(db, id, { status: 'completed' });
}
