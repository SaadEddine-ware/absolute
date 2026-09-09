import { useCallback, useMemo, useState } from 'react';
import { loadSessionContext } from '@absolute/core';
import type { AbsoluteDatabase } from '@absolute/core';

export interface MemorySummary {
  count: number;
  tokensEst: number;
}

export interface UseMemoryResult {
  summary: MemorySummary;
  refresh: () => void;
}

// Phase 4 scope: surface the memory context that exists for a session (count +
// estimated tokens via the core progressive-load machinery). The SYNC detection
// and ASYNC storage wiring that make chat actually write memories is Phase 6.
export function useMemory(db: AbsoluteDatabase | null, sessionId: string | null): UseMemoryResult {
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

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { summary, refresh };
}