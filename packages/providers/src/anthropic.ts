import { getCredential, storeCredential } from './credentials.js';
import type { LLMMessage } from './types.js';

// Anthropic's Messages API requires system prompts as a separate top-level
// `system` string — NOT as a message with role 'system' inside the messages
// array (unlike OpenAI/Groq/MiMo). This helper partitions an LLMMessage[] and
// returns the joined system text plus the conversational messages only.
export function partitionAnthropicMessages(messages: LLMMessage[]): {
  systemText: string | undefined;
  conversational: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemText =
    messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n') || undefined;
  const conversational = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { systemText, conversational };
}

interface AnthropicSDK {
  messages: {
    create: (opts: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      system?: string;
    }) => Promise<{ content?: Array<{ type: string; text?: string }> }>;
  };
}

type AnthropicStreamChunk = { type: string; delta?: { text?: string } };

async function loadAnthropicSDK(apiKey: string): Promise<AnthropicSDK> {
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
  private readonly apiKeyOverride: string | null;

  constructor(opts?: { apiKey?: string }) {
    this.apiKeyOverride = opts?.apiKey ?? null;
  }

  async isConfigured(): Promise<boolean> {
    if (this.apiKeyOverride) return true;
    return (await getCredential(this.id)) !== null;
  }

  private async resolveApiKey(): Promise<string> {
    if (this.apiKeyOverride) return this.apiKeyOverride;
    const apiKey = await getCredential(this.id);
    if (!apiKey) {
      throw new Error(
        'Anthropic is not configured. Run `absolute provider set anthropic <key>`.'
      );
    }
    return apiKey;
  }

  async loadSDK(apiKey: string): Promise<AnthropicSDK> {
    return loadAnthropicSDK(apiKey);
  }

  async saveKey(key: string): Promise<void> {
    await storeCredential(this.id, key);
  }

  async complete(
    messages: LLMMessage[],
    opts: { signal?: AbortSignal; model?: string } = {}
  ): Promise<string> {
    const apiKey = await this.resolveApiKey();
    const sdk = await this.loadSDK(apiKey);
    const { systemText, conversational } = partitionAnthropicMessages(messages);
    const res = await sdk.messages.create({
      model: opts.model ?? this.defaultModel,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemText,
      messages: conversational,
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
      const apiKey = await this.resolveApiKey();
      const sdk = await this.loadSDK(apiKey);
      const { systemText, conversational } = partitionAnthropicMessages(messages);

      const stream = await sdk.messages.create({
        model: opts.model ?? this.defaultModel,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: systemText,
        messages: conversational,
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