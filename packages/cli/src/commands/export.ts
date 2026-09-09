import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  openDatabase,
  getSessions,
  getMemoriesBySession,
  getGoalsBySession,
  getEmbeddingMetadata,
  type Session,
  type Memory,
  type Goal,
} from '@absolute/core';
import { loadConfig, getDbPath } from '../utils/config.js';
import { createAnyProvider } from '../utils/embedding.js';

async function getDb() {
  const config = loadConfig();
  return openDatabase({ dbPath: getDbPath(), embeddingProvider: createAnyProvider(config) });
}

export function exportCommand(program: Command): void {
  program
    .command('export')
    .description('Export database to a JSON file')
    .option('--file <path>', 'Output file path')
    .option('--session <id>', 'Export only a single session and its related data')
    .action(async (opts) => {
      const { db } = await getDb();
      const embeddingMetadata = getEmbeddingMetadata(db);

      let sessions: Session[];
      if (opts.session) {
        const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(opts.session) as Session | undefined;
        sessions = s ? [s] : [];
      } else {
        sessions = getSessions(db, 999999);
      }

      const sessionIds = new Set(sessions.map((s) => s.id));

      const goals: Goal[] = [];
      const memories: Memory[] = [];
      const seenGoalIds = new Set<string>();
      const seenMemoryIds = new Set<string>();

      for (const sid of sessionIds) {
        const sessionGoals = getGoalsBySession(db, sid, 999999);
        for (const g of sessionGoals) {
          collectGoal(db, g, goals, sessionIds, seenGoalIds);
        }

        const sessionMemories = getMemoriesBySession(db, sid, 999999);
        for (const m of sessionMemories) {
          collectMemory(db, m, memories, sessionIds, seenMemoryIds);
        }
      }

      const memoryVecRows = db.prepare('SELECT memory_id, embedding FROM memory_vectors').all() as Array<{ memory_id: string; embedding: Buffer | Uint8Array }>;
      const memoryIdSet = new Set(memories.map((m: { id: string }) => m.id));
      const memoryVectors = memoryVecRows
        .filter((r) => memoryIdSet.has(r.memory_id))
        .map((r) => ({
          memory_id: r.memory_id,
          embedding_base64: Buffer.from(r.embedding).toString('base64'),
        }));

      const goalVecRows = db.prepare('SELECT goal_id, embedding FROM goal_vectors').all() as Array<{ goal_id: string; embedding: Buffer | Uint8Array }>;
      const goalIdSet = new Set(goals.map((g: { id: string }) => g.id));
      const goalVectors = goalVecRows
        .filter((r) => goalIdSet.has(r.goal_id))
        .map((r) => ({
          goal_id: r.goal_id,
          embedding_base64: Buffer.from(r.embedding).toString('base64'),
        }));

      const exportData = {
        exportedAt: new Date().toISOString(),
        app: 'absolute',
        schema: 1,
        embeddingMetadata,
        sessions,
        goals,
        memories,
        memoryVectors,
        goalVectors,
      };

      const filePath = opts.file ?? join(process.cwd(), `absolute-export-${formatTimestamp()}.json`);
      writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');

      console.log(`Exported to: ${filePath}`);
      console.log(`  sessions: ${sessions.length}`);
      console.log(`  memories: ${memories.length}`);
      console.log(`  goals: ${goals.length}`);
      console.log(`  memory vectors: ${memoryVectors.length}`);
      console.log(`  goal vectors: ${goalVectors.length}`);

      db.close();
    });
}

function collectGoal(
  db: import('better-sqlite3').Database,
  goal: Goal,
  goals: Goal[],
  sessionIds: Set<string>,
  seenIds: Set<string>
): void {
  if (seenIds.has(goal.id)) return;
  if (goal.parent_goal_id && !seenIds.has(goal.parent_goal_id)) {
    const parent = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal.parent_goal_id) as Goal | undefined;
    if (parent) collectGoal(db, parent, goals, sessionIds, seenIds);
  }
  seenIds.add(goal.id);
  goals.push(goal);
}

function collectMemory(
  db: import('better-sqlite3').Database,
  memory: Memory,
  memories: Memory[],
  sessionIds: Set<string>,
  seenIds: Set<string>
): void {
  if (seenIds.has(memory.id)) return;
  if (memory.parent_id && !seenIds.has(memory.parent_id)) {
    const parent = db.prepare('SELECT * FROM memories WHERE id = ?').get(memory.parent_id) as Memory | undefined;
    if (parent) collectMemory(db, parent, memories, sessionIds, seenIds);
  }
  seenIds.add(memory.id);
  memories.push(memory);
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
