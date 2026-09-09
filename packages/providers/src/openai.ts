import { getCredential, storeCredential } from './credentials.js';
import type { LLMMessage } from './types.js';

interface OpenAISDK {
  chat: {
    completions: {
      create: (opts: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        stream?: boolean;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

type OpenAIStreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
};

// Lazy SDK loader so `openai` is only imported (and its heavy deps resolved)
// when this provider is actually used.
async function loadSDK(apiKey: string): Promise<OpenAISDK> {
  const mod = (await import('openai')) as {
    default: new (opts: { apiKey: string }) => OpenAISDK;
  };
  return new mod.default({ apiKey });
}

const OPENAI_DEFAULT_MODEL = 'gpt-4o';

export class OpenAIProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly defaultModel = OPENAI_DEFAULT_MODEL;
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
        'OpenAI is not configured. Run `absolute provider set openai <key>`.'
      );
    }
    const sdk = await loadSDK(apiKey);
    const res = await sdk.chat.completions.create({
      model: opts.model ?? this.defaultModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    });
    return res.choices?.[0]?.message?.content ?? '';
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
          'OpenAI is not configured. Run `absolute provider set openai <key>`.'
        );
      }
      const sdk = await loadSDK(apiKey);

      const stream = await sdk.chat.completions.create({
        model: opts.model ?? this.defaultModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }) as unknown as AsyncIterable<OpenAIStreamChunk>;

      for await (const chunk of stream) {
        if (opts.signal?.aborted) {
          handler.onAborted?.();
          handler.onText('');
          return;
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) handler.onText(delta);
      }
      handler.onText('');
    } catch (e) {
      handler.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}