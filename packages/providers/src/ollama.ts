// Ollama local provider. Runs models on localhost:11434.
// No API key required — always configured if the Ollama server is running.
// Auto-discovers available models via the /api/tags endpoint.
import { OpenAICompatibleProvider } from './openai-compatible-client.js';

const OLLAMA_BASE = 'http://127.0.0.1:11434';

export class OllamaProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'ollama',
      name: 'Ollama (local)',
      baseURL: `${OLLAMA_BASE}/v1`,
      defaultModel: 'qwen2.5-coder',
      freeTier: true,
      // No envKey — Ollama doesn't need an API key.
    });
  }

  // Ollama is "configured" if the server is reachable, regardless of credentials.
  override async isConfigured(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** List available models from the Ollama server. */
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return data.models?.map((m) => m.name) ?? [];
    } catch {
      return [];
    }
  }
}
