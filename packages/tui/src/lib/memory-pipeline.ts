// Phase 6 memory pipeline: pure/reusable helpers shared by useChat (SYNC
// context detection + system-prompt injection) and useMemory (ASYNC storage).
import {
  createMemory,
  storeMemoryVector,
  detectContext,
  loadSessionContext,
  embedWithTimeout,
  buildSystemPrompt,
  extractKeywords,
  type AbsoluteDatabase,
  type EmbeddingProvider,
  type MemoryHeader,
  type SessionContext,
} from '@absolute/core';
import type { LLMMessage } from '@absolute/providers';

export interface Exchange {
  prompt: string;
  response: string;
}

export const SYNC_DETECT_TIMEOUT_MS = 500;
export const ASYNC_EMBED_TIMEOUT_MS = 2000;
export const RECALL_TOP_K = 5;
export const MAX_HISTORY_TURNS = 20;

// Importance is scored locally (type + position heuristics, no LLM call).
const DIRECTIVE_WORDS = [
  'build', 'create', 'implement', 'make', 'fix', 'setup', 'configure',
  'write', 'add', 'develop', 'design', 'deploy', 'install', 'refactor',
  'migrate', 'delete', 'update', 'test', 'debug',
];

export function scoreImportance(prompt: string, response: string): number {
  const low = prompt.toLowerCase();
  let score = 5;
  if (DIRECTIVE_WORDS.some((w) => low.includes(w))) score += 3;
  const words = response.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 120) score += 1;
  if (low.length < 15) score -= 1;
  return Math.min(10, Math.max(1, score));
}

export function extractExchangeKeywords(prompt: string, response: string): string[] {
  return extractKeywords(`${prompt} ${response}`);
}

function formatExchangeContent(prompt: string, response: string): string {
  const p = prompt.trim().slice(0, 1000);
  const r = response.trim().slice(0, 4000);
  return `User: ${p}\nAssistant: ${r}`;
}

export interface BuildNextMessagesInput {
  prompt: string;
  sessionContext: SessionContext;
  relevantMemories: MemoryHeader[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  providerLabel?: string;
  modelLabel?: string;
  contextNote?: string;
}

// Assembled LLM request: system prompt (with recalled memory context) +
// recent conversation history + the new user message. System role is safe for
// every provider — anthropic.ts partitions it into the top-level `system` param.
export function buildNextMessages(input: BuildNextMessagesInput): LLMMessage[] {
  const system = buildSystemPrompt({
    context: input.sessionContext,
    relevantMemories: input.relevantMemories,
    recentPrompt: input.prompt,
    providerLabel: input.providerLabel,
    modelLabel: input.modelLabel,
    contextNote: input.contextNote,
  });
  return [
    { role: 'system', content: system },
    ...input.history,
    { role: 'user', content: input.prompt },
  ];
}

export interface SyncResult {
  sessionContext: SessionContext;
  relevantMemories: MemoryHeader[];
  note?: string;
}

// [SYNC] Runs before the LLM call: embedding + sqlite-vec KNN (in + cross
// session) with a hard timeout. On timeout/unreachable it falls back to
// "continue without context check" with the base session context only.
export async function detectSessionContext(
  db: AbsoluteDatabase,
  provider: EmbeddingProvider,
  prompt: string,
  sessionId: string
): Promise<SyncResult> {
  const sessionContext = loadSessionContext(db.db, sessionId, { mode: 'prompt' });
  try {
    const result = await detectContext(db.db, provider, prompt, {
      sessionId,
      timeoutMs: SYNC_DETECT_TIMEOUT_MS,
      topK: RECALL_TOP_K,
      crossSessionTopK: RECALL_TOP_K,
    });
    const seen = new Set<string>();
    const merged: MemoryHeader[] = [];
    for (const m of [...result.relevantMemories, ...result.crossSessionMemories]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }
    return {
      sessionContext,
      relevantMemories: merged.slice(0, RECALL_TOP_K * 2),
      note: result.fallback ? result.reason : undefined,
    };
  } catch {
    // Detection is best-effort; a local SQL failure must never break chat.
    return { sessionContext, relevantMemories: [], note: undefined };
  }
}

// [ASYNC] Fire-and-forget: create a memory row + vec0 vector row from an
// exchange. Keyword extraction and importance are local; the embedding is
// attempted with its own timeout and skipped (without erring) if it stalls.
export async function storeExchangeMemory(
  db: AbsoluteDatabase,
  provider: EmbeddingProvider,
  sessionId: string,
  exchange: Exchange
): Promise<void> {
  try {
    const content = formatExchangeContent(exchange.prompt, exchange.response);
    const memory = createMemory(db.db, {
      session_id: sessionId,
      type: 'prompt_answer',
      content,
      keys: { keywords: extractExchangeKeywords(exchange.prompt, exchange.response) },
      importance: scoreImportance(exchange.prompt, exchange.response),
    });
    const embedding = await embedWithTimeout(provider, content, ASYNC_EMBED_TIMEOUT_MS);
    if (embedding && embedding.length === provider.dimensions) {
      storeMemoryVector(db.db, memory.id, embedding);
    }
  } catch {
    // ASYNC storage must never propagate into the chat loop.
  }
}