import { useStdout } from 'ink';

export interface TerminalSize {
  columns: number;
  rows: number;
}

// Ink re-renders on terminal resize; reading stdout here keeps the sidebar
// breakpoint (COMPACT_WIDTH in app.tsx) reactive when the user resizes.
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  return {
    columns: stdout.columns > 0 ? stdout.columns : 80,
    rows: stdout.rows > 0 ? stdout.rows : 24,
  };
}