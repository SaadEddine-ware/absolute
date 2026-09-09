#!/usr/bin/env node
import { Command } from 'commander';
import { runTui } from '@absolute/tui';
import { sessionCommand } from './commands/session.js';
import { configCommand } from './commands/config.js';
import { migrateCommand } from './commands/migrate.js';
import { workerCommand } from './commands/worker.js';
import { providerCommand } from './commands/provider.js';
import { memoryCommand } from './commands/memory.js';
import { doctorCommand } from './commands/doctor.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';

const program = new Command();

program
  .name('absolute')
  .description('ABSOLUTE - AI CLI with Neural Memory')
  .version('0.1.0');

sessionCommand(program);
configCommand(program);
migrateCommand(program);
workerCommand(program);
providerCommand(program);
memoryCommand(program);
doctorCommand(program);
exportCommand(program);
importCommand(program);

// `absolute` with no subcommand launches the TUI chat interface (Phase 4).
program.action(() => {
  runTui();
});

program.parse();
