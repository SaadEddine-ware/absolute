// Shared types for the LLM provider layer (Phase 5).

export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMChunk {
  // Incremental text delta from a stream.
  delta: string;
}

export interface LLMStreamEventMap {
  text: LLMChunk;
  end: { reason: 'stop' | 'aborted' | 'error' };
  error: { message: string };
}

// A provider emits an async text stream. Each yielded string is a delta that
// the caller typically appends to the running response.
export type StreamHandler = {
  onText: (delta: string) => void;
  onAborted?: () => void;
  onError?: (err: Error) => void;
};

export interface LLMProvider {
  /** Stable identifier, e.g. 'openai', 'anthropic', 'groq', 'mimo'. */
  readonly id: string;
  /** Human name for `provider list`. */
  readonly name: string;
  /** Default model id for this provider (config can override). */
  readonly defaultModel: string;
  readonly freeTier: boolean;
  /** True once an API key has been stored for this provider. */
  isConfigured(): Promise<boolean>;
  /** Full-text completion (used by the TUI/chat without streaming UI). */
  complete(messages: LLMMessage[], opts?: { signal?: AbortSignal }): Promise<string>;
  /** Streaming completion; yields text deltas. */
  stream(messages: LLMMessage[], handler: StreamHandler, opts?: { signal?: AbortSignal }): Promise<void>;
  /** Configure the API key (bundles storage behind the provider). */
  saveKey(key: string): Promise<void>;
}

export interface ProviderDesc {
  id: string;
  name: string;
  defaultModel: string;
  freeTier: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}