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

program.parse();
