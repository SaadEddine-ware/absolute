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
  createGoal,
  getActiveGoals,
  updateGoal,
  storeGoalVector,
  type AbsoluteDatabase,
  type EmbeddingProvider,
  type MemoryHeader,
  type SessionContext,
  type Goal,
  type ContextDecision,
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

// Phase 8 goal tracking: auto-created topic goals. Description length is
// capped so the system prompt / confirm prompt stay tight.
export const GOAL_DESC_MAX_CHARS = 140;

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
  /** Decision surfaced from detectContext (Phase 8 goal tracking). */
  decision: ContextDecision;
  /** The active goal used for detection, or the goal created on this pass. */
  goal?: Goal | null;
  /** True when a goal was created during this SYNC pass (initial or switch). */
  goalCreated?: boolean;
  /** 'created' when the first goal anchored the session; 'switched' on a topic change. */
  goalAction?: 'created' | 'switched' | null;
}

// [SYNC] Runs before the LLM call: embedding + sqlite-vec KNN (in + cross
// session) with a hard timeout. On timeout/unreachable it falls back to
// "continue without context check" with the base session context only.
// Phase 8: also maintains the session's active goal — the first message
// anchors a goal when none exists, and a 'switch' decision supersedes the
// current goal (paused) with a new one from the prompt.
export async function detectSessionContext(
  db: AbsoluteDatabase,
  provider: EmbeddingProvider,
  prompt: string,
  sessionId: string
): Promise<SyncResult> {
  const sessionContext = loadSessionContext(db.db, sessionId, { mode: 'prompt' });
  try {
    const activeGoal = getActiveGoals(db.db, sessionId)[0] ?? null;
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

    // A decision is only meaningful when an active goal with a stored vector
    // was actually compared (goalEvaluated). Without one the degenerate
    // similarity=0 -> 'switch' case would cascade into spurious goal churn.
    const decision: ContextDecision = result.goalEvaluated ? result.decision : 'continue';

    let goal = activeGoal;
    let goalCreated = false;
    let goalAction: SyncResult['goalAction'] = null;
    if (!goal) {
      const created = await ensureInitialGoal(db, provider, prompt, sessionId);
      goal = created.goal;
      goalCreated = created.created;
      goalAction = created.created ? 'created' : null;
    } else if (decision === 'switch') {
      const superseded = await supersedeGoals(db, provider, prompt, sessionId);
      goal = superseded.goal;
      goalCreated = true;
      goalAction = 'switched';
    }

    return {
      sessionContext,
      relevantMemories: merged.slice(0, RECALL_TOP_K * 2),
      note: result.fallback ? result.reason : undefined,
      decision,
      goal,
      goalCreated,
      goalAction,
    };
  } catch {
    // Detection is best-effort; a local SQL failure must never break chat.
    return { sessionContext, relevantMemories: [], note: undefined, decision: 'continue', goal: getActiveGoals(db.db, sessionId)[0] ?? null };
  }
}

// ---- Phase 8 goal helpers -------------------------------------------------

function goalDescriptionFromPrompt(prompt: string): string {
  return prompt.trim().slice(0, GOAL_DESC_MAX_CHARS);
}

// Storing the goal vector is ASYNC (fire-and-forget): the goal row itself is
// created synchronously so the 'ask' confirm / 'switch' supersede never waits
// on the embedding network call. Until the vector lands, detectContext leaves
// goalEvaluated=false and the pipeline coerces the decision to 'continue'.
function embedGoalVector(
  db: AbsoluteDatabase,
  provider: EmbeddingProvider,
  goalId: string,
  text: string
): void {
  void embedWithTimeout(provider, text, ASYNC_EMBED_TIMEOUT_MS)
    .then((v) => {
      if (v && v.length === provider.dimensions) {
        storeGoalVector(db.db, goalId, v);
      }
    })
    .catch(() => {
      // best-effort; a missing goal vector only postpones goal evaluation
    });
}

// Creates the session's first goal. Idempotent: never creates while an active
// goal already exists (the natural per-session anchor).
export async function ensureInitialGoal(
  db: AbsoluteDatabase,
  provider: EmbeddingProvider,
  prompt: string,
  sessionId: string
): Promise<{ goal: Goal; created: boolean }> {
  const existing = getActiveGoals(db.db, sessionId)[0];
  if (existing) return { goal: existing, created: false };
  const goal = createGoal(db.db, {
    description: goalDescriptionFromPrompt(prompt),
    status: 'active',
    level: 'goal',
    session_id: sessionId,
    keys: {},
  });
  embedGoalVector(db, provider, goal.id, goal.description);
  return { goal, created: true };
}

// Supersedes the current topic: pause every active goal, then create a new
// one from the prompt (flat topic history — level=goal, root-level).
export async function supersedeGoals(
  db: AbsoluteDatabase,
  provider: EmbeddingProvider,
  prompt: string,
  sessionId: string
): Promise<{ goal: Goal; paused: number }> {
  const actives = getActiveGoals(db.db, sessionId);
  for (const g of actives) {
    updateGoal(db.db, g.id, { status: 'paused' });
  }
  const goal = createGoal(db.db, {
    description: goalDescriptionFromPrompt(prompt),
    status: 'active',
    level: 'goal',
    session_id: sessionId,
    keys: {},
  });
  embedGoalVector(db, provider, goal.id, goal.description);
  return { goal, paused: actives.length };
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