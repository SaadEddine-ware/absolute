import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GroqProvider } from './groq.js';
import { MimoProvider } from './mimo.js';
import type { LLMProvider, ProviderDesc, ProviderTestResult } from './types.js';

// Registry of all providers. ProviderManager resolves a provider by id and
// decides which model to use from the application config.
export class ProviderManager {
  private readonly providers = new Map<string, LLMProvider>();

  constructor() {
    this.register(new OpenAIProvider());
    this.register(new AnthropicProvider());
    this.register(new GroqProvider());
    this.register(new MimoProvider());
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  /** All registered providers as plain descriptors (for `provider list`). */
  list(): ProviderDesc[] {
    return [...this.providers.values()].map((p) => ({
      id: p.id,
      name: p.name,
      defaultModel: p.defaultModel,
      freeTier: p.freeTier,
    }));
  }

  /** Resolve a provider id from config, with sensible defaults. */
  resolve(config: { provider?: string | null; model?: string | null }): LLMProvider | undefined {
    const id = config.provider ?? this.defaultProviderId();
    return this.providers.get(id);
  }

  defaultProviderId(): string {
    return 'openai';
  }

  async test(id: string): Promise<ProviderTestResult> {
    const provider = this.providers.get(id);
    if (!provider) {
      return { ok: false, message: `Unknown provider "${id}".` };
    }
    if (!(await provider.isConfigured())) {
      return {
        ok: false,
        message: `${provider.name} has no API key stored. Run \`absolute provider set ${id} <key>\`.`,
      };
    }
    const start = Date.now();
    try {
      const reply = await provider.complete(
        [{ role: 'user', content: 'Reply with exactly: OK' }],
        { signal: AbortSignal.timeout(15000) }
      );
      const latencyMs = Date.now() - start;
      return { ok: true, message: `Connected (reply: "${reply.trim().slice(0, 40)}")`, latencyMs };
    } catch (e) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        latencyMs,
      };
    }
  }
}

export type { LLMProvider, LLMMessage, LLMRequest, LLMChunk, ProviderDesc, ProviderTestResult } from './types.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider, partitionAnthropicMessages } from './anthropic.js';
export { GroqProvider } from './groq.js';
export { MimoProvider, MIMO_REGIONS } from './mimo.js';
export type { MimoOptions, MimoRegion } from './mimo.js';
export { OpenAICompatibleProvider } from './openai-compatible-client.js';
export { storeCredential, getCredential, deleteCredential } from './credentials.js';