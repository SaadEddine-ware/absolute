import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './embedding/types.js';

export interface MigrationResult {
  memoriesReembed: number;
  goalsReembed: number;
  oldModelId: string;
  newModelId: string;
}

export async function migrateEmbeddings(
  db: Database.Database,
  provider: EmbeddingProvider
): Promise<MigrationResult> {
  const oldMeta = db
    .prepare('SELECT model_id, dimensions FROM embedding_metadata WHERE id = 1')
    .get() as { model_id: string; dimensions: number } | undefined;

  const oldModelId = oldMeta?.model_id ?? 'unknown';

  const memories = db
    .prepare('SELECT id, content FROM memories')
    .all() as { id: string; content: string }[];

  const goals = db
    .prepare('SELECT id, description FROM goals')
    .all() as { id: string; description: string }[];

  db.exec('DELETE FROM memory_vectors');
  db.exec('DELETE FROM goal_vectors');

  const insertMemoryVec = db.prepare(
    'INSERT INTO memory_vectors (memory_id, embedding) VALUES (?, ?)'
  );
  const insertGoalVec = db.prepare(
    'INSERT INTO goal_vectors (goal_id, embedding) VALUES (?, ?)'
  );

  let memCount = 0;
  for (const mem of memories) {
    try {
      const vec = await provider.embed(mem.content);
      insertMemoryVec.run(mem.id, Buffer.from(vec.buffer));
      memCount++;
    } catch (e) {
      console.error(`Failed to re-embed memory ${mem.id}:`, e);
    }
  }

  let goalCount = 0;
  for (const goal of goals) {
    try {
      const vec = await provider.embed(goal.description);
      insertGoalVec.run(goal.id, Buffer.from(vec.buffer));
      goalCount++;
    } catch (e) {
      console.error(`Failed to re-embed goal ${goal.id}:`, e);
    }
  }

  db.prepare(
    'UPDATE embedding_metadata SET model_id = ?, dimensions = ?, created_at = ? WHERE id = 1'
  ).run(provider.modelId, provider.dimensions, new Date().toISOString());

  db.prepare(
    `UPDATE user_settings SET
      similarity_threshold = 0.6,
      switch_confirmed_count = 0,
      switch_rejected_count = 0,
      total_confirmations = 0,
      updated_at = ?`
  ).run(new Date().toISOString());

  return {
    memoriesReembed: memCount,
    goalsReembed: goalCount,
    oldModelId,
    newModelId: provider.modelId,
  };
}
