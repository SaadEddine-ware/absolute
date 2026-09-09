// Shared OpenAI-compatible chat completion client (used by Groq and MiMo).
//
// Both providers expose an OpenAI-shaped /v1/chat/completions endpoint, so a
// single HTTP + SSE parser covers them. We deliberately do NOT use the `openai`
// npm SDK here — these free-tier endpoints are thin and a raw fetch keeps the
// providers package SDK-free for Groq/MiMo.
import {
  getCredential,
} from './credentials.js';
import type { LLMMessage } from './types.js';

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  freeTier: boolean;
}

export class OpenAICompatibleProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultModel: string;
  readonly freeTier: boolean;
  private readonly baseURL: string;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseURL = config.baseURL.replace(/\/$/, '');
    this.defaultModel = config.defaultModel;
    this.freeTier = config.freeTier;
  }

  async isConfigured(): Promise<boolean> {
    return (await getCredential(this.id)) !== null;
  }

  async saveKey(key: string): Promise<void> {
    const { storeCredential } = await import('./credentials.js');
    await storeCredential(this.id, key);
  }

  private async headers(): Promise<Record<string, string>> {
    const key = await getCredential(this.id);
    // Some endpoints are keyless (free tier dev tokens). If none is stored,
    // send the request without an Authorization header.
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
  }

  async complete(
    messages: LLMMessage[],
    opts: { signal?: AbortSignal; model?: string } = {}
  ): Promise<string> {
    const body = {
      model: opts.model ?? this.defaultModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `${this.name} error (${res.status}): ${detail || res.statusText}`
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    return content;
  }

  async stream(
    messages: LLMMessage[],
    handler: {
      onText: (delta: string) => void;
      onAborted?: () => void;
      onError?: (err: Error) => void;
    },
    opts: { signal?: AbortSignal; model?: string } = {}
  ): Promise<void> {
    const body = {
      model: opts.model ?? this.defaultModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };

    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `${this.name} error (${res.status}): ${detail || res.statusText}`
        );
      }
      if (!res.body) {
        throw new Error(`${this.name} returned no body stream`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line || !line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            handler.onText('');
            return;
          }
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) handler.onText(delta);
          } catch {
            // Ignore malformed keep-alive/heartbeat frames.
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        handler.onAborted?.();
        handler.onText('');
        return;
      }
      handler.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}