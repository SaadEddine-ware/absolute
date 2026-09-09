import { getCredential, storeCredential } from './credentials.js';
import type { LLMMessage } from './types.js';

interface AnthropicSDK {
  messages: {
    create: (opts: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
    }) => Promise<{ content?: Array<{ type: string; text?: string }> }>;
  };
}

type AnthropicStreamChunk = { type: string; delta?: { text?: string } };

async function loadSDK(apiKey: string): Promise<AnthropicSDK> {
  const mod = (await import('@anthropic-ai/sdk')) as {
    default: new (opts: { apiKey: string }) => AnthropicSDK;
  };
  return new mod.default({ apiKey });
}

const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_MAX_TOKENS = 4096;

export class AnthropicProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly defaultModel = ANTHROPIC_DEFAULT_MODEL;
  readonly freeTier = false;

  async isConfigured(): Promise<boolean> {
    return (await getCredential(this.id)) !== null;
  }

  async saveKey(key: string): Promise<void> {
    await storeCredential(this.id, key);
  }

  async complete(
    messages: LLMMessage[],
    opts: { signal?: AbortSignal; model?: string } = {}
  ): Promise<string> {
    const apiKey = await getCredential(this.id);
    if (!apiKey) {
      throw new Error(
        'Anthropic is not configured. Run `absolute provider set anthropic <key>`.'
      );
    }
    const sdk = await loadSDK(apiKey);
    const res = await sdk.messages.create({
      model: opts.model ?? this.defaultModel,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    });
    const blocks = res.content ?? [];
    return blocks
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text ?? '')
      .join('');
  }

  async stream(
    messages: LLMMessage[],
    handler: {
      onText: (delta: string) => void;
      onAborted?: () => void;
      onError?: (err: Error) => void;
    },
    opts: { signal?: AbortSignal; model?: string } = {}
  ): Promise<void> {
    try {
      const apiKey = await getCredential(this.id);
      if (!apiKey) {
        throw new Error(
          'Anthropic is not configured. Run `absolute provider set anthropic <key>`.'
        );
      }
      const sdk = await loadSDK(apiKey);

      const stream = await sdk.messages.create({
        model: opts.model ?? this.defaultModel,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }) as unknown as AsyncIterable<AnthropicStreamChunk>;

      for await (const chunk of stream) {
        if (opts.signal?.aborted) {
          handler.onAborted?.();
          handler.onText('');
          return;
        }
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          handler.onText(chunk.delta.text);
        }
      }
      handler.onText('');
    } catch (e) {
      handler.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}