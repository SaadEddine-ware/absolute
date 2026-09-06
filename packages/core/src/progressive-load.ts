import type Database from 'better-sqlite3';
import type { Memory, SessionContext } from './types.js';
import {
  loadSessionHeaders,
  drillDownMemory,
  loadByImportance,
} from './memory.js';

export const TOKEN_BUDGET = {
  SESSION_START: 500,
  PER_PROMPT: 200,
  MAX_LOADED: 2000,
} as const;

export function loadSessionContext(
  db: Database.Database,
  sessionId: string,
  opts: { mode?: 'start' | 'prompt' } = {}
): SessionContext {
  const context = loadSessionHeaders(db, sessionId);
  const budget =
    opts.mode === 'prompt' ? TOKEN_BUDGET.PER_PROMPT : TOKEN_BUDGET.SESSION_START;

  if (context.total_tokens_est > budget) {
    const trimmed = loadByImportance(db, sessionId, budget);
    const trimmedIds = new Set(trimmed.map((t) => t.id));
    context.headers = context.headers.filter((h) => trimmedIds.has(h.id));
    context.total_tokens_est = trimmed.reduce((sum, t) => sum + (t.tokens_est || 0), 0);
  }

  return context;
}

export function progressiveDrillDown(
  db: Database.Database,
  memoryId: string,
  maxTokens: number = TOKEN_BUDGET.PER_PROMPT
): { memory: Memory; children: Memory[] } | null {
  try {
    const result = drillDownMemory(db, memoryId);
    const tokens =
      (result.memory.tokens_est || 0) +
      result.children.reduce((sum, c) => sum + (c.tokens_est || 0), 0);

    if (tokens > maxTokens) {
      result.children = result.children
        .slice()
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));

      let budget = maxTokens;
      const kept: Memory[] = [];
      for (const child of result.children) {
        const childTokens = child.tokens_est || 0;
        if (budget - childTokens < 0) break;
        kept.push(child);
        budget -= childTokens;
      }
      result.children = kept;
    }

    return result;
  } catch {
    return null;
  }
}