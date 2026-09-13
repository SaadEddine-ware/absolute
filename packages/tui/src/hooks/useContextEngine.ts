import { useCallback, useRef, useState } from 'react';
import type { Goal, ContextDecision } from '@absolute/core';

export interface ContextEngineState {
  /** The active goal being tracked */
  goal: Goal | null;
  /** Last computed similarity score (0-1) */
  similarity: number;
  /** Current adaptive threshold */
  threshold: number;
  /** Last decision: continue / ask / switch */
  decision: ContextDecision;
  /** Whether a goal was evaluated (has a vector) */
  goalEvaluated: boolean;
  /** Timestamp of last evaluation */
  lastEvaluatedAt: number | null;
  /** Whether detection is in progress */
  detecting: boolean;
}

const INITIAL_STATE: ContextEngineState = {
  goal: null,
  similarity: 0,
  threshold: 0.6,
  decision: 'continue',
  goalEvaluated: false,
  lastEvaluatedAt: null,
  detecting: false,
};

export interface UseContextEngineResult {
  state: ContextEngineState;
  /** Called when a new detection result arrives */
  updateFromDetection: (result: {
    goal?: Goal | null;
    similarity?: number;
    threshold?: number;
    decision?: ContextDecision;
    goalEvaluated?: boolean;
  }) => void;
  setDetecting: (v: boolean) => void;
}

export function useContextEngine(): UseContextEngineResult {
  const [state, setState] = useState<ContextEngineState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateFromDetection = useCallback((result: {
    goal?: Goal | null;
    similarity?: number;
    threshold?: number;
    decision?: ContextDecision;
    goalEvaluated?: boolean;
  }) => {
    setState((prev) => ({
      ...prev,
      goal: result.goal !== undefined ? result.goal : prev.goal,
      similarity: result.similarity ?? prev.similarity,
      threshold: result.threshold ?? prev.threshold,
      decision: result.decision ?? prev.decision,
      goalEvaluated: result.goalEvaluated ?? prev.goalEvaluated,
      lastEvaluatedAt: Date.now(),
      detecting: false,
    }));
  }, []);

  const setDetecting = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, detecting: v }));
  }, []);

  return { state, updateFromDetection, setDetecting };
}
