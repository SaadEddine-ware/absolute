import { EmbeddingProvider } from './types.js';

export interface CloudflareProviderConfig {
  workerUrl: string;
  apiToken?: string;
  modelId?: string;
  dimensions?: number;
  timeoutMs?: number;
}

export class CloudflareProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private workerUrl: string;
  private apiToken: string | undefined;
  private timeoutMs: number;

  constructor(config: CloudflareProviderConfig) {
    this.workerUrl = config.workerUrl;
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
        throw new Error(`Embedding request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { embedding: string; dimensions: number };
      return base64ToEmbedding(data.embedding);
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
