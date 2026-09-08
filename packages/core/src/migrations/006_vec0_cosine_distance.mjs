// Migration 006: vector tables use cosine distance.
//
// vec0's DEFAULT distance metric is L2 — not cosine as the 001 comment claimed.
// Cosine similarity is what the memory engine actually wants (direction-based),
// so these tables must be recreated with `distance_metric=cosine` on the column.
//
// vec0 virtual tables cannot be altered in place, and DROP/recreate severs any
// existing triggers that reference them (the 005 cleanup triggers go stale when
// the vec0 table is dropped: the old trigger then silently fails to fire against
// the new table — verified empirically). So this migration:
//   1. drops the vec0 tables,
//   2. recreates them with `distance_metric=cosine`,
//   3. re-embeds every memory/goal from stored content/description text (using
//      the configured embedding provider), since the table rows were dropped,
//   4. re-creates the 005 vector-cleanup triggers.
//
// The embedding MODEL is unchanged (re-embed uses the current provider), so
// embedding_metadata is left alone. Only a provider whose modelId matches the
// recorded DB provider may run this migration non-interactively (enforced by
// the runner via `options.embeddingProvider`).
//
// NOTE: this file is plain JavaScript on purpose — migrations are copied to
// dist verbatim by tsup (cpSync) and dynamically imported, never transpiled.
import Database from 'better-sqlite3';

export async function upDB(db, options = {}) {
  const log = options.log ?? ((msg) => console.log(msg));

  if (!options.embeddingProvider) {
    throw new Error(
      'Migration 006 requires the embedding provider to re-embed vectors. ' +
        'Run `absolute migrate embeddings` with a configured provider.'
    );
  }
  const provider = options.embeddingProvider;

  const meta = db
    .prepare('SELECT model_id, dimensions FROM embedding_metadata WHERE id = 1')
    .get();

  if (meta && meta.model_id !== provider.modelId) {
    throw new Error(
      `Migration 006 provider mismatch: database vectors were produced by "${meta.model_id}" ` +
        `but the configured provider is "${provider.modelId}". ` +
        'Switch the embedding provider first (absolute worker set ...).'
    );
  }

  const dims = provider.dimensions;

  // Remember the 005 triggers so we can recreate them after the tables are gone.
  const existingTriggers = (
    db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND name IN ('trg_memory_vectors_cleanup', 'trg_goal_vectors_cleanup')`
      )
      .all()
  ).map((t) => t.name);

  // 1. Drop the vec0 tables (rows are lost; the 005 triggers are severed here).
  db.exec('DROP TABLE IF EXISTS memory_vectors');
  db.exec('DROP TABLE IF EXISTS goal_vectors');

  // 2. Recreate with cosine distance.
  db.exec(
    `CREATE VIRTUAL TABLE memory_vectors USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding FLOAT[${dims}] distance_metric=cosine
    )`
  );
  db.exec(
    `CREATE VIRTUAL TABLE goal_vectors USING vec0(
      goal_id TEXT PRIMARY KEY,
      embedding FLOAT[${dims}] distance_metric=cosine
    )`
  );

  // 3. Re-embed from source text (the rows were dropped with the old tables).
  const memories = db
    .prepare('SELECT id, content FROM memories')
    .all();
  const goals = db
    .prepare('SELECT id, description FROM goals')
    .all();

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
      log(`Failed to re-embed memory ${mem.id}: ${e}`);
    }
  }

  let goalCount = 0;
  for (const goal of goals) {
    try {
      const vec = await provider.embed(goal.description);
      insertGoalVec.run(goal.id, Buffer.from(vec.buffer));
      goalCount++;
    } catch (e) {
      log(`Failed to re-embed goal ${goal.id}: ${e}`);
    }
  }

  // 4. Re-create the vector-cleanup triggers (they go stale on DROP of a vec0 table).
  //    The trigger row persists in sqlite_master even though memory_vectors/goal_vectors
  //    were dropped, so DROP TRIGGER IF EXISTS first.
  if (existingTriggers.includes('trg_memory_vectors_cleanup')) {
    db.exec('DROP TRIGGER IF EXISTS trg_memory_vectors_cleanup');
    db.exec(
      `CREATE TRIGGER trg_memory_vectors_cleanup
       AFTER DELETE ON memories
       FOR EACH ROW BEGIN
         DELETE FROM memory_vectors WHERE memory_id = OLD.id;
       END`
    );
  }
  if (existingTriggers.includes('trg_goal_vectors_cleanup')) {
    db.exec('DROP TRIGGER IF EXISTS trg_goal_vectors_cleanup');
    db.exec(
      `CREATE TRIGGER trg_goal_vectors_cleanup
       AFTER DELETE ON goals
       FOR EACH ROW BEGIN
         DELETE FROM goal_vectors WHERE goal_id = OLD.id;
       END`
    );
  }

  log(
    `Migration 006 complete: vector tables now use cosine distance. ` +
      `Re-embedded ${memCount} memories and ${goalCount} goals.`
  );
}