import { useCallback, useEffect, useRef, useState } from 'react';
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
    async respond(prompt, ctx, handlers) {
      const reply = [
        `[stub] received ${prompt.length} chars in session ${ctx.sessionId.slice(0, 8)}.`,
        'No LLM provider is configured. Run `absolute provider set <id> <key>`.',
      ].join('\n');
      // Deliver a couple of chunks so streaming ergonomics behave like a real
      // provider, then signal end of stream with an empty string.
      handlers.onDelta(reply.slice(0, reply.length / 2));
      await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
      handlers.onDelta(reply.slice(reply.length / 2));
      handlers.onDelta('');
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

  return createProviderResponder(provider);
}

// Wraps a configured LLMProvider's stream() in the TUI MessageResponder seam.
// Threads the model config and streams each text delta to the handler.
function createProviderResponder(
  provider: ReturnType<ProviderManager['resolve']>
): MessageResponder {
  if (!provider) return createStubResponder();
  return {
    async respond(prompt, ctx, handlers) {
      try {
        await provider.stream(
          [{ role: 'user', content: prompt }],
          {
            onText: (delta) => handlers.onDelta(delta),
            onAborted: () => handlers.onAborted?.(),
            onError: (err) => handlers.onError?.(err),
          },
          // The caller may pass an AbortSignal to cancel a running stream.
          { signal: ctx.signal }
        );
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
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
    responder: createProviderResponder(provider),
    label: provider.id,
  };
}

export function useChat(getContext: () => ChatContext): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [responder, setResponder] = useState<MessageResponder>(createStubResponder);
  const [mode, setMode] = useState('stub');
  const abortRef = useRef<AbortController | null>(null);

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

      // Abort any in-flight stream before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatMessage = {
        id: nextMessageId(),
        role: 'user',
        text: trimmed,
        ts: new Date().toISOString(),
      };
      const assistantId = nextMessageId();
      let assistantText = '';
      let errorMarker: string | null = null;

      // Create both messages up front; the assistant starts empty and fills in
      // as deltas stream in.
      setMessages((m) => [
        ...m,
        userMsg,
        { id: assistantId, role: 'assistant', text: '', ts: new Date().toISOString() },
      ]);
      setIsThinking(true);

      const updateAssistant = () => {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, text: assistantText + (errorMarker ?? '') }
              : msg
          )
        );
      };

      const ctx: ChatContext = { ...getContext(), signal: controller.signal };
      try {
        await responder.respond(trimmed, ctx, {
          onDelta: (d) => {
            // EOF marker: empty delta signals the stream finished.
            if (d === '') return;
            assistantText += d;
            updateAssistant();
          },
          onAborted: () => {
            errorMarker = '\n[aborted]';
            updateAssistant();
          },
          onError: (err) => {
            errorMarker = `\n[error: ${err.message}]`;
            updateAssistant();
          },
        });
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