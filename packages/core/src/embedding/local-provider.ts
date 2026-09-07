// Local embeddings via transformers.js.
//
// Requires `npm install @huggingface/transformers` — not installed by
// default. Run this manually before using the local embedding provider.
// The import is dynamic (see initExtractor) so the package is never
// required to be installed unless LocalProvider is actually instantiated.
// @huggingface/transformers is only a devDependency of @absolute/core
// (for typecheck); its transitive onnxruntime-node has a known fatal
// postinstall failure on Linux (microsoft/onnxruntime#24918, #24770), so
// it must not be a hard dependency of the core install.
import type { EmbeddingProvider } from './types.js';
import os from 'node:os';
import path from 'node:path';

export function defaultLocalCacheDir(): string {
  return path.join(os.homedir(), '.cache', 'absolute', 'embeddings');
}

export interface LocalProviderConfig {
  modelId?: string;
  dimensions?: number;
  cacheDir?: string;
  allowRemoteModels?: boolean;
  device?: string;
  dtype?: 'fp32' | 'fp16' | 'q8' | 'int8';
}

type FeatureExtractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: true }
) => Promise<{ data: Float32Array | ArrayLike<number>; dims: number[] }>;

export const LOCAL_MODELS: Record<string, number> = {
  'bge-base-en-v1.5': 768,
  'bge-small-en-v1.5': 384,
  'all-MiniLM-L6-v2': 384,
};

export class LocalProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private cacheDir: string | undefined;
  private device: string | undefined;
  private dtype: 'fp32' | 'fp16' | 'q8' | 'int8' | undefined;
  private extractorPromise: Promise<FeatureExtractor> | null = null;
  private initError: string | null = null;

  constructor(config: LocalProviderConfig = {}) {
    const modelId = config.modelId ?? 'bge-base-en-v1.5';
    this.modelId = `local:${modelId}`;
    this.dimensions =
      config.dimensions ?? LOCAL_MODELS[modelId] ?? 768;
    this.cacheDir = config.cacheDir ?? defaultLocalCacheDir();
    this.device = config.device;
    this.dtype = config.dtype;
  }

  async embed(text: string): Promise<Float32Array> {
    const extractor = await this.getExtractor();
    try {
      const output = await extractor(text.trim(), {
        pooling: 'mean',
        normalize: true,
      });

      const data = output.data;
      const dims = output.dims ?? [];

      const vectorLength =
        data && typeof (data as Float32Array).length === 'number'
          ? (data as Float32Array).length
          : dims.length > 1
            ? dims[dims.length - 1]
            : this.dimensions;

      if (vectorLength !== this.dimensions) {
        throw new Error(
          `Embedding dimension mismatch: local model "${this.modelId}" returned ` +
          `${vectorLength} dims but provider is configured for ${this.dimensions}. ` +
          `Re-run \`absolute worker set local\` to re-probe.`
        );
      }

      return asFloat32Array(data, vectorLength);
    } catch (e) {
      if (e instanceof Error && e.message.includes('dimension mismatch')) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Local embedding failed: ${msg}`);
    }
  }

  async probe(): Promise<{ ok: true; modelId: string; dimensions: number } | { ok: false; error: string }> {
    try {
      const extractor = await this.getExtractor();
      const output = await extractor('absolute dimension probe', {
        pooling: 'mean',
        normalize: true,
      });

      const data = output.data;
      const dims = output.dims ?? [];
      const dim =
        data && typeof (data as Float32Array).length === 'number'
          ? (data as Float32Array).length
          : dims.length > 1
            ? dims[dims.length - 1]
            : this.dimensions;

      return { ok: true, modelId: this.modelId, dimensions: dim };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private getExtractor(): Promise<FeatureExtractor> {
    if (this.initError) {
      return Promise.reject(new Error(this.initError));
    }
    if (!this.extractorPromise) {
      this.extractorPromise = this.initExtractor().catch((e) => {
        this.initError = e instanceof Error ? e.message : String(e);
        this.extractorPromise = null;
        throw e;
      });
    }
    return this.extractorPromise;
  }

  private async initExtractor(): Promise<FeatureExtractor> {
    let transformers: typeof import('@huggingface/transformers');
    try {
      transformers = await import('@huggingface/transformers');
    } catch {
      throw new Error(
        'Local embeddings require @huggingface/transformers. ' +
        'Install it with: npm install @huggingface/transformers'
      );
    }

    const modelId = this.modelId.replace(/^local:/, '');
    const fullModelId = modelId.startsWith('Xenova/') || modelId.startsWith('sentence-transformers/')
      ? modelId
      : `Xenova/${modelId}`;

    if (this.cacheDir) {
      transformers.env.cacheDir = this.cacheDir;
    }

    const extractor = (await transformers.pipeline(
      'feature-extraction',
      fullModelId,
      {
        device: (this.device ?? 'cpu') as never,
        dtype: this.dtype as never,
      }
    )) as unknown as FeatureExtractor;

    return async (text, opts) => {
      const raw = (await extractor(text, opts as never)) as unknown;
      const t = raw as {
        data?: Float32Array | ArrayLike<number> | number[][];
        dims?: number[];
        to?: (fmt: unknown) => { data: Float32Array | ArrayLike<number>; dims: number[] };
      };
      if (t.data instanceof Float32Array) {
        return { data: t.data, dims: t.dims ?? [] };
      }
      if (Array.isArray(t.data)) {
        const flat = new Float32Array(t.data.length);
        for (let i = 0; i < t.data.length; i++) {
          flat[i] = Number(t.data[i]) || 0;
        }
        return { data: flat, dims: t.dims ?? [] };
      }
      if (t && t.to && typeof t.to === 'function') {
        let converted: { data: Float32Array | ArrayLike<number>; dims: number[] };
        try {
          converted = t.to('float32') as { data: Float32Array; dims: number[] };
        } catch {
          converted = t.to({ type: 'float32' }) as { data: Float32Array; dims: number[] };
        }
        return {
          data: (converted.data as Float32Array) ?? (converted as unknown as { data: number[] }).data,
          dims: converted.dims ?? t.dims ?? [],
        };
      }
      if (t && t.data) {
        return { data: t.data, dims: t.dims ?? [] };
      }
      throw new Error('Unexpected local embedding output shape');
    };
  }
}

function asFloat32Array(
  data: Float32Array | ArrayLike<number>,
  length: number
): Float32Array {
  if (data instanceof Float32Array) {
    return data.slice(0, length);
  }
  const arr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = data[i] ?? 0;
  }
  return arr;
}