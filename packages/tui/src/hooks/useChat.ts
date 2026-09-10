import { useCallback, useEffect, useRef, useState } from 'react';
import { ProviderManager } from '@absolute/providers';
import type { LLMMessage } from '@absolute/providers';
import { recordSwitchFeedback as recordSwitchFeedbackCore } from '@absolute/core';
import type { AbsoluteDatabase, EmbeddingProvider, Goal } from '@absolute/core';
import type { ChatMessage, ChatContext, MessageResponder } from '../types.js';
import type { AbsoluteConfig } from '../lib/config.js';
import { loadConfig } from '../lib/config.js';
import {
  buildNextMessages,
  detectSessionContext,
  supersedeGoals,
  MAX_HISTORY_TURNS,
  type Exchange,
} from '../lib/memory-pipeline.js';

let counter = 0;
export function nextMessageId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export const STUB_DELAY_MS = 120;

export function createStubResponder(): MessageResponder {
  return {
    async respond(messages, ctx, handlers) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const prompt = lastUser?.content ?? '';
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
// The full message list (system prompt + history + user) is passed through.
function createProviderResponder(
  provider: ReturnType<ProviderManager['resolve']>
): MessageResponder {
  if (!provider) return createStubResponder();
  return {
    async respond(messages, ctx, handlers) {
      try {
        await provider.stream(
          messages,
          {
            onText: (delta) => handlers.onDelta(delta),
            onAborted: () => handlers.onAborted?.(),
            onError: (err) => handlers.onError?.(err),
          },
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
  /** Phase 8 hybrid confirmation: prompt text shown while send() awaits an answer. */
  pendingConfirm: { text: string; goal: Goal } | null;
  /** Resolve an active confirmation: true=still on goal, false=switched, null=dismiss. */
  answerConfirm: (answer: boolean | null) => void;
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

// Map recent on-screen messages to LLM user/assistant turns for continuity.
function historyFromMessages(
  msgs: ChatMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return msgs
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.text.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
}

export interface UseChatOptions {
  /** async-opened core database; enables SYNC detection + ASYNC storage. */
  db?: AbsoluteDatabase | null;
  /** configured embedding provider (createAnyProvider(config)). */
  provider?: EmbeddingProvider | null;
  /** fire-and-forget sink for storing an exchange as a memory (useMemory.store). */
  onExchange?: (exchange: Exchange) => void;
}

export function useChat(
  getContext: () => ChatContext,
  options: UseChatOptions = {}
): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [responder, setResponder] = useState<MessageResponder>(createStubResponder);
  const [mode, setMode] = useState('stub');
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const realResponderRef = useRef(false);
  const configRef = useRef<AbsoluteConfig>({});

  // Phase 8: hybrid confirmation. send() suspends on an 'ask' decision until
  // the user answers y/n/esc; answerConfirm resolves the pending promise.
  const [pendingConfirm, setPendingConfirm] = useState<{ text: string; goal: Goal } | null>(null);
  const confirmResolveRef = useRef<((answer: boolean | null) => void) | null>(null);

  const askConfirm = useCallback((text: string, goal: Goal): Promise<boolean | null> => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setPendingConfirm({ text, goal });
    });
  }, []);

  const answerConfirm = useCallback((answer: boolean | null): void => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setPendingConfirm(null);
    resolve?.(answer);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    configRef.current = loadConfig();
    void resolveResponder().then((resolved) => {
      if (cancelled) return;
      setResponder(() => resolved.responder);
      setMode(resolved.label);
      realResponderRef.current = resolved.label !== 'stub';
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pushSystem = useCallback((text: string) => {
    setMessages((m) => [
      ...m,
      { id: nextMessageId(), role: 'system', text, ts: new Date().toISOString() },
    ]);
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
      const sessionId = ctx.sessionId;

      // [SYNC] detect context before the LLM call and build the message list
      // (system prompt with recalled memories + recent history + user prompt).
      // Phase 8: goal tracking — the pipeline anchors/supersedes goals, and an
      // 'ask' decision suspends here (before any stream starts) for a y/n/esc
      // confirmation of the topic change.
      let llmMessages: LLMMessage[] = [{ role: 'user', content: trimmed }];
      if (options.db && options.provider && sessionId && sessionId !== 'none') {
        const db = options.db;
        const provider = options.provider;
        const config = configRef.current;
        const sync = await detectSessionContext(db, provider, trimmed, sessionId);

        if (sync.goalCreated && sync.goal) {
          const action =
            sync.goalAction === 'switched'
              ? `New goal: ${sync.goal.description}`
              : `Tracking goal: ${sync.goal.description}`;
          pushSystem(action);
        }

        if (sync.decision === 'ask' && sync.goal) {
          const answer = await askConfirm(
            `Still working on "${sync.goal.description}"?`,
            sync.goal
          );
          if (answer === false) {
            // "no, moved on" — confirmed switch: new goal, feed the threshold.
            recordSwitchFeedbackCore(db.db, true);
            const { goal } = await supersedeGoals(db, provider, trimmed, sessionId);
            pushSystem(`Switched to new goal: ${goal.description}`);
          } else if (answer === true) {
            // "yes, still on it" — rejected switch: feed the threshold.
            recordSwitchFeedbackCore(db.db, false);
            pushSystem(`Continuing goal: ${sync.goal.description}`);
          }
          // null (esc) -> continue on the current goal, NO threshold feedback.
        }

        llmMessages = buildNextMessages({
          prompt: trimmed,
          sessionContext: sync.sessionContext,
          relevantMemories: sync.relevantMemories,
          history: historyFromMessages(messagesRef.current),
          providerLabel: mode === 'stub' ? undefined : mode,
          modelLabel: config.model,
          contextNote: sync.note,
        });
      }

      try {
        await responder.respond(llmMessages, ctx, {
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
        // [ASYNC] fire-and-forget storage only for real — not stub — responses
        // that completed without an error marker.
        if (
          realResponderRef.current &&
          !errorMarker &&
          options.onExchange &&
          options.db &&
          sessionId &&
          sessionId !== 'none'
        ) {
          void options.onExchange({ prompt: trimmed, response: assistantText });
        }
      }
    },
    [responder, getContext, options.db, options.provider, options.onExchange, mode, askConfirm, pushSystem]
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, send, clear, pushSystem, isThinking, mode, pendingConfirm, answerConfirm };
}