#!/usr/bin/env node
import { Command } from 'commander';
import { sessionCommand } from './commands/session.js';
import { configCommand } from './commands/config.js';
import { migrateCommand } from './commands/migrate.js';

const program = new Command();

program
  .name('absolute')
  .description('ABSOLUTE - AI CLI with Neural Memory')
  .version('0.1.0');

sessionCommand(program);
configCommand(program);
migrateCommand(program);

// Default action: launch TUI when no subcommand is given
program.action(() => {
  // Dynamic import so the CLI bundle doesn't include the TUI dependencies
  // unless actually launching the TUI.
  import('@absolute/tui').then(({ runTui }) => {
    runTui();
  }).catch((err) => {
    console.error('Failed to start TUI:', err.message);
    console.error('Make sure @absolute/tui is built: npm run build -w packages/tui');
    process.exit(1);
  });
});

program.parse();
