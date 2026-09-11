import { useCallback, useState } from 'react';

// In-memory prompt history for the readline PromptInput. Oldest → newest.
export interface UsePromptHistoryResult {
  /** Prompt strings submitted so far (oldest → newest). */
  history: string[];
  /** Append a submitted prompt (dedupes consecutive repeats). */
  push: (value: string) => void;
  /** Forget everything. */
  reset: () => void;
}

export function usePromptHistory(): UsePromptHistoryResult {
  const [history, setHistory] = useState<string[]>([]);

  const push = useCallback((value: string) => {
    setHistory((h) => {
      if (h.length > 0 && h[h.length - 1] === value) return h;
      return [...h, value];
    });
  }, []);

  const reset = useCallback(() => setHistory([]), []);

  return { history, push, reset };
}