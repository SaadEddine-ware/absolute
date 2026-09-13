import type Database from 'better-sqlite3';
import { deleteMemory } from './memory.js';

export interface RetentionSettings {
  defaultDurationDays: number;
  subjectDurationDays: number;
  actionDurationDays: number;
  subActionDurationDays: number;
  promptAnswerDurationDays: number;
  autoDeleteExpired: boolean;
}

const DEFAULT_RETENTION: RetentionSettings = {
  defaultDurationDays: 30,
  subjectDurationDays: 365,
  actionDurationDays: 180,
  subActionDurationDays: 90,
  promptAnswerDurationDays: 30,
  autoDeleteExpired: false,
};

export function getRetentionSettings(
  db: Database.Database,
  userId: string
): RetentionSettings {
  const rows = db
    .prepare(
      "SELECT setting_key, setting_value FROM settings WHERE user_id = ? AND setting_key LIKE 'retention_%'"
    )
    .all(userId) as { setting_key: string; setting_value: string }[];

  const settings = { ...DEFAULT_RETENTION };

  for (const row of rows) {
    const key = row.setting_key.replace('retention_', '') as keyof RetentionSettings;
    if (key in settings) {
      (settings as Record<string, unknown>)[key] =
        row.setting_value === 'true' ? true :
        row.setting_value === 'false' ? false :
        Number(row.setting_value);
    }
  }

  return settings;
}

export function updateRetentionSettings(
  db: Database.Database,
  userId: string,
  updates: Partial<RetentionSettings>
): RetentionSettings {
  const now = new Date().toISOString();

  for (const [key, value] of Object.entries(updates)) {
    const settingKey = `retention_${key}`;
    const settingValue = String(value);

    db.prepare(
      `INSERT INTO settings (id, user_id, setting_key, setting_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, setting_key) DO UPDATE SET setting_value = ?, updated_at = ?`
    ).run(
      crypto.randomUUID(),
      userId,
      settingKey,
      settingValue,
      now,
      now,
      settingValue,
      now
    );
  }

  return getRetentionSettings(db, userId);
}

export function getExpiredMemories(
  db: Database.Database,
  userId: string
): Array<{ id: string; type: string; content: string; created_at: string; daysOld: number }> {
  const settings = getRetentionSettings(db, userId);
  const now = Date.now();

  const durationMap: Record<string, number> = {
    subject: settings.subjectDurationDays,
    action: settings.actionDurationDays,
    sub_action: settings.subActionDurationDays,
    prompt_answer: settings.promptAnswerDurationDays,
  };

  const results: Array<{ id: string; type: string; content: string; created_at: string; daysOld: number }> = [];

  for (const [type, maxDays] of Object.entries(durationMap)) {
    const cutoff = new Date(now - maxDays * 24 * 60 * 60 * 1000).toISOString();

    const expired = db
      .prepare(
        `SELECT id, type, content, created_at FROM memories
         WHERE type = ? AND created_at < ?
         ORDER BY created_at ASC`
      )
      .all(type, cutoff) as Array<{ id: string; type: string; content: string; created_at: string }>;

    for (const mem of expired) {
      const daysOld = Math.floor(
        (now - new Date(mem.created_at).getTime()) / (24 * 60 * 60 * 1000)
      );
      results.push({ ...mem, daysOld });
    }
  }

  return results.sort((a, b) => a.daysOld - b.daysOld);
}

export function deleteExpiredMemories(
  db: Database.Database,
  userId: string
): { deleted: number; byType: Record<string, number> } {
  const expired = getExpiredMemories(db, userId);
  const byType: Record<string, number> = {};

  for (const mem of expired) {
    deleteMemory(db, mem.id);
    byType[mem.type] = (byType[mem.type] ?? 0) + 1;
  }

  return { deleted: expired.length, byType };
}

export function getMemoryAge(
  db: Database.Database,
  memoryId: string
): { id: string; created_at: string; daysOld: number; type: string } | null {
  const mem = db
    .prepare('SELECT id, type, created_at FROM memories WHERE id = ?')
    .get(memoryId) as { id: string; type: string; created_at: string } | undefined;

  if (!mem) return null;

  const daysOld = Math.floor(
    (Date.now() - new Date(mem.created_at).getTime()) / (24 * 60 * 60 * 1000)
  );

  return { id: mem.id, created_at: mem.created_at, daysOld, type: mem.type };
}
