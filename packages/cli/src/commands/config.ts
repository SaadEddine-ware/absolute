import { Command } from 'commander';
import { loadConfig, saveConfig, getConfigPath, type AbsoluteConfig } from '../utils/config.js';

export function configCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage configuration');

  config
    .command('list')
    .description('List all configuration')
    .action(() => {
      const cfg = loadConfig();
      console.log(JSON.stringify(cfg, null, 2));
    });

  config
    .command('get <key>')
    .description('Get a config value (dot notation)')
    .action((key) => {
      const cfg = loadConfig();
      const keys = key.split('.');
      let value: unknown = cfg;
      for (const k of keys) {
        if (value === null || value === undefined) break;
        value = (value as Record<string, unknown>)[k];
      }
      if (value === undefined) {
        console.log('(not set)');
      } else if (typeof value === 'object') {
        console.log(JSON.stringify(value, null, 2));
      } else {
        console.log(String(value));
      }
    });

  config
    .command('set <key> <value>')
    .description('Set a config value (dot notation)')
    .action((key, value) => {
      const cfg = loadConfig();
      const keys = key.split('.');
      let target = cfg as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        if (target[keys[i]] === undefined || target[keys[i]] === null) {
          target[keys[i]] = {};
        }
        target = target[keys[i]] as Record<string, unknown>;
      }
      try {
        target[keys[keys.length - 1]] = JSON.parse(value);
      } catch {
        target[keys[keys.length - 1]] = value;
      }
      saveConfig(cfg as AbsoluteConfig);
      console.log(`Set ${key} = ${JSON.stringify(target[keys[keys.length - 1]])}`);
      console.log(`Config saved to: ${getConfigPath()}`);
    });

  config
    .command('path')
    .description('Show config file path')
    .action(() => {
      console.log(getConfigPath());
    });
}
