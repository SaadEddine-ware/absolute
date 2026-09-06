import type {
  SessionContext,
  MemoryHeader,
  GoalHeader,
} from './types.js';

export interface SystemPromptInput {
  context: SessionContext;
  recentPrompt?: string;
  recentAction?: string;
  providerLabel?: string;
  modelLabel?: string;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const { context } = input;
  const parts: string[] = [];

  parts.push(`You are ABSOLUTE, an AI assistant with persistent memory.`);
  parts.push('');

  if (input.providerLabel || input.modelLabel) {
    parts.push(
      `Current LLM: ${input.providerLabel ?? 'unknown'} / ${input.modelLabel ?? 'unknown'}`
    );
    parts.push('');
  }

  parts.push('=== ACTIVE GOALS ===');
  parts.push(renderGoalHeaders(context.goals));
  parts.push('');

  parts.push('=== SESSION MEMORIES ===');
  parts.push(renderMemoryHeaders(context.headers));
  parts.push('');

  parts.push('=== RECENT CONTEXT ===');
  if (input.recentPrompt) {
    parts.push(`- Last prompt: "${input.recentPrompt}"`);
  }
  if (input.recentAction) {
    parts.push(`- Last action: ${input.recentAction}`);
  }
  if (!input.recentPrompt && !input.recentAction) {
    parts.push('- This is the start of the conversation.');
  }
  parts.push('');

  parts.push('=== INSTRUCTIONS ===');
  parts.push(
    'Remember context across sessions. When you create goals or make decisions, ' +
      'note them naturally. The memory system handles persistence automatically.'
  );
  parts.push('');

  return parts.join('\n');
}

function renderMemoryHeaders(headers: MemoryHeader[]): string {
  if (headers.length === 0) return '(none)';
  return headers
    .map((h) => {
      const childInfo = h.child_count > 0 ? ` (${h.child_count} children)` : '';
      return `  [${h.type}] ${h.content}${childInfo}`;
    })
    .join('\n');
}

function renderGoalHeaders(goals: GoalHeader[]): string {
  if (goals.length === 0) return '(none)';
  return goals
    .map((g) => {
      const childInfo = g.child_count > 0 ? ` (${g.child_count} sub-goals)` : '';
      return `  [${g.level}] ${g.description} (${g.status})${childInfo}`;
    })
    .join('\n');
}