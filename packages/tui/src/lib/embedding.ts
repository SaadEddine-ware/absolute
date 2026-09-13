import { CloudflareProvider, LocalProvider } from '@absolute/core';
import type { EmbeddingProvider } from '@absolute/core';
import type { AbsoluteConfig } from './config.js';

// Mirrors packages/cli/src/utils/embedding.ts so the TUI never imports from
// the cli package (cli depends on tui, not the reverse).
export function createAnyProvider(config: AbsoluteConfig): EmbeddingProvider {
  const provider = config.memory?.embeddingProvider;
  if (provider === 'local') {
    const modelId = config.memory?.embeddingModelId ?? 'bge-base-en-v1.5';
    return new LocalProvider({ modelId, cacheDir: config.memory?.embeddingCacheDir });
  }
  const workerUrl = config.memory?.embeddingWorkerUrl ?? 'http://localhost:8787';
  return new CloudflareProvider({ workerUrl });
}