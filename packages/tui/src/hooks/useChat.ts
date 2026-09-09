import { useCallback, useEffect, useState } from 'react';
import { ProviderManager } from '@absolute/providers';
import type { ChatMessage, ChatContext, MessageResponder } from '../types.js';
import type { AbsoluteConfig } from '../lib/config.js';
import { loadConfig } from '../lib/config.js';

let counter = 0;
export function nextMessageId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export const STUB_DELAY_MS = 120;

export function createStubResponder(): MessageResponder {
  return {
    async respond(prompt, ctx) {
      await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
      return [
        `[stub] received ${prompt.length} chars in session ${ctx.sessionId.slice(0, 8)}.`,
        'No LLM provider is configured. Run `absolute provider set <id> <key>`.',
      ].join('\n');
    },
  };
}

// Builds a MessageResponder that calls the configured LLM provider. If no
// provider id is set or none has an API key, it falls back to the stub so the
// chat loop never hard-fails (keeps the TUI useable before configuration).
export async function createConfiguredResponder(): Promise<MessageResponder> {
  const config: AbsoluteConfig = loadConfig();
  if (!config.provider) return createStubResponder();

  const manager = new ProviderManager();
  const provider = manager.resolve({ provider: config.provider, model: config.model });
  if (!provider || !(await provider.isConfigured())) {
    return createStubResponder();
  }

  return {
    async respond(prompt, ctx) {
      const reply = await provider.complete([
        { role: 'user', content: prompt },
      ]);
      return reply;
    },
  };
}

export interface UseChatResult {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  pushSystem: (text: string) => void;
  clear: () => void;
  isThinking: boolean;
  /** Display label for the active responder: the provider id or 'stub'. */
  mode: string;
}

export interface ResolvedResponder {
  responder: MessageResponder;
  label: string;
}

export async function resolveResponder(): Promise<ResolvedResponder> {
  const config: AbsoluteConfig = loadConfig();
  if (!config.provider) {
    return { responder: createStubResponder(), label: 'stub' };
  }
  const manager = new ProviderManager();
  const provider = manager.resolve({ provider: config.provider, model: config.model });
  if (!provider || !(await provider.isConfigured())) {
    return { responder: createStubResponder(), label: 'stub' };
  }
  return {
    responder: {
      async respond(prompt) {
        return provider.complete([{ role: 'user', content: prompt }]);
      },
    },
    label: provider.id,
  };
}

export function useChat(getContext: () => ChatContext): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [responder, setResponder] = useState<MessageResponder>(createStubResponder);
  const [mode, setMode] = useState('stub');

  useEffect(() => {
    let cancelled = false;
    void resolveResponder().then((resolved) => {
      if (cancelled) return;
      setResponder(() => resolved.responder);
      setMode(resolved.label);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  return { messages, send, clear, pushSystem, isThinking, mode };
}