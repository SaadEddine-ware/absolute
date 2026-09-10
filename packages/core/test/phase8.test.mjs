// Phase 8 verification tests (PLAN.md:529+, goal tracking + hybrid confirmation).
//
// Covers the core-support pieces the TUI confirmation flow relies on:
//   (1) detectContext.goalEvaluated — decision is only meaningful when an
//       active goal with a stored vector exists; otherwise it stays
//       'continue' (guards the degenerate similarity=0 => switch case that
//       would otherwise cascade into spurious goal churn).
//   (2) recordSwitchFeedback — the adaptive EMA actually moves the
//       similarity_threshold in the right direction for both y/n answers.
//   (3) Supersede semantics — pausing an active goal removes it from
//       getActiveGoals so exactly one goal can be current at a time
//       (the flat-topic-history model used on 'switch' / 'ask'+n).
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
  createGoal,
  getActiveGoals,
  updateGoal,
  storeGoalVector,
  detectContext,
  recordSwitchFeedback,
  getUserSettings,
  DEFAULT_THRESHOLD,
  MIN_THRESHOLD,
  MAX_THRESHOLD,
} from '../dist/index.js';

const DIM = 768;

function axisVec(index, scale = 1) {
  const v = new Float32Array(DIM);
  v[index] = scale;
  return v;
}

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'absolute-phase8-'));
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

async function setupSession() {
  const { dir, dbPath } = tempDbPath();
  const provider = { modelId: 'fake:test', dimensions: DIM, async embed() { throw new Error('unused'); } };
  const { db } = await openDatabase({ dbPath, embeddingProvider: provider });
  const session = createSession(db, { title: 'phase8' });
  return { dir, db, session };
}

function cleanupDb({ db, dir }) {
  db.close();
  cleanup({ dir });
}

test('(1) goalEvaluated is false without an active goal / vector, so decision stays continue', async () => {
  const { dir, db, session } = await setupSession();
  try {
    // No goal at all -> not evaluated, never a forced switch.
    const noGoal = await detectContext(db, controlledProvider(() => axisVec(0)), 'first message of a session', {
      sessionId: session.id,
    });
    assert.equal(noGoal.goalEvaluated, false);
    assert.equal(noGoal.decision, 'continue');

    // A fresh goal row WITHOUT a stored vector must never coerce a switch
    // from similarity=0 (the vector is embedded fire-and-forget, so it may
    // legitimately be missing on the turn right after goal creation).
    createGoal(db, {
      description: 'goal that has no vector yet',
      level: 'goal',
      status: 'active',
      session_id: session.id,
    });
    const noVec = await detectContext(db, controlledProvider(() => axisVec(0)), 'anything at all', {
      sessionId: session.id,
    });
    assert.equal(noVec.goalEvaluated, false);
    assert.equal(noVec.decision, 'continue');
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(2) goalEvaluated true when an active goal has a vector; decision reflects similarity', async () => {
  const goalVec = axisVec(0);
  const { dir, db, session } = await setupSession();
  try {
    const goal = createGoal(db, {
      description: 'current topic',
      level: 'goal',
      status: 'active',
      session_id: session.id,
    });
    storeGoalVector(db, goal.id, goalVec);

    // Similar prompt -> continue, evaluated.
    const similar = await detectContext(db, controlledProvider(() => goalVec), 'keep talking about the current topic', {
      sessionId: session.id,
    });
    assert.equal(similar.goalEvaluated, true);
    assert.equal(similar.decision, 'continue');

    // Unrelated prompt -> switch, evaluated.
    const unrelated = await detectContext(db, controlledProvider(() => axisVec(1)), 'totally different topic now', {
      sessionId: session.id,
    });
    assert.equal(unrelated.goalEvaluated, true);
    assert.equal(unrelated.decision, 'switch');
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(3) recordSwitchFeedback moves the threshold via the adaptive EMA in both directions', async () => {
  const { dir, db, session } = await setupSession();
  try {
    void session;
    const before = getUserSettings(db).similarity_threshold;
    assert.equal(before, DEFAULT_THRESHOLD);

    // User confirms the topic switched -> confirmed++ -> threshold rises.
    const confirmed = recordSwitchFeedback(db, true);
    assert.equal(confirmed.switch_confirmed_count, 1);
    assert.equal(confirmed.switch_rejected_count, 0);
    assert.ok(confirmed.similarity_threshold > before, 'confirmed switch must raise the threshold');
    assert.ok(confirmed.similarity_threshold <= MAX_THRESHOLD);

    // User rejects the switch -> rejected++ -> threshold falls back down.
    const rejected = recordSwitchFeedback(db, false);
    assert.equal(rejected.switch_rejected_count, 1);
    assert.equal(rejected.switch_confirmed_count, 1);
    assert.ok(rejected.similarity_threshold < confirmed.similarity_threshold, 'reject must lower the threshold');
    assert.ok(rejected.similarity_threshold >= MIN_THRESHOLD);
    assert.equal(rejected.total_confirmations, 2);
  } finally {
    cleanupDb({ db, dir });
  }
});

test('(4) supersede: pausing active goals leaves exactly one current goal', async () => {
  const { dir, db, session } = await setupSession();
  try {
    const first = createGoal(db, {
      description: 'topic one',
      level: 'goal',
      status: 'active',
      session_id: session.id,
    });
    const second = createGoal(db, {
      description: 'topic two',
      level: 'goal',
      status: 'active',
      session_id: session.id,
    });
    assert.equal(getActiveGoals(db, session.id).length, 2);

    // Supersede: pause the first topic, keep the newest active.
    updateGoal(db, first.id, { status: 'paused' });
    const active = getActiveGoals(db, session.id);
    assert.deepEqual(active.map((g) => g.id), [second.id]);
    assert.equal(active[0].status, 'active');
  } finally {
    cleanupDb({ db, dir });
  }
});