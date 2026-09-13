// Command system: registry + built-in commands. Modeled after OpenCode's
// 3-tier architecture: built-in commands, custom user commands (config),
// and plugin-provided commands (future).
import type { AbsoluteDatabase } from '@absolute/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Actions the command handler can invoke. */
export interface CommandContext {
  /** Print a system message in the chat. */
  pushSystem: (msg: string) => void;
  /** Clear the on-screen chat history. */
  clear: () => void;
  /** Exit the TUI. */
  exit: () => void;
  /** Start a new session. */
  handleNew: () => Promise<void>;
  /** Switch the main view. */
  setView: (view: 'chat' | 'sessions' | 'memories' | 'goals' | 'settings') => void;
  /** Open/close an overlay. */
  setOverlayBoth: (overlay: 'none' | 'help' | 'command' | 'themes' | 'models' | 'connect') => void;
  /** The open database (may be null during startup). */
  db: AbsoluteDatabase | null;
  /** Current session id (may be null if no session). */
  sessionId: string | null;
  /** Current provider name. */
  provider: string;
  /** Current model name. */
  model: string;
}

/** Argument definition for a command. */
export interface CommandArg {
  /** Argument name (used in help text). */
  name: string;
  /** Is this argument required? Defaults to false. */
  required?: boolean;
  /** Default value if not provided. */
  default?: string;
}

/** A single command definition. */
export interface CommandDef {
  /** Command name (without the leading `/`). */
  name: string;
  /** Short description shown in help / autocomplete. */
  description: string;
  /** Which category the command belongs to (for grouping in help). */
  category: 'session' | 'memory' | 'navigation' | 'config' | 'user';
  /** Argument definitions (positional, in order). */
  args?: CommandArg[];
  /** Command aliases (other names that trigger this command). */
  aliases?: string[];
  /** Execute the command. */
  handler: (args: string, ctx: CommandContext) => void | Promise<void>;
}

/** User-defined command from config.json. */
export interface UserCommandDef {
  /** Short description. */
  description?: string;
  /** Prompt template. Supports $ARGUMENTS, $1, $2, etc. */
  template: string;
  /** Argument hints (names shown in help). */
  args?: string[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDef>();
  private readonly aliasMap = new Map<string, string>();

  /** Register a command. Overwrites if name already exists. */
  register(def: CommandDef): void {
    this.commands.set(def.name, def);
    if (def.aliases) {
      for (const alias of def.aliases) {
        this.aliasMap.set(alias, def.name);
      }
    }
  }

  /** Register multiple commands at once. */
  registerAll(defs: CommandDef[]): void {
    for (const def of defs) this.register(def);
  }

  /** Look up a command by name or alias. Returns undefined if not found. */
  resolve(name: string): CommandDef | undefined {
    const canonical = this.aliasMap.get(name) ?? name;
    return this.commands.get(canonical);
  }

  /** Get all registered commands (sorted by category, then name). */
  list(): CommandDef[] {
    return [...this.commands.values()].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
  }

  /** Get command names for autocomplete. */
  names(): string[] {
    return [...this.commands.keys()].sort();
  }

  /**
   * Load user-defined commands from config and register them.
   * User commands go into the 'user' category.
   */
  loadUserCommands(userCommands: Record<string, UserCommandDef>): void {
    for (const [name, def] of Object.entries(userCommands)) {
      const args: CommandArg[] | undefined = def.args?.map((argName) => ({
        name: argName,
        required: false,
      }));
      this.register({
        name,
        description: def.description ?? `Custom command: ${name}`,
        category: 'user',
        args,
        handler: (rawArgs, ctx) => {
          const result = substituteTemplate(def.template, rawArgs);
          ctx.pushSystem(`[custom:${name}] Sending prompt...`);
          // For now, display the resolved template. In the future, this
          // could route directly to the LLM pipeline.
          ctx.pushSystem(result);
        },
      });
    }
  }

  /**
   * Execute a command. Returns true if found, false otherwise.
   * Handles: parsing the name, resolving aliases, splitting args, dispatching.
   */
  async execute(rawInput: string, ctx: CommandContext): Promise<boolean> {
    const trimmed = rawInput.trim();
    if (!trimmed) return false;

    // Strip leading slash
    const input = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const spaceIdx = input.indexOf(' ');
    const name = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1).trim();

    const cmd = this.resolve(name);
    if (!cmd) return false;

    try {
      await cmd.handler(args, ctx);
    } catch (err) {
      ctx.pushSystem(`Error in /${cmd.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Template substitution
// ---------------------------------------------------------------------------

/** Replace $ARGUMENTS, $1, $2, etc. in a template string. */
export function substituteTemplate(template: string, rawArgs: string): string {
  const parts = rawArgs.split(/\s+/).filter(Boolean);
  const allArgs = rawArgs; // raw, unsplit

  let result = template;
  result = result.replace(/\$ARGUMENTS/g, allArgs);

  // Positional: $1, $2, ... $9
  for (let i = 1; i <= 9; i++) {
    const pattern = new RegExp(`\\$${i}`, 'g');
    result = result.replace(pattern, parts[i - 1] ?? '');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------

const BUILTIN_COMMANDS: CommandDef[] = [
  // -- session --
  {
    name: 'new',
    description: 'Start a new session (clears context)',
    category: 'session',
    aliases: ['clear'],
    handler: (_args, ctx) => {
      ctx.pushSystem('Starting a new session...');
      void ctx.handleNew().then(() => {
        ctx.pushSystem('New session started. Say hello to begin.');
      });
    },
  },
  {
    name: 'compact',
    description: 'Compact/summarize current session to reduce token usage',
    category: 'session',
    aliases: ['summarize'],
    handler: (_args, ctx) => {
      ctx.pushSystem('Compacting session...');
      // TODO: wire to actual compaction pipeline
      ctx.pushSystem('Session compaction is not yet implemented.');
    },
  },
  {
    name: 'undo',
    description: 'Undo last message and revert file changes',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.pushSystem('Undo is not yet implemented.');
    },
  },
  {
    name: 'redo',
    description: 'Redo a previously undone message and restore file changes',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.pushSystem('Redo is not yet implemented.');
    },
  },

  // -- memory --
  {
    name: 'memories',
    description: 'View and manage stored memories',
    category: 'memory',
    handler: (_args, ctx) => {
      ctx.setView('memories');
    },
  },
  {
    name: 'goals',
    description: 'View and manage goal hierarchy',
    category: 'memory',
    handler: (_args, ctx) => {
      ctx.setView('goals');
    },
  },

  // -- navigation --
  {
    name: 'help',
    description: 'Show available commands',
    category: 'navigation',
    handler: (_args, ctx) => {
      ctx.setOverlayBoth('help');
    },
  },
  {
    name: 'sessions',
    description: 'Switch to the sessions screen',
    category: 'navigation',
    aliases: ['resume', 'continue'],
    handler: (_args, ctx) => {
      ctx.setView('sessions');
    },
  },
  {
    name: 'settings',
    description: 'Open settings screen',
    category: 'navigation',
    handler: (_args, ctx) => {
      ctx.setView('settings');
    },
  },
  {
    name: 'themes',
    description: 'Open the theme picker',
    category: 'navigation',
    handler: (_args, ctx) => {
      ctx.setOverlayBoth('themes');
    },
  },
  {
    name: 'quit',
    description: 'Exit the TUI',
    category: 'navigation',
    aliases: ['exit', 'q'],
    handler: (_args, ctx) => {
      ctx.exit();
    },
  },

  // -- config --
  {
    name: 'connect',
    description: 'Add or update AI provider credentials (API keys)',
    category: 'config',
    handler: (_args, ctx) => {
      ctx.setOverlayBoth('connect');
    },
  },
  {
    name: 'models',
    description: 'Show available models and switch provider',
    category: 'config',
    handler: (_args, ctx) => {
      ctx.setOverlayBoth('models');
    },
  },
  {
    name: 'details',
    description: 'Toggle tool execution details visibility',
    category: 'config',
    handler: (_args, ctx) => {
      ctx.pushSystem('Tool details toggle is not yet implemented.');
    },
  },
  {
    name: 'thinking',
    description: 'Toggle visibility of AI thinking/reasoning blocks',
    category: 'config',
    handler: (_args, ctx) => {
      ctx.pushSystem('Thinking toggle is not yet implemented.');
    },
  },

  // -- sharing --
  {
    name: 'share',
    description: 'Create a public shareable link for the current session',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.pushSystem('Share is not yet implemented.');
    },
  },
  {
    name: 'unshare',
    description: 'Remove public access from a shared session',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.pushSystem('Unshare is not yet implemented.');
    },
  },

  // -- export / editor --
  {
    name: 'export',
    description: 'Export conversation as Markdown',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.pushSystem('Export is not yet implemented.');
    },
  },
  {
    name: 'editor',
    description: 'Open external $EDITOR for composing messages',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.pushSystem('External editor is not yet implemented.');
    },
  },

  // -- init --
  {
    name: 'init',
    description: 'Guided setup for creating/updating AGENTS.md',
    category: 'config',
    handler: (_args, ctx) => {
      ctx.pushSystem('AGENTS.md init is not yet implemented.');
    },
  },
];

// ---------------------------------------------------------------------------
// Singleton registry
// ---------------------------------------------------------------------------

let _instance: CommandRegistry | null = null;

/** Get the global command registry (lazy singleton). */
export function getCommandRegistry(): CommandRegistry {
  if (!_instance) {
    _instance = new CommandRegistry();
    _instance.registerAll(BUILTIN_COMMANDS);
  }
  return _instance;
}
