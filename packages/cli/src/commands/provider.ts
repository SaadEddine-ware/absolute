import { Command } from 'commander';
import { ProviderManager } from '@absolute/providers';
import { loadConfig, saveConfig } from '../utils/config.js';
import { promptPassword } from '../utils/prompt.js';

// `provider set <id>` wants an API key. Accept --key and --token as aliases so
// non-interactive shells can pass it; otherwise prompt.
export function providerCommand(program: Command): void {
  const manager = new ProviderManager();

  const provider = program
    .command('provider')
    .description('Manage LLM providers');

  provider
    .command('list')
    .description('List LLM providers with free-tier flags and configuration status')
    .action(async () => {
      const config = loadConfig();
      const active = config.provider ?? '(none)';
      console.log(`Active provider: ${active}\n`);
      console.log('Available providers:');
      for (const p of manager.list()) {
        const configured = (await manager.get(p.id)?.isConfigured()) ? 'configured' : 'not configured';
        const free = p.freeTier ? 'free-tier' : 'paid';
        const marker = p.id === active ? ' *' : '  ';
        console.log(`${marker} ${p.id.padEnd(10)} ${p.name.padEnd(12)} ${free.padEnd(10)} ${configured}`);
      }
      console.log('\nSet a provider: `absolute provider set <id> <key>`');
    });

  provider
    .command('set <id> [key]')
    .option('-t, --token <token>', 'API key (alias for [key])')
    .description('Configure an LLM provider API key and set it active')
    .action(async (id, key, opts) => {
      const normalized = id.toLowerCase();
      const prov = manager.get(normalized);
      if (!prov) {
        console.error(`Unknown provider "${normalized}". Run \`absolute provider list\`.`);
        process.exit(1);
      }

      const provided = key ?? opts.token ?? (await promptPassword(`API key for ${prov.name}:`));
      if (!provided) {
        console.error('No API key provided. Pass it as the second argument or --token.');
        process.exit(1);
      }

      await prov.saveKey(provided);

      // Persist as the active provider.
      const config = loadConfig();
      config.provider = normalized;
      saveConfig(config);

      console.log(`${prov.name} configured and set as the active provider.`);
      console.log(`Default model: ${prov.defaultModel}`);
      console.log(`Run \`absolute provider test ${normalized}\` to verify.`);
    });

  provider
    .command('test <id>')
    .description('Test a provider connection (sends a tiny prompt)')
    .action(async (id) => {
      const normalized = id.toLowerCase();
      const result = await manager.test(normalized);
      if (result.ok) {
        console.log(`OK (${result.latencyMs ?? '?'}ms): ${result.message}`);
        process.exit(0);
      }
      console.error(`FAILED: ${result.message}`);
      process.exit(1);
    });
}