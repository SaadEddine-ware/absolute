import { render } from 'ink';
import { App } from './app.js';
import { createStubResponder } from './hooks/useChat.js';

export function runTui(): void {
  // Ink's raw-mode input requires a real terminal. `process.stdin.isTTY` is the
  // type-safe check here (ink exports isRawModeSupported but not in its d.ts).
  if (!process.stdin.isTTY) {
    console.error('ABSOLUTE TUI needs an interactive terminal (stdin must be a TTY).');
    process.exit(1);
  }
  try {
    render(<App />);
  } catch (e) {
    console.error(
      'ABSOLUTE TUI could not start:',
      e instanceof Error ? e.message : String(e)
    );
    process.exit(1);
  }
}

export { App } from './app.js';
export { createStubResponder } from './hooks/useChat.js';
export type {
  ChatMessage,
  ChatContext,
  MessageRole,
  MessageResponder,
  MessageResponderHandlers,
} from './types.js';
export type { UseChatResult } from './hooks/useChat.js';
export type { UseSessionResult } from './hooks/useSession.js';
export type { UseMemoryResult } from './hooks/useMemory.js';
export type { MemorySummary } from './hooks/useMemory.js';
export type { InputProps } from './components/input.js';
export type { StatusBarProps } from './components/status-bar.js';
export type { MemoryBadgeProps } from './components/memory-badge.js';
export {
  detectSessionContext,
  storeExchangeMemory,
  buildNextMessages,
  scoreImportance,
  extractExchangeKeywords,
  SYNC_DETECT_TIMEOUT_MS,
  ASYNC_EMBED_TIMEOUT_MS,
  RECALL_TOP_K,
  type Exchange,
  type SyncResult,
  type BuildNextMessagesInput,
} from './lib/memory-pipeline.js';