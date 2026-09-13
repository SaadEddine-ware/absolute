import { EmbeddingProvider } from './types.js';

export const LOCAL_MODELS: Record<string, number> = {
  'bge-base-en-v1.5': 768,
  'bge-large-en-v1.5': 1024,
  'all-MiniLM-L6-v2': 384,
};

export interface LocalProviderConfig {
  modelId?: string;
  dimensions?: number;
  cacheDir?: string;
  timeoutMs?: number;
}

export class LocalProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private cacheDir: string | undefined;
  private timeoutMs: number;
  private pipeline: any = null;

  constructor(config: LocalProviderConfig = {}) {
    const modelKey = config.modelId ?? 'bge-base-en-v1.5';
    this.modelId = `local:${modelKey}`;
    this.dimensions = config.dimensions ?? LOCAL_MODELS[modelKey] ?? 768;
    this.cacheDir = config.cacheDir;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipeline) {
      const { pipeline: loadPipeline } = await import('@huggingface/transformers');
      this.pipeline = await loadPipeline('feature-extraction', this.modelId.replace('local:', ''), {
        cache_dir: this.cacheDir,
      });
    }

    const result = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true,
    });

    return new Float32Array(result.data.slice(0, this.dimensions));
  }

  async probe(): Promise<{ ok: boolean; error?: string; dimensions?: number }> {
    try {
      await this.embed('test');
      return { ok: true, dimensions: this.dimensions };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
