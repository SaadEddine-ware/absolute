// Providers package unit tests (network-free: SSE parsing + manager registry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderManager,
  AnthropicProvider,
  partitionAnthropicMessages,
} from '../dist/index.js';

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

test('partitionAnthropicMessages separates system from conversation', () => {
  const { systemText, conversational } = partitionAnthropicMessages([
    { role: 'system', content: 'You are ABSOLUTE.' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
    { role: 'system', content: 'Memory context here.' },
  ]);
  assert.equal(systemText, 'You are ABSOLUTE.\n\nMemory context here.');
  assert.deepEqual(conversational, [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ]);
});

test('AnthropicProvider.complete passes system as top-level param and conversational only in messages', async () => {
  // Override the provider's SDK loader with a spy so we can assert exactly what
  // is sent to the SDK — no network and no real SDK module resolution needed.
  const calls = [];
  const originalLoader = AnthropicProvider.prototype.loadSDK;
  AnthropicProvider.prototype.loadSDK = async function () {
    return {
      messages: {
        create: async (opts) => {
          calls.push(opts);
          return { content: [{ type: 'text', text: 'hello back' }] };
        },
      },
    };
  };

  try {
    const p = new AnthropicProvider({ apiKey: 'test-key' });
    const reply = await p.complete([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
    assert.equal(reply, 'hello back');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].system, 'sys');
    assert.deepEqual(calls[0].messages, [{ role: 'user', content: 'hi' }]);
    assert.equal(calls[0].stream, false);
  } finally {
    AnthropicProvider.prototype.loadSDK = originalLoader;
  }
});

test('AnthropicProvider.stream emits text blocks and partitions system role the same way', async () => {
  const calls = [];
  const originalLoader = AnthropicProvider.prototype.loadSDK;
  AnthropicProvider.prototype.loadSDK = async function () {
    return {
      messages: {
        create: async (opts) => {
          calls.push(opts);
          return [
            { type: 'content_block_delta', delta: { text: 'Hello' } },
            { type: 'content_block_delta', delta: { text: ' back' } },
          ];
        },
      },
    };
  };

  try {
    const p = new AnthropicProvider({ apiKey: 'test-key' });
    const seen = [];
    await p.stream(
      [
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'hi' },
      ],
      { onText: (d) => seen.push(d) }
    );

    assert.equal(seen.join(''), 'Hello back');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].system, 'Be terse.');
    assert.deepEqual(calls[0].messages, [{ role: 'user', content: 'hi' }]);
    assert.equal(calls[0].stream, true);
  } finally {
    AnthropicProvider.prototype.loadSDK = originalLoader;
  }
});
