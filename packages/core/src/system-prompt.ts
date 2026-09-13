import type { SessionContext, MemoryHeader, SystemPromptConfig } from './types.js';

export interface BuildSystemPromptInput {
  context: SessionContext;
  relevantMemories: MemoryHeader[];
  recentPrompt: string;
  providerLabel?: string;
  modelLabel?: string;
  contextNote?: string;
  /** System prompt customization config from config.json. */
  promptConfig?: SystemPromptConfig;
}

const DEFAULT_IDENTITY = 'You are ABSOLUTE, an AI assistant with persistent memory.';
const DEFAULT_INSTRUCTIONS = [
  'Remember context across sessions. When you create goals or make decisions,',
  'note them naturally. The memory system handles persistence automatically.',
].join('\n');

function renderGoals(goals: SessionContext['goals']): string {
  if (goals.length === 0) return '';
  const lines = ['=== ACTIVE GOALS ==='];
  for (const g of goals) {
    const prefix = g.status === 'active' ? '[active]' : `[${g.status}]`;
    lines.push(`  ${prefix} ${g.description}`);
  }
  return lines.join('\n');
}

function renderMemories(headers: MemoryHeader[]): string {
  if (headers.length === 0) return '';
  const lines = ['=== SESSION MEMORIES ==='];
  for (const h of headers) {
    lines.push(`  [${h.type}] ${h.content}`);
  }
  return lines.join('\n');
}

function renderRecalled(memories: MemoryHeader[]): string {
  if (memories.length === 0) return '';
  const lines = ['=== RELEVANT MEMORIES ==='];
  for (const m of memories) {
    lines.push(`  [${m.type}] ${m.content}`);
  }
  return lines.join('\n');
}

function renderInstructions(instructions: string, contextNote?: string): string {
  const lines = ['=== INSTRUCTIONS ===', instructions];
  if (contextNote) {
    lines.push('');
    lines.push(`Note: ${contextNote}`);
  }
  return lines.join('\n');
}

/** Build the default sections from data. */
function buildSections(input: BuildSystemPromptInput): {
  goals: string;
  memories: string;
  recalled: string;
  instructions: string;
} {
  const cfg = input.promptConfig;
  return {
    goals: renderGoals(input.context.goals),
    memories: renderMemories(input.context.headers),
    recalled: renderRecalled(input.relevantMemories),
    instructions: renderInstructions(
      cfg?.instructions ?? DEFAULT_INSTRUCTIONS,
      input.contextNote
    ),
  };
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const cfg = input.promptConfig;
  const sections = buildSections(input);

  // Full template override.
  if (cfg?.template) {
    let result = cfg.template;
    result = result.replace(/\{\{goals\}\}/g, sections.goals);
    result = result.replace(/\{\{memories\}\}/g, sections.memories);
    result = result.replace(/\{\{recalled\}\}/g, sections.recalled);
    result = result.replace(/\{\{instructions\}\}/g, sections.instructions);
    result = result.replace(/\{\{provider\}\}/g, input.providerLabel ?? '');
    result = result.replace(/\{\{model\}\}/g, input.modelLabel ?? '');

    if (cfg.prefix) result = cfg.prefix + '\n\n' + result;
    if (cfg.suffix) result = result + '\n\n' + cfg.suffix;
    return result;
  }

  // Section-level overrides with default structure.
  const identity = cfg?.identity ?? DEFAULT_IDENTITY;
  const parts = [identity, ''];

  if (sections.goals) parts.push(sections.goals, '');
  if (sections.memories) parts.push(sections.memories, '');
  if (sections.recalled) parts.push(sections.recalled, '');
  parts.push(sections.instructions);

  let result = parts.join('\n');
  if (cfg?.prefix) result = cfg.prefix + '\n\n' + result;
  if (cfg?.suffix) result = result + '\n\n' + cfg.suffix;
  return result;
}
