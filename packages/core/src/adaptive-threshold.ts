import type Database from 'better-sqlite3';
import type { UserSettings } from './types.js';
import { generateId } from './database.js';

const DEFAULT_USER_ID = 'default';

export function getUserSettings(
  db: Database.Database,
  userId: string = DEFAULT_USER_ID
): UserSettings {
  const row = db.prepare(
    'SELECT * FROM user_settings WHERE user_id = ?'
  ).get(userId) as UserSettings | undefined;

  if (row) return row;

  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_settings (id, user_id, similarity_threshold, switch_confirmed_count, switch_rejected_count, total_confirmations, created_at, updated_at)
     VALUES (?, ?, 0.6, 0, 0, 0, ?, ?)`
  ).run(id, userId, now, now);

  return db.prepare('SELECT * FROM user_settings WHERE id = ?').get(id) as UserSettings;
}

export function recordSwitchFeedback(
  db: Database.Database,
  userConfirmedSwitch: boolean,
  userId: string = DEFAULT_USER_ID
): number {
  const settings = getUserSettings(db, userId);

  const totalConfirmations = settings.total_confirmations + 1;
  const switchConfirmedCount = settings.switch_confirmed_count + (userConfirmedSwitch ? 1 : 0);
  const switchRejectedCount = settings.switch_rejected_count + (userConfirmedSwitch ? 0 : 1);

  const diff = switchRejectedCount - switchConfirmedCount;
  const adjustment = 0.2 * (diff / totalConfirmations);
  const newThreshold = Math.max(0.3, Math.min(0.9, 0.6 + adjustment));

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE user_settings
     SET similarity_threshold = ?, switch_confirmed_count = ?, switch_rejected_count = ?,
         total_confirmations = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(newThreshold, switchConfirmedCount, switchRejectedCount, totalConfirmations, now, userId);

  return newThreshold;
}

export function resetThreshold(
  db: Database.Database,
  userId: string = DEFAULT_USER_ID
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE user_settings
     SET similarity_threshold = 0.6, switch_confirmed_count = 0, switch_rejected_count = 0,
         total_confirmations = 0, updated_at = ?
     WHERE user_id = ?`
  ).run(now, userId);
}
