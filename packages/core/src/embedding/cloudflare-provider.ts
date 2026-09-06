import { EmbeddingProvider } from './types.js';

export interface CloudflareProviderConfig {
  workerUrl: string;
  apiToken?: string;
  modelId?: string;
  dimensions?: number;
  timeoutMs?: number;
}

export type ProviderProbe =
  | {
      ok: true;
      modelId: string;
      dimensions: number;
    }
  | {
      ok: false;
      error: string;
    };

export class CloudflareProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private workerUrl: string;
  private apiToken: string | undefined;
  private timeoutMs: number;

  constructor(config: CloudflareProviderConfig) {
    this.workerUrl = config.workerUrl.replace(/\/$/, '');
    this.apiToken = config.apiToken;
    this.modelId = config.modelId ?? 'cloudflare:bge-base-en-v1.5';
    this.dimensions = config.dimensions ?? 768;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async embed(text: string): Promise<Float32Array> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }

      const response = await fetch(`${this.workerUrl}/api/embed`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Embedding request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json() as {
        embedding?: string;
        dimensions?: number;
        model?: string;
      };

      if (typeof data.embedding !== 'string' || typeof data.dimensions !== 'number') {
        throw new Error(
          'Embedding response is missing embedding/dimensions fields. ' +
          'Is this the ABSOLUTE embedding worker?'
        );
      }

      if (data.dimensions !== this.dimensions) {
        throw new Error(
          `Embedding dimension mismatch: worker returned ${data.dimensions} dims ` +
          `but this provider is configured for ${this.dimensions}. ` +
          `Re-run \`absolute worker set cloud\` to re-probe, then migrate.`
        );
      }

      return base64ToEmbedding(data.embedding);
    } finally {
      clearTimeout(timeout);
    }
  }

  async probe(): Promise<ProviderProbe> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }

      const response = await fetch(`${this.workerUrl}/api/embed`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: 'absolute dimension probe' }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: `Worker responded with HTTP ${response.status}` };
      }

      const data = await response.json() as {
        embedding?: string;
        dimensions?: number;
        model?: string;
      };

      if (typeof data.dimensions !== 'number' || typeof data.embedding !== 'string') {
        return { ok: false, error: 'Worker response missing embedding/dimensions fields.' };
      }

      return {
        ok: true,
        modelId: `cloudflare:${data.model ?? 'bge-base-en-v1.5'}`,
        dimensions: data.dimensions,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: msg.includes('abort')
          ? `Worker timed out after ${this.timeoutMs}ms. Check the URL and that the worker is deployed.`
          : msg,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function base64ToEmbedding(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}