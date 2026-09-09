import { useCallback, useState } from 'react';
import type { ChatMessage, ChatContext, MessageResponder } from '../types.js';

let counter = 0;
export function nextMessageId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

// Phase 4 placeholder responder. There is no LLM provider yet (Phase 5) and no
// memory write-back yet (Phase 6). The interface is the seam those phases fill.
const STUB_DELAY_MS = 120;

export function createStubResponder(): MessageResponder {
  return {
    async respond(prompt, ctx) {
      await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
      return [
        `[stub] received ${prompt.length} chars in session ${ctx.sessionId.slice(0, 8)}.`,
        'The LLM provider layer is Phase 5; memory injection is Phase 6.',
      ].join('\n');
    },
  };
}

export interface UseChatResult {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  pushSystem: (text: string) => void;
  clear: () => void;
  isThinking: boolean;
}

export function useChat(
  responder: MessageResponder,
  getContext: () => ChatContext
): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((m) => [
        ...m,
        { id: nextMessageId(), role: 'user', text: trimmed, ts: new Date().toISOString() },
      ]);
      setIsThinking(true);
      try {
        const reply = await responder.respond(trimmed, getContext());
        setMessages((m) => [
          ...m,
          { id: nextMessageId(), role: 'assistant', text: reply, ts: new Date().toISOString() },
        ]);
      } finally {
        setIsThinking(false);
      }
    },
    [responder, getContext]
  );

  const clear = useCallback(() => setMessages([]), []);

  const pushSystem = useCallback((text: string) => {
    setMessages((m) => [
      ...m,
      { id: nextMessageId(), role: 'system', text, ts: new Date().toISOString() },
    ]);
  }, []);

  return { messages, send, clear, pushSystem, isThinking };
}