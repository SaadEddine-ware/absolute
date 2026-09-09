import type { LLMMessage } from '@absolute/providers';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  ts: string;
}

export interface ChatContext {
  sessionId: string;
  memoryCount: number;
  memoryTokens: number;
  signal?: AbortSignal;
}

export interface MessageResponderHandlers {
  /** Called with each text delta as it streams in. An empty string signals end. */
  onDelta: (text: string) => void;
  /** Called when the response is aborted partway (partial text already delivered). */
  onAborted?: () => void;
  /** Called on a stream error (partial text may already be delivered). */
  onError?: (err: Error) => void;
}

export interface MessageResponder {
  respond(
    messages: LLMMessage[],
    ctx: ChatContext,
    handlers: MessageResponderHandlers
  ): Promise<void>;
}

export type Screen = 'chat' | 'sessions' | 'memories' | 'settings';