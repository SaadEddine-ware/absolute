import { Command } from 'commander';
import {
  openDatabase,
  migrateEmbeddings,
} from '@absolute/core';
import { loadConfig, getDbPath } from '../utils/config.js';
import { createAnyProvider } from '../utils/embedding.js';

export function migrateCommand(program: Command): void {
  program
    .command('migrate embeddings')
    .description('Re-embed all memories and goals with the current embedding provider')
    .action(async () => {
      const config = loadConfig();
      const provider = createAnyProvider(config);

      const { db } = await openDatabase({ dbPath: getDbPath(), embeddingProvider: provider, skipEmbeddingValidation: true });

      const memories = db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
      const goals = db.prepare('SELECT COUNT(*) as count FROM goals').get() as { count: number };

      console.log(`Migrating ${memories.count} memories and ${goals.count} goals...`);
      console.log(`From: (previous) -> To: ${provider.modelId}`);

      const result = await migrateEmbeddings(db, provider);

      console.log(`\nMigration complete:`);
      console.log(`  Memories re-embedded: ${result.memoriesReembed}`);
      console.log(`  Goals re-embedded: ${result.goalsReembed}`);
      console.log(`  Provider: ${result.oldModelId} -> ${result.newModelId}`);
      if (result.dimensionsChanged) {
        console.log(`  Dimensions changed: vec0 tables recreated`);
      }
      console.log(`  Adaptive threshold reset to 0.6`);

      db.close();
    });
}
