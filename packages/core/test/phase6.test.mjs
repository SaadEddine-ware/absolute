// Phase 6 verification tests (PLAN.md:500-509, memory + chat integration).
//
// Covers the core-support pieces the TUI chat integration relies on:
//   (A) searchSimilarMemoriesGlobal KNN — a brand-new session recalls memories
//       stored in OTHER sessions (the Phase 6 verify: "start new session, AI
//       remembers previous context").
//   (B) detectContext with crossSessionTopK merges cross-session memories.
//   (C) buildSystemPrompt injects relevant memories + context note.
//   (D) extractKeywords is exported and behaves as a local filter.
//
// Run from packages/core: `npm test` (requires a prior `npm run build`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase,
  createSession,
  createMemory,
  storeMemoryVector,
  detectContext,
  searchSimilarMemories,
  searchSimilarMemoriesGlobal,
  buildSystemPrompt,
  extractKeywords,
} from '../dist/index.js';

const DIM = 768;

function axisVec(index, scale = 1) {
  const v = new Float32Array(DIM);
  v[index] = scale;
  return v;
}

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'absolute-phase6-'));
  return { dir, dbPath: join(dir, 'test.db') };
}

function cleanup({ dir }) {
  rmSync(dir, { recursive: true, force: true });
}

function controlledProvider(nextVec) {
  return {
    modelId: 'fake:test',
    dimensions: DIM,
    async embed() {
      const v = nextVec();
      if (!v) throw new Error('test provider was not primed');
      return v;
    },
  };
}

test('(A) searchSimilarMemoriesGlobal recalls memories from other sessions only', async () => {
  const { dir, dbPath } = tempDbPath();
  const provider = { modelId: 'fake:test', dimensions: DIM, async embed() { throw new Error('unused'); } };
  const { db } = await openDatabase({ dbPath, embeddingProvider: provider });
  try {
    const oldSession = createSession(db, { title: 'previous' });
    const newSession = createSession(db, { title: 'new' });

    // A memory about the same topic lives only in the OLD session.
    const oldMem = createMemory(db, { type: 'subject', content: 'design the REST API model layer', session_id: oldSession.id });
    storeMemoryVector(db, oldMem.id, axisVec(0));

    // Something unrelated in the new session.
    const newMem = createMemory(db, { type: 'subject', content: 'talking about weekend plans', session_id: newSession.id });
    storeMemoryVector(db, newMem.id, axisVec(1));

    const q = axisVec(0);

    // Session-scoped search cannot see the other session.
    const scoped = searchSimilarMemories(db, q, newSession.id, 5);
    assert.ok(
      !scoped.some((m) => m.id === oldMem.id),
      'other-session memory must NOT appear in session-scoped search'
    );

    // Global search, excluding the current session, recalls the old one.
    const global = searchSimilarMemoriesGlobal(db, q, { topK: 5, excludeSessionId: newSession.id });
    assert.ok(global.length >= 1);
    assert.equal(global[0].id, oldMem.id);
    assert.ok(!global.some((m) => m.id === newMem.id), 'excluded session memories must not appear');

    // Without the exclusion filter the most similar (old) memory still ranks first.
    const globalAll = searchSimilarMemoriesGlobal(db, q, { topK: 5 });
    assert.equal(globalAll[0].id, oldMem.id);
  } finally {
    db.close();
    cleanup({ dir });
  }
});

test('(B) detectContext with crossSessionTopK merges cross-session memories', async () => {
  const { dir, dbPath } = tempDbPath();
  const provider = { modelId: 'fake:test', dimensions: DIM, async embed() { throw new Error('unused'); } };
  const { db } = await openDatabase({ dbPath, embeddingProvider: provider });
  try {
    const oldSession = createSession(db, { title: 'previous' });
    const newSession = createSession(db, { title: 'new' });

    const oldMem = createMemory(db, { type: 'subject', content: 'build a recommendation engine', session_id: oldSession.id });
    storeMemoryVector(db, oldMem.id, axisVec(0));

    const res = await detectContext(db, controlledProvider(() => axisVec(0)), 'build the recommendation engine now', {
      sessionId: newSession.id,
      crossSessionTopK: 5,
    });
    assert.equal(res.fallback, false);
    assert.ok(res.crossSessionMemories.length >= 1);
    assert.equal(res.crossSessionMemories[0].id, oldMem.id);
    assert.equal(res.relevantMemories.length, 0, 'no in-session memories expected');
  } finally {
    db.close();
    cleanup({ dir });
  }
});

test('(C) buildSystemPrompt injects relevant memories and context note', () => {
  const prompt = buildSystemPrompt({
    context: { headers: [], goals: [], total_tokens_est: 0 },
    recentPrompt: 'continue with the API',
    providerLabel: 'openai',
    modelLabel: 'gpt-4o',
    relevantMemories: [{ id: 'm1', type: 'action', content: 'REST API endpoints added', importance: 8, tokens_est: 12, child_count: 0 }],
    contextNote: 'embedding timeout; proceeding without context check',
  });

  assert.match(prompt, /REST API endpoints added/);
  assert.match(prompt, /RELEVANT MEMORIES/);
  assert.match(prompt, /embedding timeout/);
  assert.match(prompt, /openai \/ gpt-4o/);
});

test('(D) extractKeywords filters stopwords and punctuation', () => {
  const words = extractKeywords('Please build the REST API framework for the new project soon!');
  assert.ok(words.includes('build'));
  assert.ok(words.includes('rest'));
  assert.ok(words.includes('framework'));
  assert.ok(words.includes('project'));
  assert.ok(words.length <= 10);
});