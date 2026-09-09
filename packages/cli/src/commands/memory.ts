import { Command } from 'commander';
import {
  openDatabase,
  getSessions,
  getSession,
  getMemoriesBySession,
  getMemory,
  getMemoriesByParent,
  deleteMemory,
} from '@absolute/core';
import { loadConfig, getDbPath } from '../utils/config.js';
import { createAnyProvider } from '../utils/embedding.js';
import { confirm } from '../utils/prompt.js';

async function getDb() {
  const config = loadConfig();
  return openDatabase({ dbPath: getDbPath(), embeddingProvider: createAnyProvider(config) });
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function memoryCommand(program: Command): void {
  const memory = program
    .command('memory')
    .description('Inspect and manage memories');

  memory
    .command('list [sessionId]')
    .description('List memories, optionally filtered to a single session')
    .action(async (sessionId?: string) => {
      const { db } = await getDb();
      const sessions = sessionId
        ? [getSession(db, sessionId)].filter(Boolean) as Array<{ id: string; title: string | null; created_at: string }>
        : getSessions(db, 50);

      if (sessions.length === 0) {
        console.log('No sessions found.');
        db.close();
        return;
      }

      for (const s of sessions) {
        const date = new Date(s.created_at).toLocaleString();
        console.log(`session ${s.id} (${s.title ?? 'Untitled'}, ${date})`);
        const memories = getMemoriesBySession(db, s.id);
        for (const m of memories) {
          const snippet = truncate(m.content.replace(/\n/g, ' '), 70);
          console.log(`  ${m.id} [${m.type}] imp:${m.importance} tok:${m.tokens_est ?? '?'} ${snippet}`);
        }
      }

      db.close();
    });

  memory
    .command('show <id>')
    .description('Show full details of a memory and its children')
    .action(async (id: string) => {
      const { db } = await getDb();
      const mem = getMemory(db, id);
      if (!mem) {
        console.error(`Memory not found: ${id}`);
        db.close();
        process.exit(1);
      }

      console.log(`id         : ${mem.id}`);
      console.log(`type       : ${mem.type}`);
      console.log(`content    : ${mem.content}`);
      console.log(`keys       : ${mem.keys}`);
      console.log(`importance : ${mem.importance}`);
      console.log(`tokens_est : ${mem.tokens_est ?? '(none)'}`);
      console.log(`session_id : ${mem.session_id}`);
      console.log(`goal_id    : ${mem.goal_id ?? '(none)'}`);
      console.log(`parent_id  : ${mem.parent_id ?? '(none)'}`);
      console.log(`created_at : ${mem.created_at}`);
      console.log(`updated_at : ${mem.updated_at}`);

      const children = getMemoriesByParent(db, id);
      if (children.length > 0) {
        console.log(`\nChildren (${children.length}):`);
        for (const c of children) {
          console.log(`  ${c.id} [${c.type}] imp:${c.importance} ${truncate(c.content.replace(/\n/g, ' '), 70)}`);
        }
      }

      db.close();
    });

  memory
    .command('delete <id>')
    .description('Delete a memory')
    .action(async (id: string) => {
      const { db } = await getDb();
      const mem = getMemory(db, id);
      if (!mem) {
        console.error(`Memory not found: ${id}`);
        db.close();
        process.exit(1);
      }

      const ok = await confirm('Delete this memory?', 'no');
      if (!ok) {
        console.log('Aborted.');
        db.close();
        return;
      }

      deleteMemory(db, id);
      console.log(`Deleted memory: ${id}`);
      db.close();
    });
}
