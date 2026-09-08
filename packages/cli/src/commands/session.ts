import { Command } from 'commander';
import {
  openDatabase,
  createSession,
  getSession,
  getSessions,
  deleteSession,
} from '@absolute/core';
import { loadConfig, getDbPath } from '../utils/config.js';
import { createAnyProvider } from '../utils/embedding.js';

async function getDb() {
  const config = loadConfig();
  return openDatabase({ dbPath: getDbPath(), embeddingProvider: createAnyProvider(config) });
}

export function sessionCommand(program: Command): void {
  const session = program
    .command('session')
    .description('Manage sessions');

  session
    .command('start')
    .description('Start a new session')
    .option('-t, --title <title>', 'Session title')
    .action(async (opts) => {
      const { db } = await getDb();
      const session = createSession(db, { title: opts.title });
      console.log(`Session started: ${session.id}`);
      if (session.title) {
        console.log(`Title: ${session.title}`);
      }
      db.close();
    });

  session
    .command('list')
    .description('List all sessions')
    .option('-n, --limit <n>', 'Max sessions to show', '20')
    .action(async (opts) => {
      const { db } = await getDb();
      const sessions = getSessions(db, parseInt(opts.limit, 10));
      if (sessions.length === 0) {
        console.log('No sessions found.');
        db.close();
        return;
      }
      console.log(`Sessions (${sessions.length}):\n`);
      for (const s of sessions) {
        const date = new Date(s.created_at).toLocaleString();
        const title = s.title ?? 'Untitled';
        console.log(`  ${s.id}  ${title}  ${date}`);
      }
      db.close();
    });

  session
    .command('continue <id>')
    .description('Continue an existing session')
    .action(async (id) => {
      const { db } = await getDb();
      const session = getSession(db, id);
      if (!session) {
        console.error(`Session not found: ${id}`);
        db.close();
        process.exit(1);
      }
      console.log(`Continuing session: ${session.id}`);
      if (session.title) {
        console.log(`Title: ${session.title}`);
      }
      db.close();
    });

  session
    .command('delete <id>')
    .description('Delete a session')
    .action(async (id) => {
      const { db } = await getDb();
      const deleted = deleteSession(db, id);
      if (deleted) {
        console.log(`Deleted session: ${id}`);
      } else {
        console.error(`Session not found: ${id}`);
      }
      db.close();
    });
}
