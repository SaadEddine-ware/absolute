// Phase 3 verification tests (PLAN.md:494-504).
//
// Covers the three Verify bullets:
//   1. Context detection works — similar prompts return 'continue',
//      different topics return 'ask' or 'switch'.
//   2. Timeout fallback works when the embedding worker is unreachable.
//   3. Startup guard rejects a mismatched embedding provider.
// plus the documented searchSimilarGoals session filter and sqlite-vec KNN.
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
  createGoal,
  getActiveGoals,
  storeMemoryVector,
  storeGoalVector,
  detectContext,
  searchSimilarMemories,
  searchSimilarGoals,
  getEmbeddingMetadata,
  getDecision,
} from '../dist/index.js';

const DIM = 768;

// Deterministic basis vectors in the 768-dim space.
function axisVec(index, scale = 1) {
  const v = new Float32Array(DIM);
  v[index] = scale;
  return v;
}

// A vector at a chosen cosine angle from unitAxis + 0 (component 0).
function vectorAtCosine(cos, index = 0) {
  if (cos === 0) return axisVec(1);
  const sin = Math.sqrt(1 - cos * cos);
  const v = new Float32Array(DIM);
  v[index] = cos;
  v[index === 0 ? 1 : 0] = sin;
  return v;
}

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'absolute-phase3-'));
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

async function setupSessionWithVector(vec, memoryContent = 'stored memory about space travel') {
  const { dir, dbPath } = tempDbPath();
  const provider = { modelId: 'fake:test', dimensions: DIM, async embed() { throw new Error('unused'); } };
  const { db } = await openDatabase({ dbPath, embeddingProvider: provider });

  const session = createSession(db, { title: 'phase3' });
  const memory = createMemory(db, {
    type: 'subject',
    content: memoryContent,
    session_id: session.id,
  });
  storeMemoryVector(db, memory.id, vec);
  return { dir, db, session, memory };
}

function cleanupDb({ db, dir }) {
  db.close();
  cleanup({ dir });
}

test('(1) similar prompt -> continue, different -> switch/ask (PLAN verify bullet 1)', async () => {
  const goalVec = axisVec(0); // [1,0,0,...]
  const { dir, db, session } = await setupSessionWithVector(goalVec);
  try {
    createGoal(db, {
      description: 'goal being discussed',
      level: 'goal',
      status: 'active',
      session_id: session.id,
    });
    const activeGoal = getActiveGoals(db, session.id)[0];
    storeGoalVector(db, activeGoal.id, goalVec);

    // Similar prompt: embed returns the goal vector itself -> cos=1 -> continue.
    const continueRes = await detectContext(db, controlledProvider(() => goalVec), 'tell me more about the goal', {
      sessionId: session.id,
    });
    assert.equal(continueRes.decision, 'continue');
    assert.equal(continueRes.fallback, false);

    // Different topic: orthogonal vector -> cos=0 <= threshold(0.6) -> switch.
    const switchRes = await detectContext(db, controlledProvider(() => axisVec(1)), 'completely unrelated topic now', {
      sessionId: session.id,
    });
    assert.equal(switchRes.decision, 'switch');

    // Mixed topic: cos=0.7 -> ask.
    const askRes = await detectContext(db, controlledProvider(() => vectorAtCosine(0.7)), 'vaguely related tangent', {
      sessionId: session.id,
    });
    assert.equal(askRes.decision, 'ask');
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(1b) sqlite-vec KNN returns the closest memory for a similar prompt', async () => {
  const vecA = axisVec(0);
  const { dir, db, session, memory } = await setupSessionWithVector(vecA);
  try {
    const second = createMemory(db, {
      type: 'action',
      content: 'second memory',
      session_id: session.id,
    });
    storeMemoryVector(db, second.id, axisVec(2));

    const results = searchSimilarMemories(db, vecA, session.id, 2);
    assert.equal(results.length, 2);
    assert.equal(results[0].id, memory.id);
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(1c) searchSimilarGoals filters by session_id (PLAN.md:436 spec)', async () => {
  const provider = { modelId: 'fake:test', dimensions: DIM, async embed() { throw new Error('unused'); } };
  const { dir, dbPath } = tempDbPath();
  const { db } = await openDatabase({ dbPath, embeddingProvider: provider });
  try {
    const s1 = createSession(db, { title: 's1' });
    const s2 = createSession(db, { title: 's2' });
    const g1 = createGoal(db, { description: 'session one goal', level: 'goal', status: 'active', session_id: s1.id });
    const g2 = createGoal(db, { description: 'session two goal', level: 'goal', status: 'active', session_id: s2.id });
    const v1 = axisVec(0);
    const v2 = axisVec(1);
    storeGoalVector(db, g1.id, v1);
    storeGoalVector(db, g2.id, v2);

    const scoped = searchSimilarGoals(db, v1, { sessionId: s1.id, topK: 10 });
    const ids = scoped.map((r) => r.id);
    assert.deepEqual(ids, [g1.id]);

    const all = searchSimilarGoals(db, v1, { topK: 10 });
    assert.deepEqual(new Set(all.map((r) => r.id)), new Set([g1.id, g2.id]));
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(2) timeout fallback when the worker is unreachable (PLAN verify bullet 2)', async () => {
  const { dir, db, session } = await setupSessionWithVector(axisVec(0));
  try {
    const hangingProvider = {
      modelId: 'fake:test',
      dimensions: DIM,
      embed() {
        return new Promise(() => {}); // never settles
      },
    };
    const res = await detectContext(db, hangingProvider, 'any prompt at all', {
      sessionId: session.id,
      timeoutMs: 50,
    });
    assert.equal(res.decision, 'continue');
    assert.equal(res.fallback, true);
    assert.match(res.reason ?? '', /timeout/i);
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(3) startup guard rejects a mismatched embedding provider (PLAN verify bullet 3)', async () => {
  const { dir, dbPath } = tempDbPath();
  try {
    const first = { modelId: 'fake:a', dimensions: DIM, async embed() { throw new Error('unused'); } };
    const firstDb = await openDatabase({ dbPath, embeddingProvider: first });
    assert.equal(getEmbeddingMetadata(firstDb.db).model_id, 'fake:a');
    firstDb.db.close();

// Rejecting opens: record the exit code instead of letting process.exit throw,
      // so openDatabase completes and the handle can be closed.
      const originalExit = process.exit;
      const originalError = console.error;
      let exitCode = null;
      process.exit = (code) => { exitCode = code; };
      const errors = [];
      console.error = (...args) => errors.push(args.join(' '));
      try {
        // Different model id -> guard fires.
        const differentModel = { modelId: 'fake:b', dimensions: DIM, async embed() { throw new Error('unused'); } };
        const h1 = await openDatabase({ dbPath, embeddingProvider: differentModel });
        assert.equal(exitCode, 1);
        assert.match(errors.join('\n'), /provider mismatch/i);
        h1.db.close();

        // Same model id but different dimensions -> guard fires too.
        exitCode = null;
        errors.length = 0;
        const differentDims = { modelId: 'fake:a', dimensions: 512, async embed() { throw new Error('unused'); } };
        const h2 = await openDatabase({ dbPath, embeddingProvider: differentDims });
        assert.equal(exitCode, 1);
        assert.match(errors.join('\n'), /512 dims/);
        h2.db.close();

        // Matching provider -> opens fine, guard does not fire.
        exitCode = null;
        const match = { modelId: 'fake:a', dimensions: DIM, async embed() { throw new Error('unused'); } };
        const h3 = await openDatabase({ dbPath, embeddingProvider: match });
        assert.equal(exitCode, null);
        h3.db.close();
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
  } finally {
    cleanup({ dir, dbPath });
  }
});

test('(4) getDecision honors learned thresholds above 0.8 (BUG 1)', () => {
  // A learned threshold > 0.8 must NOT be short-circuited by a hardcoded 0.8.
  // 0.82 <= 0.85 -> switch (the old hardcoded `> 0.8` wrongly returned 'continue').
  assert.equal(getDecision(0.82, 0.85), 'switch');
  assert.equal(getDecision(0.88, 0.85), 'ask'); // inside (threshold, threshold+0.2]
  assert.equal(getDecision(0.92, 0.85), 'continue'); // above min(0.9, 1.05)

  // Default threshold 0.6 is unchanged: the continue bound stays exactly 0.8.
  assert.equal(getDecision(0.81, 0.6), 'continue');
  assert.equal(getDecision(0.79, 0.6), 'ask');
  assert.equal(getDecision(0.6, 0.6), 'switch');
});

test('(5) vector index uses cosine distance, not L2 (BUG 2)', async () => {
  const { dir, dbPath } = tempDbPath();
  const provider = { modelId: 'fake:test', dimensions: DIM, async embed() { throw new Error('unused'); } };
  const { db } = await openDatabase({ dbPath, embeddingProvider: provider });
  try {
    const session = createSession(db, { title: 'bug2' });

    const a = createMemory(db, { type: 'subject', content: 'a', session_id: session.id });
    const b = createMemory(db, { type: 'subject', content: 'b', session_id: session.id });

    // Same direction as the query but magnitude 10 -> L2 distance 9, cosine distance 0.
    const vecA = new Float32Array(DIM); vecA[0] = 10;
    // Off-direction: [1,2,0,...] -> L2 distance ~2 (winning under L2), cosine 0.447.
    const vecB = new Float32Array(DIM); vecB[0] = 1; vecB[1] = 2;

    storeMemoryVector(db, a.id, vecA);
    storeMemoryVector(db, b.id, vecB);

    const q = axisVec(0); // unit [1,0,0,...]
    const results = searchSimilarMemories(db, q, session.id, 2);
    assert.equal(results[0].id, a.id,
      'same-direction vector must rank first under cosine distance (would be second under L2)');
  } finally {
    cleanupDb({ db, dir });
  }
});