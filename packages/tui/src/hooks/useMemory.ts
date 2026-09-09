import { useCallback, useMemo, useState } from 'react';
import { loadSessionContext } from '@absolute/core';
import type { AbsoluteDatabase } from '@absolute/core';
import type { EmbeddingProvider } from '@absolute/core';
import { storeExchangeMemory, type Exchange } from '../lib/memory-pipeline.js';

export interface MemorySummary {
  count: number;
  tokensEst: number;
}

export interface UseMemoryResult {
  summary: MemorySummary;
  /** ASYNC fire-and-forget store of an exchange into memories + memory_vectors. */
  store: (exchange: Exchange) => Promise<void>;
  refresh: () => void;
}

export function useMemory(
  db: AbsoluteDatabase | null,
  sessionId: string | null,
  embeddingProvider: EmbeddingProvider | null
): UseMemoryResult {
  const [version, setVersion] = useState(0);

  const summary = useMemo<MemorySummary>(() => {
    if (!db || !sessionId) return { count: 0, tokensEst: 0 };
    try {
      const context = loadSessionContext(db.db, sessionId, { mode: 'prompt' });
      return { count: context.headers.length, tokensEst: context.total_tokens_est };
    } catch {
      return { count: 0, tokensEst: 0 };
    }
  }, [db, sessionId, version]);

  // ASYNC write-back: called by useChat after a real LLM response completes.
  // Fire-and-forget — storage failures are swallowed by storeExchangeMemory.
  const store = useCallback(
    async (exchange: Exchange): Promise<void> => {
      if (!db || !sessionId || !embeddingProvider) return;
      await storeExchangeMemory(db, embeddingProvider, sessionId, exchange);
      setVersion((v) => v + 1);
    },
    [db, sessionId, embeddingProvider]
  );

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { summary, store, refresh };
}