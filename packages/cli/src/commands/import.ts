import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import {
  openDatabase,
  getEmbeddingMetadata,
  type Memory,
  type Goal,
  type Session,
  type EmbeddingMetadata,
} from '@absolute/core';
import { loadConfig, getDbPath } from '../utils/config.js';
import { createAnyProvider } from '../utils/embedding.js';

async function getDb() {
  const config = loadConfig();
  return openDatabase({ dbPath: getDbPath(), embeddingProvider: createAnyProvider(config), skipEmbeddingValidation: true });
}

interface ExportData {
  exportedAt?: string;
  app?: string;
  schema?: number;
  embeddingMetadata: EmbeddingMetadata | null;
  sessions: Session[];
  goals: Goal[];
  memories: Memory[];
  memoryVectors: Array<{ memory_id: string; embedding_base64: string }>;
  goalVectors: Array<{ goal_id: string; embedding_base64: string }>;
}

export function importCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Import data from a previously exported JSON file')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (file: string, opts: { yes?: boolean }) => {
      const raw = readFileSync(file, 'utf-8');
      const data: ExportData = JSON.parse(raw);

      if (!Array.isArray(data.sessions) || !Array.isArray(data.memories) || !Array.isArray(data.goals) || !data.embeddingMetadata) {
        console.error('Invalid export file: missing required keys (sessions, memories, goals, embeddingMetadata).');
        process.exit(1);
      }

      const { db } = await getDb();

      const sessionCount = (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;
      const memoryCount = (db.prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n;
      const goalCount = (db.prepare('SELECT COUNT(*) AS n FROM goals').get() as { n: number }).n;

      if ((sessionCount > 0 || memoryCount > 0 || goalCount > 0) && !opts.yes) {
        console.error('Target database already has data (sessions, memories, or goals).');
        console.error('Use --yes to overwrite, or import into a fresh database.');
        db.close();
        process.exit(1);
      }

      const targetMeta = getEmbeddingMetadata(db);
      if (targetMeta && data.embeddingMetadata) {
        if (targetMeta.model_id !== data.embeddingMetadata.model_id || targetMeta.dimensions !== data.embeddingMetadata.dimensions) {
          console.error(
            `Embedding mismatch: target DB uses "${targetMeta.model_id}" (${targetMeta.dimensions}d) ` +
            `but export uses "${data.embeddingMetadata.model_id}" (${data.embeddingMetadata.dimensions}d).\n` +
            `Run \`absolute migrate embeddings\` first, or import into a fresh DB.`
          );
          db.close();
          process.exit(1);
        }
      }

      if (!targetMeta && data.embeddingMetadata) {
        db.prepare(
          'INSERT INTO embedding_metadata (id, model_id, dimensions, created_at) VALUES (?, ?, ?, ?)'
        ).run(1, data.embeddingMetadata.model_id, data.embeddingMetadata.dimensions, data.embeddingMetadata.created_at);
      }

      const insertSessions = db.prepare('INSERT INTO sessions (id, title, root_subject_id, summary, tokens_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const insertGoals = db.prepare('INSERT INTO goals (id, parent_goal_id, description, status, keys, level, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insertMemories = db.prepare('INSERT INTO memories (id, parent_id, type, content, keys, goal_id, importance, tokens_est, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insertMemVec = db.prepare('INSERT INTO memory_vectors (memory_id, embedding) VALUES (?, ?)');
      const insertGoalVec = db.prepare('INSERT INTO goal_vectors (goal_id, embedding) VALUES (?, ?)');

      db.transaction(() => {
        for (const s of data.sessions) {
          insertSessions.run(s.id, s.title, s.root_subject_id, s.summary, s.tokens_used, s.created_at, s.updated_at);
        }
        for (const g of data.goals) {
          insertGoals.run(g.id, g.parent_goal_id, g.description, g.status, g.keys, g.level, g.session_id, g.created_at, g.updated_at);
        }
        for (const m of data.memories) {
          insertMemories.run(m.id, m.parent_id, m.type, m.content, m.keys, m.goal_id, m.importance, m.tokens_est, m.session_id, m.created_at, m.updated_at);
        }
        for (const v of data.memoryVectors) {
          insertMemVec.run(v.memory_id, Buffer.from(v.embedding_base64, 'base64'));
        }
        for (const v of data.goalVectors) {
          insertGoalVec.run(v.goal_id, Buffer.from(v.embedding_base64, 'base64'));
        }
      })();

      console.log('Import complete:');
      console.log(`  sessions: ${data.sessions.length}`);
      console.log(`  memories: ${data.memories.length}`);
      console.log(`  goals: ${data.goals.length}`);
      console.log(`  memory vectors: ${data.memoryVectors.length}`);
      console.log(`  goal vectors: ${data.goalVectors.length}`);

      db.close();
    });
}
