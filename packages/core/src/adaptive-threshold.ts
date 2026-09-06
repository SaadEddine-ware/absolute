import type Database from 'better-sqlite3';
import type { UserSettings } from './types.js';
import { generateId } from './database.js';

const DEFAULT_USER_ID = 'default';
const DEFAULT_THRESHOLD = 0.6;
const MIN_THRESHOLD = 0.3;
const MAX_THRESHOLD = 0.9;
const EMA_ALPHA = 0.2;

export function getUserSettings(
  db: Database.Database,
  userId: string = DEFAULT_USER_ID
): UserSettings {
  const existing = db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .get(userId) as UserSettings | undefined;

  if (existing) return existing;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_settings
      (id, user_id, similarity_threshold, switch_confirmed_count, switch_rejected_count, total_confirmations, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, ?, ?)`
  ).run(generateId(), userId, DEFAULT_THRESHOLD, now, now);

  return {
    id: '',
    user_id: userId,
    similarity_threshold: DEFAULT_THRESHOLD,
    switch_confirmed_count: 0,
    switch_rejected_count: 0,
    total_confirmations: 0,
    created_at: now,
    updated_at: now,
  };
}

export function updateAdaptiveThreshold(
  db: Database.Database,
  userId: string,
  userConfirmedSwitch: boolean
): UserSettings {
  const settings = getUserSettings(db, userId);

  settings.total_confirmations++;
  if (userConfirmedSwitch) {
    settings.switch_confirmed_count++;
  } else {
    settings.switch_rejected_count++;
  }

  const total = settings.total_confirmations;
  const confirmed = settings.switch_confirmed_count;
  const rejected = settings.switch_rejected_count;

  if (total === 0) throw new Error('total_confirmations cannot be zero');

  const confirmationRate = confirmed / total;
  const currentSignal = MIN_THRESHOLD + confirmationRate * (MAX_THRESHOLD - MIN_THRESHOLD);
  const newThreshold =
    EMA_ALPHA * currentSignal + (1 - EMA_ALPHA) * settings.similarity_threshold;

  settings.similarity_threshold = Math.max(
    MIN_THRESHOLD,
    Math.min(MAX_THRESHOLD, newThreshold)
  );

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE user_settings SET
       similarity_threshold = ?,
       switch_confirmed_count = ?,
       switch_rejected_count = ?,
       total_confirmations = ?,
       updated_at = ?
     WHERE user_id = ?`
  ).run(
    settings.similarity_threshold,
    settings.switch_confirmed_count,
    settings.switch_rejected_count,
    settings.total_confirmations,
    now,
    userId
  );

  return getUserSettings(db, userId);
}

export function resetThreshold(
  db: Database.Database,
  userId: string = DEFAULT_USER_ID
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE user_settings SET
       similarity_threshold = ?,
       switch_confirmed_count = 0,
       switch_rejected_count = 0,
       total_confirmations = 0,
       updated_at = ?
     WHERE user_id = ?`
  ).run(DEFAULT_THRESHOLD, now, userId);
}

export function getDecision(
  similarity: number,
  threshold: number
): 'continue' | 'ask' | 'switch' {
  if (similarity > 0.8) return 'continue';
  if (similarity <= threshold) return 'switch';
  return 'ask';
}

export { DEFAULT_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD };
