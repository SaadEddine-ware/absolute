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
}

export interface MessageResponder {
  respond(prompt: string, ctx: ChatContext): Promise<string>;
}