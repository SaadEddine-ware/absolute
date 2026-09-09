import { Command } from 'commander';
import { openDatabase, getEmbeddingMetadata, verifyProviderMatchesDb } from '@absolute/core';
import { ProviderManager } from '@absolute/providers';
import { loadConfig, getDbPath } from '../utils/config.js';
import { createAnyProvider } from '../utils/embedding.js';
import { getCredential } from '../utils/auth.js';

interface CheckResult {
  label: string;
  status: 'OK' | 'WARN' | 'ERR';
  detail: string;
}

function tag(result: CheckResult): string {
  return `[${result.status}] ${result.label}: ${result.detail}`;
}

export function doctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run system diagnostics')
    .action(async () => {
      const results: CheckResult[] = [];
      const config = loadConfig();

      // a) Config file
      try {
        loadConfig();
        results.push({ label: 'Config', status: 'OK', detail: 'config file exists and parses' });
      } catch (e) {
        results.push({ label: 'Config', status: 'ERR', detail: e instanceof Error ? e.message : String(e) });
      }

      // b) DB opens + migrations
      let db: Awaited<ReturnType<typeof openDatabase>>['db'] | null = null;
      try {
        const opened = await openDatabase({
          dbPath: getDbPath(),
          embeddingProvider: createAnyProvider(config),
        });
        db = opened.db;
        const row = db.prepare('SELECT MAX(id) as max_id FROM schema_migrations').get() as { max_id: number | null };
        results.push({ label: 'Database', status: 'OK', detail: `migrations applied up to #${row.max_id ?? 0}` });
      } catch (e) {
        results.push({ label: 'Database', status: 'ERR', detail: e instanceof Error ? e.message : String(e) });
        printResults(results);
        process.exitCode = results.filter((r) => r.status === 'ERR').length ? 1 : 0;
        return;
      }

      // c) Embedding metadata vs config provider
      try {
        const meta = getEmbeddingMetadata(db);
        const provider = createAnyProvider(config);
        const check = verifyProviderMatchesDb(db, provider);
        if (check.ok) {
          const modelInfo = meta ? `${meta.model_id} (${meta.dimensions}d)` : '(no metadata row)';
          results.push({ label: 'Embeddings', status: 'OK', detail: `${modelInfo} matches configured provider` });
        } else {
          results.push({ label: 'Embeddings', status: 'WARN', detail: `${check.error}` });
        }
      } catch (e) {
        results.push({ label: 'Embeddings', status: 'WARN', detail: e instanceof Error ? e.message : String(e) });
      }

      // d) Counts
      try {
        const counts: Record<string, number> = {};
        for (const table of ['sessions', 'memories', 'goals', 'memory_vectors', 'goal_vectors']) {
          const row = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
          counts[table] = row.n;
        }
        const memTypes = db.prepare('SELECT type, COUNT(*) as n FROM memories GROUP BY type').all() as Array<{ type: string; n: number }>;
        const typeBreakdown = memTypes.map((r) => `${r.type}:${r.n}`).join(', ') || 'none';
        results.push({ label: 'Counts', status: 'OK', detail: `sessions=${counts.sessions} memories=${counts.memories} (${typeBreakdown}) goals=${counts.goals} mem_vec=${counts.memory_vectors} goal_vec=${counts.goal_vectors}` });
      } catch (e) {
        results.push({ label: 'Counts', status: 'ERR', detail: e instanceof Error ? e.message : String(e) });
      }

      // e) LLM provider
      try {
        const providerId = config.provider ?? 'openai';
        const manager = new ProviderManager();
        const prov = manager.get(providerId);
        if (!prov) {
          results.push({ label: 'LLM Provider', status: 'WARN', detail: `unknown provider "${providerId}"` });
        } else {
          const key = await getCredential(providerId);
          if (key) {
            results.push({ label: 'LLM Provider', status: 'OK', detail: `provider "${providerId}" configured` });
          } else {
            results.push({ label: 'LLM Provider', status: 'WARN', detail: `no key found for provider "${providerId}"` });
          }
        }
      } catch (e) {
        results.push({ label: 'LLM Provider', status: 'WARN', detail: e instanceof Error ? e.message : String(e) });
      }

      // f) Orphan check
      try {
        const row = db.prepare(
          'SELECT COUNT(*) as n FROM memory_vectors mv LEFT JOIN memories m ON mv.memory_id = m.id WHERE m.id IS NULL'
        ).get() as { n: number };
        if (row.n > 0) {
          results.push({ label: 'Orphan Vectors', status: 'ERR', detail: `${row.n} memory_vectors rows with no matching memory` });
        } else {
          results.push({ label: 'Orphan Vectors', status: 'OK', detail: 'no orphaned memory_vectors rows' });
        }
      } catch (e) {
        results.push({ label: 'Orphan Vectors', status: 'WARN', detail: e instanceof Error ? e.message : String(e) });
      }

      db.close();
      printResults(results);
      process.exitCode = results.filter((r) => r.status === 'ERR').length ? 1 : 0;
    });
}

function printResults(results: CheckResult[]): void {
  for (const r of results) {
    console.log(tag(r));
  }
  const errCount = results.filter((r) => r.status === 'ERR').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;
  console.log(`\n${errCount} error(s), ${warnCount} warning(s)`);
}
