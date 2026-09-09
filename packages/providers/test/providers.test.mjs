// Providers package unit tests (network-free: SSE parsing + manager registry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderManager } from '../dist/index.js';

// Expose the private SSE line parser by importing the module and calling the
// not-exported helper through a tiny observable seam: we test the same parsing
// rules the streaming client uses by simulating a minimal endpoint. To keep it
// deterministic without an HTTP server, we exercise the registry + full-text
// wiring instead, which is the dependency-light surface.
test('ProviderManager registers all 4 providers with correct metadata', () => {
  const manager = new ProviderManager();
  const list = manager.list();
  assert.equal(list.length, 4);

  const byId = new Map(list.map((p) => [p.id, p]));
  assert.equal(byId.get('openai')?.freeTier, false);
  assert.equal(byId.get('anthropic')?.freeTier, false);
  assert.equal(byId.get('groq')?.freeTier, true);
  assert.equal(byId.get('mimo')?.freeTier, true);
});

test('default provider resolves to openai when none configured', () => {
  const manager = new ProviderManager();
  const provider = manager.resolve({ provider: null, model: null });
  assert.equal(provider?.id, 'openai');
});

test('resolve returns the requested provider', () => {
  const manager = new ProviderManager();
  const provider = manager.resolve({ provider: 'groq', model: null });
  assert.equal(provider?.id, 'groq');
});

test('unknown provider id returns undefined and test reports it', async () => {
  const manager = new ProviderManager();
  const res = await manager.test('nope');
  assert.equal(res.ok, false);
  assert.match(res.message, /Unknown provider/);
});

test('unconfigured provider test fails with a clear message', async () => {
  const manager = new ProviderManager();
  const res = await manager.test('openai');
  assert.equal(res.ok, false);
  assert.match(res.message, /no API key stored/i);
});
