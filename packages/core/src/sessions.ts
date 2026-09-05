import type Database from 'better-sqlite3';
import type { Session, CreateSessionRequest, UpdateSessionRequest } from './types.js';
import { generateId } from './database.js';

export function createSession(
  db: Database.Database,
  request: CreateSessionRequest
): Session {
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sessions (id, title, summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, request.title ?? null, request.summary ?? null, now, now).run();

  return {
    id,
    title: request.title ?? null,
    root_subject_id: null,
    summary: request.summary ?? null,
    tokens_used: 0,
    created_at: now,
    updated_at: now,
  };
}

export function getSession(
  db: Database.Database,
  id: string
): Session | undefined {
  return db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as Session | undefined;
}

export function getSessions(
  db: Database.Database,
  limit: number = 50,
  offset: number = 0
): Session[] {
  return db
    .prepare(
      'SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
    .all(limit, offset) as Session[];
}

export function updateSession(
  db: Database.Database,
  id: string,
  request: UpdateSessionRequest
): Session | undefined {
  const existing = getSession(db, id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (request.title !== undefined) {
    fields.push('title = ?');
    values.push(request.title);
  }
  if (request.summary !== undefined) {
    fields.push('summary = ?');
    values.push(request.summary);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getSession(db, id);
}

export function deleteSession(
  db: Database.Database,
  id: string
): boolean {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}
